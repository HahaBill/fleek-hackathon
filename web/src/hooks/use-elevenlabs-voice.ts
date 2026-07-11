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

function scaleVolume(getVolume: () => number) {
  try {
    const rawValue = getVolume() ?? 0;
    return Math.min(1.0, Math.pow(rawValue, 0.5) * 2.5);
  } catch {
    return 0;
  }
}

export function useElevenLabsVoice() {
  const { status, message } = useConversationStatus();
  const { startSession, endSession, getInputVolume, getOutputVolume } =
    useConversationControls();
  const { isMuted, setMuted } = useConversationInput();
  const { mode } = useConversationMode();

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const turnSeq = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const start = useCallback(async () => {
    try {
      setError(null);
      setFeed([]);
      setElapsed(0);
      turnSeq.current = 0;
      await navigator.mediaDevices.getUserMedia({ audio: true });
      startSession({
        connectionType: "webrtc",
        onMessage: ({ message: text, role }) => {
          const speaker = role === "user" ? "buyer" : "agent";
          const key = `${speaker}-${++turnSeq.current}`;
          setFeed((items) => [
            ...items,
            { kind: "turn", key, role: speaker, text, streaming: false },
          ]);
        },
        onError: (msg) => {
          setError(msg);
          toast.error("Couldn't connect.", { description: msg });
        },
        onDisconnect: () => {
          clearTimer();
        },
      });
      clearTimer();
      timerRef.current = setInterval(() => {
        setElapsed((seconds) => seconds + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting conversation:", err);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Please enable microphone permissions in your browser.");
      } else {
        setError("Couldn't start the call. Try again.");
      }
    }
  }, [startSession]);

  const end = useCallback(() => {
    clearTimer();
    endSession();
  }, [endSession]);

  const reset = useCallback(() => {
    if (active) endSession();
    clearTimer();
    setFeed([]);
    setElapsed(0);
    setError(null);
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
    start,
    end,
    reset,
    toggleMute,
    scaledInputVolume,
    scaledOutputVolume,
  };
}
