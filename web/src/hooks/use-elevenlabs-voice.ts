"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import { toast } from "sonner";

import type { AgentUiState, FeedItem } from "@/hooks/use-call";
import type { LeadRecord } from "@/lib/contracts";

function scaleVolume(getVolume: () => number) {
  try {
    const rawValue = getVolume() ?? 0;
    return Math.min(1.0, Math.pow(rawValue, 0.5) * 2.5);
  } catch {
    return 0;
  }
}

/** After the call: composing = summary agent writing; summary = card ready. */
export type VoicePhase = "idle" | "in_call" | "composing" | "summary";

export interface VoiceSummary {
  lead: LeadRecord;
  prose: string;
  insights: string[];
}

/** Rendered only if /api/voice-summary is unreachable — the card never blocks. */
const FALLBACK_LEAD: LeadRecord = {
  leadId: "lead_voice_fallback",
  contact: {},
  requirements: { categories: [], brands: [] },
  questions: [],
  unknownFields: ["contact", "category", "quantity"],
  status: "unresolved",
  recommendedNextAction: "Review the transcript — the summary service was unreachable.",
  guardrailEvents: [],
};

export function useElevenLabsVoice() {
  const { status, message } = useConversationStatus();
  const { startSession, endSession, getInputVolume, getOutputVolume } =
    useConversationControls();
  const { isMuted, setMuted } = useConversationInput();
  const { mode } = useConversationMode();

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [summary, setSummary] = useState<VoiceSummary | null>(null);
  const turnSeq = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef = useRef<FeedItem[]>([]);
  const composedRef = useRef(false);
  const generationRef = useRef(0);

  const active = status === "connected" || status === "connecting";

  const agent: AgentUiState =
    status === "connecting"
      ? null
      : mode === "speaking"
        ? "talking"
        : "listening";

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  /**
   * Runs once per call, whoever ends it (user hang-up or agent disconnect):
   * replay the transcript through the deterministic qualification core and
   * the summary agent server-side, then land on the summary card. Falls back
   * to a minimal unresolved card if the route is unreachable.
   */
  const compose = useCallback(async () => {
    if (composedRef.current) return;
    composedRef.current = true;

    const transcript = feedRef.current.flatMap((f) =>
      f.kind === "turn" ? [{ role: f.role, text: f.text }] : []
    );
    if (transcript.length === 0) {
      setPhase("idle");
      return;
    }

    const generation = generationRef.current;
    setPhase("composing");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("/api/voice-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const out: VoiceSummary = await res.json();
      if (generationRef.current !== generation) return;
      setSummary({ lead: out.lead, prose: out.prose, insights: out.insights ?? [] });
      setPhase("summary");
    } catch {
      if (generationRef.current !== generation) return;
      setSummary({
        lead: FALLBACK_LEAD,
        prose: "The call ended, but the summary service couldn't be reached. The transcript is available below.",
        insights: [],
      });
      setPhase("summary");
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setFeed([]);
      setElapsed(0);
      setSummary(null);
      turnSeq.current = 0;
      feedRef.current = [];
      composedRef.current = false;
      generationRef.current += 1;
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setPhase("in_call");
      startSession({
        connectionType: "webrtc",
        onMessage: ({ message: text, role }) => {
          const speaker = role === "user" ? "buyer" : "agent";
          const key = `${speaker}-${++turnSeq.current}`;
          const item: FeedItem = { kind: "turn", key, role: speaker, text, streaming: false };
          feedRef.current = [...feedRef.current, item];
          setFeed((items) => [...items, item]);
        },
        onError: (msg) => {
          setError(msg);
          toast.error("Couldn't connect.", { description: msg });
        },
        onDisconnect: () => {
          // Fires for BOTH user hang-up and agent-initiated call end.
          clearTimer();
          void compose();
        },
      });
      clearTimer();
      timerRef.current = setInterval(() => {
        setElapsed((seconds) => seconds + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting conversation:", err);
      setPhase("idle");
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Please enable microphone permissions in your browser.");
      } else {
        setError("Couldn't start the call. Try again.");
      }
    }
  }, [startSession, compose]);

  const end = useCallback(() => {
    clearTimer();
    endSession();
    void compose();
  }, [endSession, compose]);

  const reset = useCallback(() => {
    if (active) endSession();
    clearTimer();
    generationRef.current += 1;
    composedRef.current = false;
    feedRef.current = [];
    setFeed([]);
    setElapsed(0);
    setError(null);
    setSummary(null);
    setPhase("idle");
    turnSeq.current = 0;
  }, [active, endSession]);

  const toggleMute = useCallback(() => {
    setMuted(!isMuted);
  }, [isMuted, setMuted]);

  const scaledInputVolume = useCallback(
    () => scaleVolume(getInputVolume),
    [getInputVolume]
  );

  const scaledOutputVolume = useCallback(
    () => scaleVolume(getOutputVolume),
    [getOutputVolume]
  );

  useEffect(() => {
    if (status === "error" && message) {
      setError(message);
    }
  }, [status, message]);

  useEffect(() => () => clearTimer(), []);

  return {
    status,
    active,
    error,
    feed,
    elapsed,
    agent,
    muted: isMuted,
    phase,
    summary,
    start,
    end,
    reset,
    toggleMute,
    scaledInputVolume,
    scaledOutputVolume,
  };
}
