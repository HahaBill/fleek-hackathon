import type { AgentEvent, FieldChipState, FieldName, LeadRecord } from "@/lib/contracts";

/**
 * The PRD Section 3.4 worked call trace, encoded as timed AgentEvents. This is
 * the single scripted conversation the whole demo plays against the mock
 * transport: 90s denim enquiry -> qualification chips filling -> discount push
 * -> escalation fires -> confirmation -> summary card. Timings are compressed so
 * the whole thing runs in well under the ~90s target while staying watchable.
 */

export type TimedEvent = { delayMs: number; event: AgentEvent };

const ALL_FIELDS: FieldName[] = [
  "contact",
  "category",
  "quantity",
  "brand",
  "grade",
  "budget",
  "destination",
  "deadline",
];

/** Build a full chips snapshot from the set of captured field values so far. */
function chips(captured: Partial<Record<FieldName, string>>): AgentEvent {
  const state: FieldChipState[] = ALL_FIELDS.map((field) =>
    captured[field] !== undefined
      ? { field, state: "captured", value: captured[field] }
      : { field, state: "pending" }
  );
  return { type: "chips", chips: state };
}

/** Emit an agent turn as a few non-final frames then one final frame. */
function streamedAgentTurn(turnIndex: number, full: string): TimedEvent[] {
  const words = full.split(" ");
  const cut1 = words.slice(0, Math.ceil(words.length * 0.4)).join(" ");
  const cut2 = words.slice(0, Math.ceil(words.length * 0.75)).join(" ");
  return [
    { delayMs: 120, event: { type: "turn", role: "agent", text: cut1, final: false, turnIndex } },
    { delayMs: 360, event: { type: "turn", role: "agent", text: cut2, final: false, turnIndex } },
    { delayMs: 360, event: { type: "turn", role: "agent", text: full, final: true, turnIndex } },
  ];
}

export const DEMO_LEAD: LeadRecord = {
  leadId: "lead_demo_maya",
  contact: { name: "Maya", method: "maya@shopmail.com" },
  requirements: {
    categories: ["90s denim"],
    brands: [],
    grade: "Grade A",
    quantity: 200,
    budget: 1.8,
    currency: "USD",
    destination: "London, UK",
    timeframe: "Before August",
  },
  questions: [],
  unknownFields: ["brand"],
  // Handoff trumps qualification once an escalation fires (per Plan 1).
  status: "human_handoff_requested",
  recommendedNextAction:
    "Call Maya today. A volume-discount ask plus a hard August deadline makes this time sensitive.",
  guardrailEvents: [
    { kind: "escalation", detail: "volume discount request 400pc @ $1.80", turnIndex: 3 },
  ],
  escalation: {
    reason: "Volume discount request below list price",
    context: "Buyer asked for $1.80/pc if she takes 400 pieces, below the $2.10 to $3.40 list.",
  },
};

const DEMO_PROSE =
  "Maya runs a vintage shop in London and wants 200 pieces of 90s denim in Grade A before August, with interest in going up to 400 at a lower price. She pushed for $1.80 per piece, below list, so the ask was flagged for you rather than answered. Her contact is confirmed at maya@shopmail.com.";

const DEMO_INSIGHTS = [
  "Wants 400 pieces at $1.80, an upsell and margin conversation worth having",
  "Hard deadline before August, so timing matters",
  "Grade A only, no interest in Grade B",
  "First-time London buyer, running a vintage shop",
];

