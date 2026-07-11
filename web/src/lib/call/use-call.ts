"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createCallSource } from "./source";
import type {
  CallEvent,
  CallMode,
  CallSource,
  LeadField,
  LeadRecord,
  LeadStatus,
  Role,
} from "./types";

export type CallPhase = "idle" | "in_call" | "summary";

export type AgentState = "thinking" | "listening" | "talking" | null;

/** A single item in the live transcript stream, in arrival order. */
export type FeedItem =
  | { kind: "turn"; id: string; role: Role; text: string }
  | { kind: "tool"; id: string; tool: string; detail: string }
  | { kind: "escalation"; id: string; reason: string };

export interface CallState {
  phase: CallPhase;
  mode: CallMode;
  feed: FeedItem[];
  fields: Partial<Record<LeadField, string>>;
  agentState: AgentState;
  status: LeadStatus;
  lead: LeadRecord | null;
  elapsed: number;
}

const INITIAL: CallState = {
  phase: "idle",
  mode: "voice",
  feed: [],
  fields: {},
  agentState: null,
  status: "in_progress",
  lead: null,
  elapsed: 0,
};

let feedSeq = 0;

export function useCall() {
  const [state, setState] = useState<CallState>(INITIAL);
  const sourceRef = useRef<CallSource | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleEvent = useCallback((event: CallEvent) => {
    setState((s) => {
      switch (event.type) {
        case "session.started":
          return { ...s, phase: "in_call", mode: event.mode };
        case "agent.state":
          return { ...s, agentState: event.state };
        case "turn":
          return {
            ...s,
            feed: [
              ...s.feed,
              { kind: "turn", id: event.id, role: event.role, text: event.text },
            ],
          };
        case "tool":
          return {
            ...s,
            feed: [
              ...s.feed,
              {
                kind: "tool",
                id: `tool-${++feedSeq}`,
                tool: event.tool,
                detail: event.detail,
              },
            ],
          };
        case "escalation":
          return {
            ...s,
            feed: [
              ...s.feed,
              { kind: "escalation", id: `esc-${++feedSeq}`, reason: event.reason },
            ],
          };
        case "field":
          return {
            ...s,
            fields: { ...s.fields, [event.field]: event.value },
          };
        case "status":
          return { ...s, status: event.status };
        case "session.ended":
          endedRef.current = true;
          return {
            ...s,
            phase: "summary",
            agentState: null,
            status: event.lead.status,
            lead: event.lead,
          };
        default:
          return s;
      }
    });
  }, []);

  const teardownSource = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    sourceRef.current = null;
    clearTimer();
  }, []);

  const start = useCallback(
    (mode: CallMode) => {
      // Fresh source per session so timers and script position reset cleanly.
      teardownSource();
      endedRef.current = false;
      feedSeq = 0;
      setState({ ...INITIAL, phase: "in_call", mode });

      const source = createCallSource();
      sourceRef.current = source;
      unsubRef.current = source.subscribe(handleEvent);

      clearTimer();
      timerRef.current = setInterval(() => {
        setState((s) =>
          s.phase === "in_call" ? { ...s, elapsed: s.elapsed + 1 } : s
        );
      }, 1000);

      source.start(mode);
    },
    [handleEvent, teardownSource]
  );

  const sendText = useCallback((text: string) => {
    sourceRef.current?.sendText(text);
  }, []);

  /** Buyer hangs up before the call completes on its own. */
  const end = useCallback(() => {
    clearTimer();
    if (!endedRef.current) sourceRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    teardownSource();
    endedRef.current = false;
    setState(INITIAL);
  }, [teardownSource]);

  // Stop the timer once the call is no longer live.
  useEffect(() => {
    if (state.phase !== "in_call") clearTimer();
  }, [state.phase]);

  // Clean up on unmount.
  useEffect(() => () => teardownSource(), [teardownSource]);

  // Optional hook for surfacing a connection failure toast from the source
  // layer later; kept here so the call site stays stable.
  const fail = useCallback(() => {
    toast.error("Couldn't connect.", { description: "Try text mode instead." });
    reset();
  }, [reset]);

  return { state, start, sendText, end, reset, fail };
}
