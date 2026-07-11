import { Orb, type AgentState } from "@/components/ui/orb";
import { cn } from "@/lib/utils";

/** Fleek gold, as the orb's only expression of brand. Darker stop first. */
export const ORB_COLORS: [string, string] = ["#C68A16", "#F7CE5B"];

/**
 * Supplier identity, shown across all three states so the buyer always knows
 * who they've reached. A small living orb avatar (ElevenLabs-style) inside a
 * hairline ring, a quiet name, and one status line.
 */
export function SupplierHeader({
  className,
  status = "Answered 24/7 by an AI assistant",
  agentState = null,
  online = true,
}: {
  className?: string;
  status?: string;
  agentState?: AgentState;
  online?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
        <Orb className="h-full w-full" colors={ORB_COLORS} agentState={agentState} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight text-foreground">
          Karachi Vintage Co.
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {online && (
            <span className="size-1.5 rounded-full bg-status-qualified" aria-hidden />
          )}
          {status}
        </p>
      </div>
    </div>
  );
}