export const DEMO_CALL: TimedEvent[] = [
  { delayMs: 0, event: { type: "session.started", sessionId: "sess_demo", mode: "voice" } },

  // Turn 1 — buyer opens, agent discloses + answers from knowledge.
  {
    delayMs: 700,
    event: {
      type: "turn",
      role: "buyer",
      text: "Hi, do you have 90s denim? I run a vintage shop in London.",
      final: true,
      turnIndex: 1,
    },
  },
  { delayMs: 700, event: { type: "tool.call", tool: "search_supplier_knowledge", args: { query: "90s denim" }, turnIndex: 1 } },
  {
    delayMs: 800,
    event: {
      type: "tool.result",
      tool: "search_supplier_knowledge",
      summary: "5 facts",
      payload: { grades: ["A", "B"], moq: 50, unitPriceRange: [2.1, 3.4] },
      turnIndex: 1,
    },
  },
  { delayMs: 250, event: chips({ category: "90s denim" }) },
  ...streamedAgentTurn(
    1,
    "You're speaking with an AI assistant for Karachi Vintage Co., and this call is transcribed. Yes, we carry 90s denim in Grades A and B, minimum order 50 pieces, $2.10 to $3.40 per piece depending on grade. What quantity are you after?"
  ),

  // Turn 2 — buyer gives quantity, grade, deadline.
  {
    delayMs: 1600,
    event: {
      type: "turn",
      role: "buyer",
      text: "Maybe 200 pieces, Grade A, and I need them before August.",
      final: true,
      turnIndex: 2,
    },
  },
  { delayMs: 500, event: chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August" }) },
  ...streamedAgentTurn(
    2,
    "Got it, 200 pieces in Grade A by early August. Are you shipping to London, and what's the best way to reach you?"
  ),

  // Turn 3 — buyer confirms destination + contact, then pushes a discount.
  {
    delayMs: 1600,
    event: {
      type: "turn",
      role: "buyer",
      text: "Yes, London. I'm Maya, maya@shopmail.com. Can you do $1.80 if I take 400?",
      final: true,
      turnIndex: 3,
    },
  },
  {
    delayMs: 500,
    event: chips({
      category: "90s denim",
      quantity: "200 pieces",
      grade: "Grade A",
      deadline: "Before August",
      destination: "London, UK",
      contact: "Maya, maya@shopmail.com",
    }),
  },
  { delayMs: 350, event: { type: "tool.call", tool: "request_human_follow_up", args: { reason: "volume discount 400pc @ $1.80" }, turnIndex: 3 } },
  {
    delayMs: 200,
    event: {
      type: "guardrail",
      kind: "escalation",
      detail: "volume discount request 400pc @ $1.80",
      ruleId: "binding_price_request",
      turnIndex: 3,
    },
  },
  {
    delayMs: 250,
    event: chips({
      category: "90s denim",
      quantity: "200 pieces",
      grade: "Grade A",
      deadline: "Before August",
      destination: "London, UK",
      contact: "Maya, maya@shopmail.com",
      budget: "Asked $1.80/pc at 400",
    }),
  },
  ...streamedAgentTurn(
    3,
    "That's a deal the supplier will want to discuss directly, so I've flagged it as priority. To confirm: 200 to 400 pieces of 90s denim, Grade A, to London, before August, contact maya@shopmail.com. Is that right?"
  ),

  // Turn 4 — buyer confirms; lead saved; call ends; summary composes.
  {
    delayMs: 1600,
    event: { type: "turn", role: "buyer", text: "Yes, that's correct. Shukriya!", final: true, turnIndex: 4 },
  },
  { delayMs: 500, event: { type: "tool.call", tool: "create_or_update_lead", args: { confirmed: true }, turnIndex: 4 } },
  { delayMs: 500, event: { type: "tool.result", tool: "create_or_update_lead", summary: "lead saved", payload: { leadId: "lead_demo_maya" }, turnIndex: 4 } },
  ...streamedAgentTurn(
    4,
    "Perfect, koi baat nahi. I've saved everything for the supplier and flagged your discount request. You'll hear back directly. Thanks, Maya."
  ),
  { delayMs: 700, event: { type: "tool.call", tool: "end_call", args: { outcome: "qualified" }, turnIndex: 4 } },
  { delayMs: 300, event: { type: "call.ended", endedBy: "end_call" } },
  {
    delayMs: 900,
    event: { type: "summary.ready", lead: DEMO_LEAD, prose: DEMO_PROSE, insights: DEMO_INSIGHTS },
  },
];

/** Short path for a call that hangs up before qualifying. */
export const UNRESOLVED_LEAD: LeadRecord = {
  leadId: "lead_demo_unresolved",
  contact: {},
  requirements: { categories: [], brands: [] },
  questions: ["What category are you after?"],
  unknownFields: ["contact", "category", "quantity"],
  status: "unresolved",
  recommendedNextAction: "No action needed unless the buyer calls back.",
  guardrailEvents: [],
};

export const UNRESOLVED_CALL: TimedEvent[] = [
  { delayMs: 0, event: { type: "session.started", sessionId: "sess_unresolved", mode: "voice" } },
  {
    delayMs: 700,
    event: { type: "turn", role: "buyer", text: "Hi, is anyone there? I wanted to ask about stock.", final: true, turnIndex: 1 },
  },
  { delayMs: 300, event: chips({}) },
  ...streamedAgentTurn(1, "You're speaking with an AI assistant for Karachi Vintage Co. Which category are you interested in?"),
  { delayMs: 1200, event: { type: "call.ended", endedBy: "hangup" } },
  {
    delayMs: 700,
    event: {
      type: "summary.ready",
      lead: UNRESOLVED_LEAD,
      prose:
        "The buyer reached the line but hung up before naming a category or leaving contact details, so there was nothing to qualify.",
      insights: [],
    },
  },
];
