"use client";

import { useEffect } from "react";

import { useCall } from "@/hooks/use-call";
import { useElevenLabsVoice } from "@/hooks/use-elevenlabs-voice";
import type { FixtureName } from "@/lib/transport";
import { CallScreen } from "./call-screen";
import { ComposingScreen } from "./composing-screen";
import { IdleScreen } from "./idle-screen";
import { SummaryCard } from "./summary-card";

/**
 * Orchestrates the single screen across its three states. Text mode and demo
 * fixtures use `useCall`; live voice uses the ElevenLabs agent via
 * `useElevenLabsVoice`.
 */
export function CallApp() {
  const { state, start, sendText, toggleMute, end, reset } = useCall();
  const voice = useElevenLabsVoice();

  const inVoiceCall = voice.active && voice.phase === "in_call";
  const inTextCall = state.phase === "in_call" && state.mode === "text";
  // After a voice call the post-call flow lives in the voice hook (composing
  // -> summary), mirroring useCall's phases for the text/mock path.
  const voicePostCall = voice.phase === "composing" || voice.phase === "summary";

  // Autoplay from the URL, once, on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoplay") === "1") {
      const fixture = (params.get("fixture") as FixtureName) ?? "demo";
      if (params.get("mode") === "text") {
        start("text", fixture === "unresolved" ? "unresolved" : "demo");
      } else {
        void voice.start();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc hangs up during a live call (demo convenience).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (inVoiceCall) voice.end();
        else if (inTextCall) end();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inVoiceCall, inTextCall, voice, end]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-5 py-10">
      {state.phase === "idle" && !inVoiceCall && !voicePostCall && (
        <IdleScreen
          onCall={() => void voice.start()}
          onText={() => start("text")}
          error={voice.error}
        />
      )}

      {inVoiceCall && (
        <CallScreen
          state={{
            phase: "in_call",
            mode: "voice",
            feed: voice.feed,
            chips: [],
            agent: voice.agent,
            lead: null,
            prose: "",
            insights: [],
            elapsed: voice.elapsed,
            muted: voice.muted,
            pending: null,
          }}
          onMute={voice.toggleMute}
          onEnd={voice.end}
          onBack={voice.reset}
          onSend={() => {}}
          orbVolume={{
            getInputVolume: voice.scaledInputVolume,
            getOutputVolume: voice.scaledOutputVolume,
          }}
        />
      )}

      {inTextCall && (
        <CallScreen
          state={state}
          onMute={toggleMute}
          onEnd={end}
          onBack={reset}
          onSend={sendText}
        />
      )}

      {(state.phase === "composing" || voice.phase === "composing") && <ComposingScreen />}

      {state.phase === "summary" && state.lead && (
        <SummaryCard
          lead={state.lead}
          prose={state.prose}
          insights={state.insights}
          feed={state.feed}
          onNewCall={reset}
        />
      )}

      {voice.phase === "summary" && voice.summary && (
        <SummaryCard
          lead={voice.summary.lead}
          prose={voice.summary.prose}
          insights={voice.summary.insights}
          feed={voice.feed}
          onNewCall={voice.reset}
        />
      )}
    </main>
  );
}
