import type { SummaryInput, SummaryOutput } from "@fleek/shared";
import type { Signal } from "./insights";

/**
 * Deterministic fallback composer — pure string assembly from the record and
 * the computed signals. No API key, no network, grounded by construction.
 * This is both the no-key path and the degrade path when the LLM fails,
 * times out, or invents a number: the payoff card must never hang or lie.
 */
export function composeFromTemplate(input: SummaryInput, signals: Signal[]): SummaryOutput {
  const { lead } = input;
  const r = lead.requirements;
  const name = lead.contact.name ?? "The buyer";
  const contact = lead.contact.method
    ? `${lead.contact.name ? `${lead.contact.name}, ` : ""}reachable at ${lead.contact.method}`
    : undefined;

  const want: string[] = [];
  if (r.quantity !== undefined) want.push(`${r.quantity} pieces`);
  if (r.grade) want.push(r.grade);
  if (r.categories.length > 0) want.push(r.categories.join(", "));
  if (r.brands.length > 0) want.push(`(${r.brands.join(", ")})`);
  const wants = want.length > 0 ? `wants ${want.join(" of ").replace(" of (", " (")}` : "made an enquiry";
  const where = r.destination ? `, shipping to ${r.destination}` : "";
  const when = r.timeframe ? `, needed ${r.timeframe.toLowerCase().startsWith("before") ? r.timeframe.toLowerCase() : `by ${r.timeframe}`}` : "";

  let prose: string;
  switch (lead.status) {
    case "human_handoff_requested": {
      const why = lead.escalation
        ? `${lead.escalation.reason}: ${lead.escalation.context}`
        : "The buyer asked for a human follow-up.";
      const captured = want.length > 0 ? ` ${name} ${wants}${where}${when}.` : "";
      prose = `This call was flagged for you. ${why}${captured}${contact ? ` Contact: ${contact}.` : ""}`;
      break;
    }
    case "qualified_follow_up": {
      prose = `${name} ${wants}${where}${when}. The request was confirmed on the call.${contact ? ` Contact: ${contact}.` : ""}`;
      break;
    }
    default: {
      const missing = lead.unknownFields.length > 0 ? ` Still missing: ${lead.unknownFields.join(", ")}.` : "";
      prose = `The call ended before the enquiry could be qualified.${want.length > 0 ? ` Captured so far: ${want.join(", ")}${where}${when}.` : ""}${missing}`;
    }
  }

  // "Label — detail" so the card can render Granola-style key points.
  const PHRASING: Record<Signal["id"], (s: Signal) => string> = {
    escalation_fired: (s) => `Flagged — ${s.evidence}`,
    upsell_volume: (s) => `Upsell — ${s.evidence}`,
    deadline: (s) => `Timing — ${s.evidence.replace(/^Deadline: /, "needed ")}`,
    quantity_vs_moq: (s) => `MOQ — ${s.evidence}`,
    repeat_contact: (s) => `Repeat buyer — ${s.evidence.replace(/^Buyer sounds like a repeat customer: /, "")}`,
    language_switch: (s) => `Language — ${s.evidence}`,
    missing_fields: (s) => `Still missing — ${s.evidence.replace(/^Still missing: /, "")}`,
  };
  const ORDER: Signal["id"][] = [
    "escalation_fired",
    "upsell_volume",
    "deadline",
    "repeat_contact",
    "quantity_vs_moq",
    "language_switch",
    "missing_fields",
  ];
  const insights = ORDER.flatMap((id) => signals.filter((s) => s.id === id))
    .map((s) => PHRASING[s.id](s))
    .slice(0, 4);

  // Deterministic titled sections, same shape the LLM produces — the card
  // renders identically whichever composer ran.
  const bySignal = (ids: Signal["id"][]) =>
    ORDER.filter((id) => ids.includes(id)).flatMap((id) => signals.filter((s) => s.id === id));

  const sections: NonNullable<SummaryOutput["sections"]> = [];
  const wantPoints: string[] = [];
  if (want.length > 0) wantPoints.push(`${want.join(" of ").replace(" of (", " (")}${where}${when}`);
  if (contact) wantPoints.push(`Contact: ${contact}`);
  if (wantPoints.length > 0) sections.push({ title: "What the buyer wants", points: wantPoints });

  const commercials = bySignal(["escalation_fired", "upsell_volume", "quantity_vs_moq"]).map((s) => s.evidence);
  if (commercials.length > 0) sections.push({ title: "Commercials", points: commercials.slice(0, 3) });

  const timing = bySignal(["deadline"]).map((s) => s.evidence);
  if (timing.length > 0) sections.push({ title: "Timing", points: timing });

  const notes = bySignal(["repeat_contact", "language_switch", "missing_fields"]).map((s) => s.evidence);
  if (notes.length > 0) sections.push({ title: "Notes", points: notes.slice(0, 3) });

  return { prose, insights, sections: sections.length > 0 ? sections : undefined };
}
