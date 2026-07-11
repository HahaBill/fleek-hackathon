"use client";

import dynamic from "next/dynamic";
import { Mic, MicOff, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import type { AgentUiState, CallState } from "@/hooks/use-call";
import { formatTimer } from "@/lib/fields";
import { cn } from "@/lib/utils";
import { ChipsRow } from "./chips-row";
import { SupplierHeader } from "./supplier-header";
import { TextComposer } from "./text-composer";
import { Transcript } from "./transcript";

const Orb = dynamic(() => import("@/components/ui/orb").then((m) => m.Orb), {
  ssr: false,
  loading: () => <div className="size-full rounded-full orb-glow" />,
});

const CLAY: [string, string] = ["#E7A86A", "#C1743F"];

const AGENT_LABEL: Record<NonNullable<AgentUiState> | "idle", string> = {
  thinking: "Thinking",
  listening: "Listening",
  talking: "Speaking",
  idle: "Connecting",
};

export function CallScreen({
  state,
  onMute,
  onEnd,
  onSend,
}: {
  state: CallState;
  onMute: () => void;
  onEnd: () => void;
  onSend: (text: string) => void;
}) {
  const label = AGENT_LABEL[state.agent ?? "idle"];

  return (
    <div className="flex h-full w-full max-w-xl flex-col gap-4 animate-rise">
      {/* Header: identity + live status + timer */}
      <div className="flex items-center justify-between">
        <SupplierHeader status="On a call" />
        <div className="flex items-center gap-2 text-right">
          <span className="size-1.5 animate-pulse rounded-full bg-status-handoff" />
          <span className="font-numeric text-lg tabular-nums text-foreground">
            {formatTimer(state.elapsed)}
          </span>
        </div>
      </div>

      {/* Voice presence */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/40 px-4 py-3">
        <div className="relative size-11 shrink-0">
          <div className="absolute inset-0 orb-glow scale-150" aria-hidden />
          <Orb colors={CLAY} agentState={state.agent} className="size-11" />
        </div>
        <ShimmeringText
          key={label}
          text={label}
          className="text-sm"
          duration={1.6}
        />
      </div>

      {/* Transcript, kept compact */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/20">
        <div className="h-full max-h-[38vh]">
          <Transcript feed={state.feed} />
        </div>
      </div>

      {/* State machine, made visible */}
      <ChipsRow chips={state.chips} />

      {/* Controls */}
      {state.mode === "text" ? (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TextComposer onSend={onSend} />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onEnd}
            aria-label="End call"
            className="size-11 shrink-0 rounded-full border-status-handoff/40 text-status-handoff hover:bg-status-handoff/10 hover:text-status-handoff"
          >
            <PhoneOff className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onMute}
            aria-label={state.muted ? "Unmute" : "Mute"}
            className={cn(
              "size-12 rounded-full",
              state.muted && "border-clay/40 bg-clay/10 text-clay"
            )}
          >
            {state.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </Button>
          <Button
            onClick={onEnd}
            className="h-12 gap-2 rounded-full bg-status-handoff px-6 font-medium text-white hover:bg-status-handoff/90"
          >
            <PhoneOff className="size-5" />
            End call
          </Button>
        </div>
      )}
    </div>
  );
}
