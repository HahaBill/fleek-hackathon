"use client";

import { useEffect } from "react";

import { useCall } from "@/hooks/use-call";
import type { FixtureName } from "@/lib/transport";
import { CallScreen } from "./call-screen";
import { IdleScreen } from "./idle-screen";
import { SummaryCard } from "./summary-card";

/**
 * Orchestrates the single screen across its three states. All call logic lives
 * in `useCall`; this component only maps phase to view and wires demo
 * conveniences (Esc to hang up, and a `?fixture=demo|unresolved&autoplay=1`
 * param that auto-runs the mock as fallback rung 3).
 */
export function CallApp() {
  const { state, start, sendText, toggleMute, end, reset } = useCall();

  // Autoplay from the URL, once, on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoplay") === "1") {
      const fixture = (params.get("fixture") as FixtureName) ?? "demo";
      start("voice", fixture === "unresolved" ? "unresolved" : "demo");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc hangs up during a live call (demo convenience).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.phase === "in_call") end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, end]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-5 py-10">
      {state.phase === "idle" && (
        <IdleScreen onCall={() => start("voice")} onText={() => start("text")} />
      )}

      {state.phase === "in_call" && (
        <CallScreen
          state={state}
          onMute={toggleMute}
          onEnd={end}
          onBack={reset}
          onSend={sendText}
        />
      )}

      {state.phase === "summary" && state.lead && (
        <SummaryCard
          lead={state.lead}
          prose={state.prose}
          insights={state.insights}
          feed={state.feed}
          onNewCall={reset}
        />
      )}
    </main>
  );
}
