import { cn } from "@/lib/utils";

/**
 * Supplier identity, shown across all three states so the buyer always knows
 * who they've reached. Kept quiet: a monogram, a name, and one status line.
 */
export function SupplierHeader({
  className,
  status = "Answered 24/7 by an AI assistant",
}: {
  className?: string;
  status?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-clay/30 font-serif text-sm font-medium text-clay"
        style={{
          background:
            "radial-gradient(120% 120% at 30% 20%, oklch(0.32 0.06 55) 0%, oklch(0.2 0.02 50) 70%)",
        }}
        aria-hidden
      >
        KV
      </div>
      <div className="min-w-0">
        <p className="font-serif text-[0.95rem] leading-tight text-foreground">
          Karachi Vintage Co.
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-status-qualified" />
          {status}
        </p>
      </div>
    </div>
  );
}
