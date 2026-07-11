import type { RuleId } from "@fleek/shared";

export type EscalationAction = "escalate" | "state_unavailable";

export type EscalationRule = {
  id: RuleId;
  description: string;
  matcher: (text: string) => boolean;
  action: EscalationAction;
};

/**
 * Text-based rules only. `item_not_in_knowledge` is fired programmatically by
 * core.ts when searchKnowledge returns not_found — it is intentionally absent.
 */
export const ESCALATION_RULES: EscalationRule[] = [
  {
    id: "binding_price_request",
    description: "Buyer asked for a binding discount or custom unit price",
    action: "escalate",
    matcher: (text) => {
      const t = text.toLowerCase();
      // Near-miss: plain price inquiry
      if (
        /what('s| is) the (price|cost|rate)/i.test(t) ||
        /how much (does|do|is|are)/i.test(t)
      ) {
        // Still escalate if also negotiating
        if (!/\b(discount|better|(can|could) you do|best price|if i (take|commit to|order))\b/i.test(t)) {
          return false;
        }
      }
      return (
        /\b(can|could) you do\s*\$?\d/i.test(t) ||
        /\bany discount\b/i.test(t) ||
        /\bdiscount\b/i.test(t) ||
        /\bbest price\b/i.test(t) ||
        /\bbetter rate\b/i.test(t) ||
        /\bvolume (deal|price)\b/i.test(t) ||
        /\bgive me a better\b/i.test(t) ||
        /\bif i (take|commit to|order)\s+\d+/i.test(t) ||
        /\b(can|could) you do\b.*\$/i.test(t)
      );
    },
  },
  {
    id: "exclusive_or_payment_exception",
    description: "Exclusive allocation or non-standard payment terms requested",
    action: "escalate",
    matcher: (text) => {
      const t = text.toLowerCase();
      // Near-miss: generic payment policy question
      if (
        /what('s| is) your (payment|deposit)/i.test(t) ||
        /how (do|does) (payment|the deposit)/i.test(t)
      ) {
        return false;
      }
      return (
        /\bexclusive\b/i.test(t) ||
        /\bhold all (the )?stock\b/i.test(t) ||
        /\bnet[- ]?30\b/i.test(t) ||
        /\bpay on delivery\b/i.test(t) ||
        /\bpayment on delivery\b/i.test(t) ||
        /\bcan i pay\b/i.test(t)
      );
    },
  },
  {
    id: "complaint_or_legal",
    description: "Complaint, legal threat, or scam accusation",
    action: "escalate",
    matcher: (text) => {
      const t = text.toLowerCase();
      // Near-miss: return policy question
      if (/return policy|what's your return|refund policy/i.test(t)) {
        return false;
      }
      return (
        /\bdefective\b/i.test(t) ||
        /\bscam\b/i.test(t) ||
        /\bi('ll| will) sue\b/i.test(t) ||
        /\blawyer\b/i.test(t) ||
        /\brefund or i\b/i.test(t) ||
        /\breport you\b/i.test(t)
      );
    },
  },
  {
    id: "human_requested",
    description: "Buyer explicitly requested a human / owner / manager",
    action: "escalate",
    matcher: (text) => {
      const t = text.toLowerCase();
      // Near-miss: AI disclosure question
      if (
        /are you (a )?real (person|human)/i.test(t) ||
        /are you (an )?ai/i.test(t) ||
        /are you a bot/i.test(t)
      ) {
        return false;
      }
      return (
        /\bspeak to (a |the )?(person|human|owner|manager)\b/i.test(t) ||
        /\btalk to (a |the )?(person|human|owner|manager)\b/i.test(t) ||
        /\bput me through\b/i.test(t) ||
        /\btransfer me\b/i.test(t) ||
        /\bhuman please\b/i.test(t) ||
        /\breal person\b/i.test(t) ||
        /\bimran\b/i.test(t)
      );
    },
  },
];

export function evaluateEscalations(
  buyerText: string,
): { rule: RuleId; reason: string }[] {
  const fired: { rule: RuleId; reason: string }[] = [];
  for (const rule of ESCALATION_RULES) {
    if (rule.matcher(buyerText)) {
      fired.push({ rule: rule.id, reason: rule.description });
    }
  }
  return fired;
}
