"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

import type { FieldChipState, FieldName } from "@/lib/contracts";
import { CHIP_ORDER, FIELD_LABELS } from "@/lib/fields";
import { cn } from "@/lib/utils";

/**
 * The qualification state machine, made visible. Chips flip from pending to
 * captured in real time as the deterministic core fills fields. This is a
 * deliberate demo beat, so the transition is given a little theatre.
 */
export function ChipsRow({ chips }: { chips: FieldChipState[] }) {
  const byField = new Map<FieldName, FieldChipState>(chips.map((c) => [c.field, c]));
  const ordered = CHIP_ORDER.map(
    (field) => byField.get(field) ?? { field, state: "pending" as const }
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((chip) => {
        const captured = chip.state === "captured";
        return (
          <motion.div
            key={chip.field}
            layout
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              captured
                ? "border-fleek/30 bg-fleek/[0.08] text-foreground"
                : "border-dashed border-border text-muted-foreground"
            )}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {FIELD_LABELS[chip.field]}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              {captured ? (
                <motion.span
                  key="value"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-1 font-medium"
                >
                  <Check className="size-3 text-fleek" strokeWidth={2.5} />
                  {chip.value}
                </motion.span>
              ) : (
                <motion.span key="pending" className="text-muted-foreground/70">
                  &hellip;
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
