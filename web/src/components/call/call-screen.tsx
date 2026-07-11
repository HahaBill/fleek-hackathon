"use client";

import { ChevronLeft, Mic, MicOff, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Orb } from "@/components/ui/orb";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import type { AgentUiState, CallState } from "@/hooks/use-call";
import { formatTimer } from "@/lib/fields";
import { cn } from "@/lib/utils";
import { ChipsRow } from "./chips-row";
import { ORB_COLORS } from "./supplier-header";
import { TextComposer } from "./text-composer";
import { Transcript } from "./transcript";

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
  onBack,
  onSend,
}: {
  state: CallState;
  onMute: () => void;
  onEnd: () => void;
  onBack: () => void;
  onSend: (text: string) => void;
}) {
  const label = AGENT_LABEL[state.agent ?? "idle"];

  return (
    <div className="flex w-full max-w-xl flex-col gap-5 animate-rise">
      {/* Identity + live status + timer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            aria-label="Back to start"
            className="-ml-1 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="relative size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
            <Orb className="h-full w-full" colors={ORB_COLORS} agentState={state.agent} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight text-foreground">
              Karachi Vintage Co.
            </p>
            <ShimmeringText
              key={label}
              text={label}
              className="text-xs"
              duration={1.8}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-status-handoff" aria-hidden />
          <span className="font-numeric text-sm tabular-nums text-foreground">
            {formatTimer(state.elapsed)}
          </span>
        </div>
      </div>

      {/* Transcript, kept compact. Definite height so it scrolls and pins. */}
      <div className="h-[46vh] overflow-hidden rounded-2xl border border-border bg-card/40">
        <Transcript feed={state.feed} />
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
            variant="destructive"
            size="icon"
            onClick={onEnd}
            aria-label="End call"
            className="size-11 shrink-0 rounded-full"
          >
            <PhoneOff className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={onMute}
            aria-label={state.muted ? "Unmute" : "Mute"}
            className={cn(
              "size-11 rounded-full",
              state.muted && "text-muted-foreground"
            )}
          >
            {state.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </Button>
          <Button
            variant="destructive"
            onClick={onEnd}
            className="h-11 gap-2 rounded-full px-6 text-sm font-medium"
          >
            <PhoneOff className="size-4" />
            End call
          </Button>
        </div>
      )}
    </div>
  );
}
