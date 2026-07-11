"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  AgentEvent,
  FieldChipState,
  LeadRecord,
  SessionTransport,
} from "@/lib/contracts";
import { createTransport, type FixtureName } from "@/lib/transport";

export type CallPhase = "idle" | "in_call" | "composing" | "summary";
export type CallMode = "voice" | "text";

/** Orb / ambience state, derived from the event stream (not on the wire). */
export type AgentUiState = "thinking" | "listening" | "talking" | null;

/** One item in the live transcript, in arrival order. */
export type FeedItem =
  | { kind: "turn"; key: string; role: "buyer" | "agent"; text: string; streaming: boolean }
  | { kind: "tool"; key: string; tool: string; summary: string }
  | { kind: "guardrail"; key: string; variant: "escalation" | "unprovenanced_number"; detail: string };

export interface CallState {
  phase: CallPhase;
  mode: CallMode;
  feed: FeedItem[];
  chips: FieldChipState[];
  agent: AgentUiState;
  lead: LeadRecord | null;
  prose: string;
  insights: string[];
  sections?: { title: string; points: string[] }[];
  elapsed: number;
  muted: boolean;
  /** Transport's summary, held while the real composer runs (fallback copy). */
  pending: { lead: LeadRecord; prose: string; insights: string[] } | null;
}

const INITIAL: CallState = {
  phase: "idle",
  mode: "voice",
  feed: [],
  chips: [],
  agent: null,
  lead: null,
  prose: "",
  insights: [],
  elapsed: 0,
  muted: false,
  pending: null,
};

let toolSeq = 0;
let guardSeq = 0;

export function useCall() {
  const [state, setState] = useState<CallState>(INITIAL);
  const transportRef = useRef<SessionTransport | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const apply = useCallback((e: AgentEvent) => {
    setState((s) => {
      switch (e.type) {
        case "session.started":
          return { ...s, phase: "in_call", mode: e.mode, agent: "listening" };

        case "turn": {
          const key = `${e.role}-${e.turnIndex}`;
          const idx = s.feed.findIndex((f) => f.kind === "turn" && f.key === key);
          const item: FeedItem = {
            kind: "turn",
            key,
            role: e.role,
            text: e.text,
            streaming: !e.final,
          };
          const feed =
            idx === -1
              ? [...s.feed, item]
              : s.feed.map((f, i) => (i === idx ? item : f));
          const agent: AgentUiState =
            e.role === "buyer" ? "thinking" : e.final ? "listening" : "talking";
          return { ...s, feed, agent };
        }

        case "tool.result": {
          const item: FeedItem = {
            kind: "tool",
            key: `tool-${++toolSeq}`,
            tool: e.tool,
            summary: e.summary,
          };
          return { ...s, feed: [...s.feed, item], agent: "thinking" };
        }

        case "guardrail": {
          const item: FeedItem = {
            kind: "guardrail",
            key: `guard-${++guardSeq}`,
            variant: e.kind,
            detail: e.detail,
          };
          return { ...s, feed: [...s.feed, item] };
        }

        case "chips":
          return { ...s, chips: e.chips };

        case "call.ended":
          if (e.endedBy === "error") {
            return s; // handled by fail() below
          }
          // The record is final; the summary agent is now writing the prose.
          return { ...s, phase: "composing", agent: null };

        case "summary.ready":
          // The transport's lead is authoritative. Hold its prose/insights as
          // the fallback while the real composer runs (effect below).
          return {
            ...s,
            phase: "composing",
            agent: null,
            pending: { lead: e.lead, prose: e.prose, insights: e.insights ?? [] },
          };

        default:
          return s;
      }
    });

    if (e.type === "call.ended" && e.endedBy === "error") {
      toast.error("Couldn't connect.", { description: "Try text mode instead." });
      setState(INITIAL);
    }
  }, []);

  const teardown = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    transportRef.current = null;
    clearTimer();
  }, []);

  const start = useCallback(
    (mode: CallMode, fixture: FixtureName = "demo") => {
      teardown();
      toolSeq = 0;
      guardSeq = 0;
      setState({ ...INITIAL, phase: "in_call", mode });

      const transport = createTransport(fixture);
      transportRef.current = transport;
      unsubRef.current = transport.onEvent(apply);

      clearTimer();
      timerRef.current = setInterval(() => {
        setState((s) => (s.phase === "in_call" ? { ...s, elapsed: s.elapsed + 1 } : s));
      }, 1000);

      void transport.start(mode);
    },
    [apply, teardown]
  );

  const sendText = useCallback((text: string) => {
    transportRef.current?.sendText(text);
  }, []);

  const toggleMute = useCallback(() => {
    setState((s) => {
      const muted = !s.muted;
      transportRef.current?.setMuted?.(muted);
      return { ...s, muted };
    });
  }, []);

  const end = useCallback(() => {
    clearTimer();
    transportRef.current?.end();
  }, []);

  const reset = useCallback(() => {
    teardown();
    setState(INITIAL);
  }, [teardown]);

  useEffect(() => {
    if (state.phase !== "in_call") clearTimer();
  }, [state.phase]);

  // Run the real summary agent (packages/summary, via /api/summary) over the
  // finalized record. Stopgap until the voice server composes summary.ready
  // itself (plans/02 §7) — delete this effect at that checkpoint. On any
  // failure or a 10s timeout the transport's own prose renders instead; the
  // card is never blocked by the composer.
  useEffect(() => {
    const pending = state.pending;
    if (state.phase !== "composing" || !pending) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    const finish = (
      prose: string,
      insights: string[],
      sections?: { title: string; points: string[] }[]
    ) => {
      if (cancelled) return;
      setState((s) =>
        s.phase !== "composing"
          ? s
          : { ...s, phase: "summary", lead: pending.lead, prose, insights, sections, pending: null }
      );
    };

    const transcript = state.feed.flatMap((f) =>
      f.kind === "turn" ? [{ role: f.role, text: f.text }] : []
    );
    const events = state.feed.flatMap((f) =>
      f.kind === "guardrail" ? [{ kind: f.variant, detail: f.detail }] : []
    );

    fetch("/api/summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lead: pending.lead, transcript, events }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((out: { prose: string; insights?: string[]; sections?: { title: string; points: string[] }[] }) =>
        finish(out.prose, out.insights ?? [], out.sections)
      )
      .catch(() => finish(pending.prose, pending.insights))
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [state.phase, state.pending, state.feed]);

  useEffect(() => () => teardown(), [teardown]);

  return { state, start, sendText, toggleMute, end, reset };
}
