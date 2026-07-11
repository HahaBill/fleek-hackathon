import { z } from "zod";

// ---------- Lead & qualification ----------
export const FIELD_NAMES = [
  "contact", "category", "quantity",            // required
  "brand", "grade", "budget", "destination", "deadline", // optional
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export const REQUIRED_FIELDS: FieldName[] = ["contact", "category", "quantity"];

export type LeadStatus =
  | "in_progress"
  | "qualified_follow_up"
  | "human_handoff_requested"
  | "unresolved";

export const LeadRecordSchema = z.object({
  leadId: z.string(),
  contact: z.object({ name: z.string().optional(), method: z.string().optional() }),
  requirements: z.object({
    categories: z.array(z.string()).default([]),
    brands: z.array(z.string()).default([]),
    grade: z.string().optional(),
    quantity: z.number().optional(),
    budget: z.number().optional(),
    currency: z.string().optional(),
    destination: z.string().optional(),
    timeframe: z.string().optional(),
  }),
  questions: z.array(z.string()).default([]),
  unknownFields: z.array(z.enum(FIELD_NAMES)).default([]),
  status: z.enum(["in_progress", "qualified_follow_up", "human_handoff_requested", "unresolved"]),
  recommendedNextAction: z.string().optional(),
  guardrailEvents: z.array(z.object({
    kind: z.enum(["unprovenanced_number", "escalation"]),
    detail: z.string(),
    turnIndex: z.number(),
  })).default([]),
  escalation: z.object({ reason: z.string(), context: z.string() }).optional(),
});
export type LeadRecord = z.infer<typeof LeadRecordSchema>;

// ---------- Knowledge ----------
export const KnowledgeFactSchema = z.object({
  category: z.string(),
  styleTags: z.array(z.string()).default([]),
  brands: z.array(z.string()).default([]),
  grade: z.string().optional(),
  availability: z.string(),
  unitPriceRange: z.tuple([z.number(), z.number()]).optional(),
  balePrice: z.number().optional(),
  moq: z.number().optional(),
  origin: z.string().optional(),
  notes: z.string().optional(),
});
export type KnowledgeFact = z.infer<typeof KnowledgeFactSchema>;
export type KnowledgeResult = { kind: "facts"; facts: KnowledgeFact[] } | { kind: "not_found" };

// ---------- Tool contract (the agent's only capabilities) ----------
export const TOOL_NAMES = [
  "search_supplier_knowledge",
  "create_or_update_lead",
  "request_human_follow_up",
  "end_call",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ---------- Escalation rule ids (Plan 1 implements; Plan 4 asserts on them) ----------
export const RULE_IDS = [
  "binding_price_request",
  "exclusive_or_payment_exception",
  "complaint_or_legal",
  "item_not_in_knowledge",
  "human_requested",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

// ---------- Core interface (Plan 1 implements; Plans 2 & 4 consume) ----------
export type FieldChipState = { field: FieldName; state: "pending" | "captured"; value?: string };

export interface QualificationCore {
  /** Deterministic per-turn update. Called after every buyer turn AND after every tool result. */
  noteBuyerTurn(text: string): void;
  /** Extract confirmed facts from agent read-backs (qty, grade, budget, etc.). */
  noteAgentTurn(text: string): void;
  searchKnowledge(query: string, filters?: Record<string, string>): KnowledgeResult;
  upsertLead(fields: Partial<LeadRecord["requirements"]> & { contact?: LeadRecord["contact"] }):
    { leadId: string; missingFields: FieldName[] };
  requestHandoff(reason: string, context: string): { handoffId: string };
  /** Escalation Rules Engine — evaluated on every buyer turn; returns fired rules. */
  evaluateEscalations(buyerText: string): { rule: RuleId; reason: string }[];
  chips(): FieldChipState[];
  nextQuestion(): FieldName | null;         // single most-important missing field
  /** Buyer confirmed the read-back. Set via the `confirmed: true` arg on
   *  create_or_update_lead — required for qualified_follow_up. */
  markConfirmed(): void;
  recordGuardrailEvent(detail: string, turnIndex: number): void;
  finalize(endedBy: "end_call" | "hangup"): LeadRecord;  // computes terminal status
  snapshot(): LeadRecord;                   // current state, non-terminal allowed
}

// ---------- Summary Agent (Plan 4 implements; Plan 2 invokes at call end) ----------
export interface SummaryInput {
  lead: LeadRecord;                                  // finalized, authoritative
  transcript: { role: "buyer" | "agent"; text: string }[];
  events: { kind: string; detail: string }[];        // guardrail + escalation events
}
export interface SummaryOutput {
  prose: string;            // 2–3 sentence brief
  insights: string[];       // grounded observations, ≤4
  nextActionPhrasing?: string; // optional re-phrasing of the deterministic next action
}
export type SummaryAgent = (input: SummaryInput) => Promise<SummaryOutput>;

// ---------- Event stream (server → frontend; also eval-harness input) ----------
export type AgentEvent =
  | { type: "session.started"; sessionId: string; mode: "voice" | "text"; provider?: "openai" | "elevenlabs" }
  | { type: "turn"; role: "buyer" | "agent"; text: string; final: boolean; turnIndex: number }
  | { type: "tool.call"; tool: ToolName; args: unknown; turnIndex: number }
  | { type: "tool.result"; tool: ToolName; summary: string; payload: unknown; turnIndex: number }
    // summary is the UI display string ("3 facts"); payload is the full tool response —
    // the eval harness needs it to independently verify number provenance
  | { type: "guardrail"; kind: "unprovenanced_number" | "escalation"; detail: string; ruleId?: RuleId; turnIndex: number }
    // ruleId set when an Escalation Rules Engine rule fired — eval harness asserts on it
  | { type: "chips"; chips: FieldChipState[] }
  | { type: "call.ended"; endedBy: "end_call" | "hangup" | "error" }
  | { type: "summary.ready"; lead: LeadRecord; prose: string; insights?: string[] };

// ---------- Transport (Plan 2 implements Realtime+Text; Plan 3 mocks it) ----------
export interface SessionTransport {
  start(mode: "voice" | "text"): Promise<void>;
  sendText(text: string): void;             // text mode only
  end(): void;
  onEvent(cb: (e: AgentEvent) => void): () => void;
  setMuted?(muted: boolean): void;
}

// ---------- Wire credentials (voice mode; Plan 2 serves, per plans/00-shared.md) ----------
export type VoiceProvider = "openai" | "elevenlabs";
export type VoiceCredentials =
  | { provider: "openai"; clientSecret: string }        // ephemeral Realtime client secret
  | { provider: "elevenlabs"; signedUrl: string };      // signed ConvAI session URL
