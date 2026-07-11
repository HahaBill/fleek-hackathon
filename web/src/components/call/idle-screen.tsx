"use client";

import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Orb } from "@/components/ui/orb";
import { ORB_COLORS } from "./supplier-header";

/**
 * State A. A single living orb, who you're calling, one calm line, and one
 * primary action. Everything else is whitespace.
 */
export function IdleScreen({
  onCall,
  onText,
}: {
  onCall: () => void;
  onText: () => void;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center animate-rise">
      <div className="size-36">
        <Orb className="h-full w-full" colors={ORB_COLORS} />
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-status-qualified" aria-hidden />
          Karachi Vintage Co. · online
        </p>
        <h1 className="text-2xl font-semibold leading-snug tracking-tight text-foreground text-balance">
          Get a quote while they&apos;re still asleep
        </h1>
      </div>

      <div className="flex w-full flex-col items-center gap-4">
        <Button
          onClick={onCall}
          className="h-11 w-full max-w-xs gap-2 rounded-full text-sm font-medium"
        >
          <Phone className="size-4" />
          Call supplier
        </Button>

        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Answered by an AI assistant and transcribed.
        </p>

        <button
          onClick={onText}
          className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Type instead
        </button>
      </div>
    </div>
  );
}
