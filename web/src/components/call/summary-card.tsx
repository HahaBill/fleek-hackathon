"use client";

import { ArrowRight, ChevronDown, Lightbulb, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LeadRecord, LeadStatus } from "@/lib/contracts";
import type { FeedItem } from "@/hooks/use-call";
import { leadGrid, STATUS_LABELS } from "@/lib/fields";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LeadStatus, string> = {
  in_progress: "bg-status-unresolved/15 text-status-unresolved",
  qualified_follow_up: "bg-status-qualified/15 text-status-qualified",
  human_handoff_requested: "bg-status-handoff/15 text-status-handoff",
  unresolved: "bg-status-unresolved/15 text-status-unresolved",
};

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        STATUS_STYLES[status]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * State C. The asynchronous artifact the supplier wakes up to. Every field in
 * the grid comes from `lead` only; the prose is the sole thing the summary
 * agent wrote and it can never introduce a field value.
 */
export function SummaryCard({
  lead,
  prose,
  insights,
  feed,
  onNewCall,
}: {
  lead: LeadRecord;
  prose: string;
  insights: string[];
  feed: FeedItem[];
  onNewCall: () => void;
}) {
  const grid = leadGrid(lead).slice(0, 7);

  return (
    <div className="flex w-full max-w-lg flex-col gap-5 animate-rise">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              New lead
            </p>
            <h2 className="mt-0.5 font-serif text-2xl text-foreground">
              {lead.contact.name ?? "Unknown caller"}
            </h2>
          </div>
          <StatusBadge status={lead.status} />
        </div>

        {/* Field grid — from the state machine record only */}
        <dl className="grid grid-cols-2 gap-px bg-border">
          {grid.map((f) => {
            const empty = f.value === "Not captured";
            return (
              <div key={f.label} className="bg-card px-6 py-3">
                <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 text-sm",
                    empty ? "text-muted-foreground/40" : "text-foreground"
                  )}
                >
                  {f.value}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Prose brief + next action + escalation */}
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-foreground/85 text-balance">{prose}</p>

          {lead.recommendedNextAction && (
            <div className="flex items-start gap-2.5 rounded-xl border border-clay/30 bg-clay/[0.07] px-4 py-3">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-clay" strokeWidth={2.25} />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-clay">
                  Recommended next action
                </p>
                <p className="mt-0.5 text-sm text-foreground">{lead.recommendedNextAction}</p>
              </div>
            </div>
          )}

          {lead.escalation && (
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-handoff" />
              <span>
                <span className="text-status-handoff">Flagged for you: </span>
                {lead.escalation.reason}. {lead.escalation.context}
              </span>
            </div>
          )}

          {insights.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Lightbulb className="size-3" /> Insights
              </p>
              <ul className="flex flex-col gap-1.5">
                {insights.map((it, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="text-clay/60">&bull;</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Transcript fold */}
        {feed.length > 0 && (
          <details className="group border-t border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground">
              View transcript
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="max-h-56 space-y-1.5 overflow-y-auto px-6 pb-4 text-xs">
              {feed
                .filter((f) => f.kind === "turn")
                .map((f) => {
                  const turn = f as Extract<FeedItem, { kind: "turn" }>;
                  return (
                    <p key={turn.key} className="leading-relaxed">
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-wider",
                          turn.role === "buyer" ? "text-foreground/60" : "text-clay/60"
                        )}
                      >
                        {turn.role === "buyer" ? "Buyer" : "Agent"}
                      </span>{" "}
                      <span className="text-muted-foreground">{turn.text}</span>
                    </p>
                  );
                })}
            </div>
          </details>
        )}
      </div>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          onClick={onNewCall}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-4" />
          New call
        </Button>
      </div>
    </div>
  );
}
