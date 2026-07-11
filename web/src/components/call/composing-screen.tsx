"use client";

import { Orb } from "@/components/ui/orb";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { ORB_COLORS } from "./supplier-header";

/**
 * Between call end and the summary card: the record is already final; the
 * summary agent is writing the supplier-facing prose. Same primitives as the
 * rest of the screen — orb + shimmer, nothing new.
 */
export function ComposingScreen() {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center animate-rise">
      <div className="relative size-16 overflow-hidden rounded-full ring-1 ring-border">
        <Orb className="h-full w-full" colors={ORB_COLORS} agentState="thinking" />
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <ShimmeringText
          text="Writing the supplier's lead summary…"
          className="text-sm font-medium"
          duration={1.8}
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Record locked — the AI only writes the prose
        </p>
      </div>
    </div>
  );
}
