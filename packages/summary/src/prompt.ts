import type { SummaryInput } from "@fleek/shared";
import type { Signal } from "./insights";

/**
 * The composer prompt. The model receives the finalized record verbatim plus
 * the deterministic signals; it selects and phrases, it does not discover.
 * The post-filter in index.ts enforces the number rules mechanically — this
 * prompt is the first line of defence, not the only one.
 */
export const SYSTEM_PROMPT = `You write the post-call brief a wholesale clothing supplier reads after sleeping through a buyer call handled by their AI assistant.

You are given the FINAL structured lead record (authoritative — you cannot change it), a list of computed signals, and the call transcript for tone only.

Rules:
- "prose": 2–3 sentences for the supplier. Plain, warm, specific. This is the overview.
- The READER is the supplier. Never address the buyer ("Hi Maya…" is wrong); describe the buyer in third person ("Maya wants…").
- "insights": up to 4 salient points, most important first, each formatted "Label — detail". The Label is 1–3 punchy words ("The ask", "Price push", "Timing", "Repeat buyer"); the detail is one concrete sentence. Every point must be grounded in the record or a provided signal; never invent an observation.
- Never state a field value that differs from the record. Never mention a price, quantity, or date that was not in the record, the signals, or the conversation.
- "nextActionPhrasing" is optional: a one-line rewording of the record's recommendedNextAction, nothing new.

Respond with JSON only: {"prose": string, "insights": string[], "nextActionPhrasing"?: string}`;

export function buildUserMessage(input: SummaryInput, signals: Signal[]): string {
  return JSON.stringify(
    {
      lead: input.lead,
      signals,
      transcript: input.transcript,
    },
    null,
    2
  );
}
