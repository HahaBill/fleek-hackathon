"use client";

import { Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Orb } from "@/components/ui/orb";
import { ORB_COLORS } from "./supplier-header";

/**
 * State A. A large living orb owns the screen, with who you're calling, one
 * calm line, and one primary action. Sized to fill a demo display: the orb
 * scales up on wider viewports so it never feels lost in empty space.
 */
export function IdleScreen({
  onCall,
  onText,
  error,
}: {
  onCall: () => void;
  onText: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex min-h-[88vh] w-full max-w-2xl flex-col items-center justify-center gap-12 text-center animate-rise">
      <div className="flex flex-col items-center gap-8">
        <div className="size-40 sm:size-44 lg:size-52">
          <Orb className="h-full w-full" colors={ORB_COLORS} />
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-status-qualified" aria-hidden />
            Karachi Vintage Co. · online
          </p>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground text-balance sm:text-4xl lg:text-5xl">
            Get a quote while they&apos;re still asleep
          </h1>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-5">
        <Button
          onClick={onCall}
          className="h-12 w-full max-w-sm gap-2.5 rounded-full text-base font-medium"
        >
          <Phone className="size-5" />
          Call supplier
        </Button>

        <p
          className={cn(
            "max-w-xs text-sm leading-relaxed",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {error ?? "Answered by an AI assistant and transcribed."}
        </p>

        <button
          onClick={onText}
          className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Type instead
        </button>
      </div>
    </div>
  );
}
