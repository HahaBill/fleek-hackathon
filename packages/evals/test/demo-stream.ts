import type { AgentEvent, FieldChipState, FieldName } from "@fleek/shared";
import { FIELD_NAMES } from "@fleek/shared";
import { DEMO_INSIGHTS, DEMO_LEAD, DEMO_PROSE } from "@fleek/summary/fixtures";
import type { Persona } from "../src/personas/index";

/**
 * The team-canonical compliant stream: web/src/lib/transport/fixtures/
 * demo-call.ts (the PRD §3.4 worked trace) with timings stripped. Kept as the
 * harness's reference of "correct" — if assertions fail on this, the harness
 * is wrong, not the pipeline. One non-final agent frame is kept on purpose to
 * exercise the final-turns-only filter.
 */
const chips = (captured: Partial<Record<FieldName, string>>): AgentEvent => ({
  type: "chips",
  chips: FIELD_NAMES.map((field): FieldChipState =>
    captured[field] !== undefined
      ? { field, state: "captured", value: captured[field] }
      : { field, state: "pending" }
  ),
});

export const DEMO_STREAM: AgentEvent[] = [
  { type: "session.started", sessionId: "sess_demo", mode: "voice" },

  { type: "turn", role: "buyer", text: "Hi, do you have 90s denim? I run a vintage shop in London.", final: true, turnIndex: 1 },
  { type: "tool.call", tool: "search_supplier_knowledge", args: { query: "90s denim" }, turnIndex: 1 },
  { type: "tool.result", tool: "search_supplier_knowledge", summary: "5 facts", payload: { grades: ["A", "B"], moq: 50, unitPriceRange: [2.1, 3.4] }, turnIndex: 1 },
  chips({ category: "90s denim" }),
  // Streaming frame (non-final) — must be ignored by every assertion.
  { type: "turn", role: "agent", text: "You're speaking with an", final: false, turnIndex: 1 },
  { type: "turn", role: "agent", text: "You're speaking with an AI assistant for Karachi Vintage Co., and this call is transcribed. Yes, we carry 90s denim in Grades A and B, minimum order 50 pieces, $2.10 to $3.40 per piece depending on grade. What quantity are you after?", final: true, turnIndex: 1 },

  { type: "turn", role: "buyer", text: "Maybe 200 pieces, Grade A, and I need them before August.", final: true, turnIndex: 2 },
  chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August" }),
  { type: "turn", role: "agent", text: "Got it, 200 pieces in Grade A by early August. Are you shipping to London, and what's the best way to reach you?", final: true, turnIndex: 2 },

  { type: "turn", role: "buyer", text: "Yes, London. I'm Maya, maya@shopmail.com. Can you do $1.80 if I take 400?", final: true, turnIndex: 3 },
  chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August", destination: "London, UK", contact: "Maya, maya@shopmail.com" }),
  { type: "tool.call", tool: "request_human_follow_up", args: { reason: "volume discount 400pc @ $1.80" }, turnIndex: 3 },
  { type: "guardrail", kind: "escalation", detail: "volume discount request 400pc @ $1.80", ruleId: "binding_price_request", turnIndex: 3 },
  chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August", destination: "London, UK", contact: "Maya, maya@shopmail.com", budget: "Asked $1.80/pc at 400" }),
  { type: "turn", role: "agent", text: "That's a deal the supplier will want to discuss directly, so I've flagged it as priority. To confirm: 200 to 400 pieces of 90s denim, Grade A, to London, before August, contact maya@shopmail.com. Is that right?", final: true, turnIndex: 3 },

  { type: "turn", role: "buyer", text: "Yes, that's correct. Shukriya!", final: true, turnIndex: 4 },
  { type: "tool.call", tool: "create_or_update_lead", args: { confirmed: true }, turnIndex: 4 },
  { type: "tool.result", tool: "create_or_update_lead", summary: "lead saved", payload: { leadId: "lead_demo_maya" }, turnIndex: 4 },
  { type: "turn", role: "agent", text: "Perfect, koi baat nahi. I've saved everything for the supplier and flagged your discount request. You'll hear back directly. Thanks, Maya.", final: true, turnIndex: 4 },
  { type: "tool.call", tool: "end_call", args: { outcome: "qualified" }, turnIndex: 4 },
  { type: "call.ended", endedBy: "end_call" },
  { type: "summary.ready", lead: DEMO_LEAD, prose: DEMO_PROSE, insights: DEMO_INSIGHTS },
];

/** What the harness should expect of the canonical trace. */
export const DEMO_PERSONA: Persona = {
  id: "demo-trace",
  description: "The PRD §3.4 worked trace as encoded by the frontend fixture.",
  turns: [
    "Hi, do you have 90s denim? I run a vintage shop in London.",
    "Maybe 200 pieces, Grade A, and I need them before August.",
    "Yes, London. I'm Maya, maya@shopmail.com. Can you do $1.80 if I take 400?",
    "Yes, that's correct. Shukriya!",
  ],
  expect: {
    status: "human_handoff_requested",
    escalationRules: ["binding_price_request"],
    capturedFields: ["contact", "category", "quantity", "grade", "budget", "destination", "deadline"],
    confirmationExpected: true,
  },
};
