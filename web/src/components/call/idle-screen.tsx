"use client";

import dynamic from "next/dynamic";
import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SupplierHeader } from "./supplier-header";

// The orb pulls in three.js; load it client-only so it never blocks paint.
const Orb = dynamic(() => import("@/components/ui/orb").then((m) => m.Orb), {
  ssr: false,
  loading: () => <div className="size-full rounded-full orb-glow" />,
});

const CLAY: [string, string] = ["#E7A86A", "#C1743F"];

/**
 * State A. Sparse by design: who you're calling, the orb, one call button, the
 * disclosure, and a quiet way into text mode. Nothing else.
 */
export function IdleScreen({
  onCall,
  onText,
}: {
  onCall: () => void;
  onText: () => void;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-10 animate-rise">
      <SupplierHeader className="self-start" />

      <div className="relative flex size-52 items-center justify-center">
        <div className="absolute inset-0 orb-glow scale-125" aria-hidden />
        <Orb colors={CLAY} className="size-52" />
      </div>

      <div className="flex flex-col items-center gap-4">
        <Button
          size="lg"
          onClick={onCall}
          className="h-12 gap-2.5 rounded-full bg-clay px-8 text-base font-medium text-clay-foreground shadow-[0_8px_30px_-8px] shadow-clay/40 transition-transform hover:scale-[1.02] hover:bg-clay active:scale-95"
        >
          <Phone className="size-4" strokeWidth={2.25} />
          Call supplier
        </Button>

        <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground">
          Calls are answered by an AI assistant and transcribed.
        </p>

        <button
          onClick={onText}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Type instead
        </button>
      </div>
    </div>
  );
}
