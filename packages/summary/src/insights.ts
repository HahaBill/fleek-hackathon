import type { SummaryInput } from "@fleek/shared";
import { extractNumericTokens } from "./numbers";

/**
 * Deterministic insight signals computed from the finalized lead, the event
 * list, and the transcript — no LLM. The composer's model may only select and
 * phrase these; it never discovers its own. Each signal carries the evidence
 * string that grounds it (evidence numbers join the provenance allowlist).
 */
export type SignalId =
  | "escalation_fired"
  | "deadline"
  | "quantity_vs_moq"
  | "upsell_volume"
  | "missing_fields"
  | "repeat_contact"
  | "language_switch";

export interface Signal {
  id: SignalId;
  evidence: string;
}

const REPEAT_HINTS = /\b(again|last (?:time|order|batch|shipment)|restock|reorder|previous order|as usual|ordered from you)\b/i;
const NON_LATIN_SCRIPT = /[؀-ۿऀ-ॿ]/; // Arabic/Urdu + Devanagari

export function computeSignals(input: SummaryInput): Signal[] {
  const { lead, transcript, events } = input;
  const signals: Signal[] = [];
  const buyerTurns = transcript.filter((t) => t.role === "buyer");
  const agentTurns = transcript.filter((t) => t.role === "agent");

  if (lead.escalation) {
    signals.push({
      id: "escalation_fired",
      evidence: `${lead.escalation.reason}: ${lead.escalation.context}`,
    });
  } else {
    const escalated = events.find((e) => e.kind === "escalation");
    if (escalated) signals.push({ id: "escalation_fired", evidence: escalated.detail });
  }

  const quantity = lead.requirements.quantity;
  if (quantity !== undefined) {
    // Larger volume mentioned by the buyer (or in escalation context) than the
    // quantity on the lead — an upsell conversation worth flagging.
    const mentioned = [
      ...buyerTurns.flatMap((t) => extractNumericTokens(t.text)),
      ...(lead.escalation ? extractNumericTokens(lead.escalation.context) : []),
    ];
    const larger = mentioned.filter((n) => Number.isInteger(n) && n > quantity && n < 100_000);
    if (larger.length > 0) {
      signals.push({
        id: "upsell_volume",
        evidence: `Buyer mentioned ${Math.max(...larger)} pieces, above the ${quantity} on the lead`,
      });
    }

    // MOQ stated by the agent this call (always sourced from a tool result).
    for (const t of agentTurns) {
      const m = t.text.match(/minimum order (?:of )?(\d[\d,]*)|MOQ (?:of |is )?(\d[\d,]*)/i);
      if (m) {
        const moq = Number.parseFloat((m[1] ?? m[2]).replaceAll(",", ""));
        signals.push({
          id: "quantity_vs_moq",
          evidence:
            quantity >= moq
              ? `Quantity ${quantity} clears the stated minimum order of ${moq}`
              : `Quantity ${quantity} is below the stated minimum order of ${moq}`,
        });
        break;
      }
    }
  }

  if (lead.requirements.timeframe) {
    signals.push({ id: "deadline", evidence: `Deadline: ${lead.requirements.timeframe}` });
  }

  const repeat = buyerTurns.find((t) => REPEAT_HINTS.test(t.text));
  if (repeat) {
    signals.push({
      id: "repeat_contact",
      evidence: `Buyer sounds like a repeat customer: "${repeat.text.slice(0, 80)}"`,
    });
  }

  if (buyerTurns.some((t) => NON_LATIN_SCRIPT.test(t.text))) {
    signals.push({ id: "language_switch", evidence: "Buyer switched to Hindi/Urdu mid-call" });
  }

  if (lead.unknownFields.length > 0) {
    signals.push({
      id: "missing_fields",
      evidence: `Still missing: ${lead.unknownFields.join(", ")}`,
    });
  }

  return signals;
}
