"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import { toast } from "sonner";

import { useVoiceSessionTransport } from "@/components/call/voice-session-provider";
import type { AgentUiState, FeedItem } from "@/hooks/use-call";
import type { LeadRecord } from "@/lib/contracts";
import {
  INITIAL_VOICE_SESSION,
  reduceAgentEvent,
  resetVoiceSessionCounters,
  type VoiceSessionState,
} from "@/lib/voice-session";

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
  sections?: { title: string; points: string[] }[];
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
  const transport = useVoiceSessionTransport();
  const { status, message } = useConversationStatus();
  const { startSession, endSession, getInputVolume, getOutputVolume } =
    useConversationControls();
  const { isMuted, setMuted } = useConversationInput();
  const { mode } = useConversationMode();

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [session, setSession] = useState<VoiceSessionState>(INITIAL_VOICE_SESSION);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [summary, setSummary] = useState<VoiceSummary | null>(null);
  const turnSeq = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedRef = useRef<FeedItem[]>([]);
  const composedRef = useRef(false);
  const generationRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);

  const active = status === "connected" || status === "connecting";

  const agent: AgentUiState =
    status === "connecting"
      ? null
      : mode === "speaking"
        ? "talking"
        : "listening";

  const applyServerEvent = useCallback((event: Parameters<typeof reduceAgentEvent>[1]) => {
    setSession((prev) => {
      const { state, feedAppends } = reduceAgentEvent(prev, event);
      if (feedAppends.length > 0) {
        setFeed((items) => [...items, ...feedAppends]);
      }
      return state;
    });
  }, []);

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
    const timer = setTimeout(() => controller.abort(), 25_000);
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
      setSummary({
        lead: out.lead,
        prose: out.prose,
        insights: out.insights ?? [],
        sections: out.sections,
      });
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
      setSession(INITIAL_VOICE_SESSION);
      setElapsed(0);
      setSummary(null);
      turnSeq.current = 0;
      feedRef.current = [];
      composedRef.current = false;
      generationRef.current += 1;
      resetVoiceSessionCounters();

      unsubRef.current?.();
      unsubRef.current = transport.onEvent(applyServerEvent);

      try {
        await transport.start("voice");
      } catch (serverErr) {
        console.warn("Qualification server unavailable, voice-only mode:", serverErr);
        toast.error("Chips won't update — start the server with pnpm dev:server");
      }

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

          if (transport.getSessionId()) {
            void (speaker === "buyer"
              ? transport.noteBuyerTurn(text)
              : transport.noteAgentTurn(text));
          }
        },
        onError: (msg) => {
          setError(msg);
          toast.error("Couldn't connect.", { description: msg });
        },
        onDisconnect: () => {
          clearTimer();
          transport.end();
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
  }, [applyServerEvent, compose, startSession, transport]);

  const end = useCallback(() => {
    clearTimer();
    endSession();
    transport.end();
    void compose();
  }, [compose, endSession, transport]);

  const reset = useCallback(() => {
    if (active) endSession();
    clearTimer();
    generationRef.current += 1;
    composedRef.current = false;
    feedRef.current = [];
    unsubRef.current?.();
    unsubRef.current = null;
    setFeed([]);
    setSession(INITIAL_VOICE_SESSION);
    setElapsed(0);
    setError(null);
    setSummary(null);
    setPhase("idle");
    turnSeq.current = 0;
    resetVoiceSessionCounters();
    transport.end();
  }, [active, endSession, transport]);

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

  useEffect(() => () => {
    clearTimer();
    unsubRef.current?.();
  }, []);

  return {
    status,
    active,
    error,
    feed,
    chips: session.chips,
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
