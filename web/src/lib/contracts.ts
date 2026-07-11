/**
 * Front-end mirror of the team shared contract (`packages/shared/src/contracts.ts`
 * in plans/00-shared.md). Types only, no runtime/zod, because the UI just needs
 * the shapes. These are kept byte-for-byte compatible with the backend so that at
 * integration Checkpoint 2 the real transport from `@fleek/voice-client` drops in
 * with a single change in `transport/index.ts`.
 *
 * If/when `@fleek/shared` is published into this app, replace this file with a
 * re-export from that package.
 */

// ---------- Lead & qualification ----------
export const FIELD_NAMES = [
  "contact",
  "category",
  "quantity", // required
  "brand",
  "grade",
  "budget",
  "destination",
  "deadline", // optional
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export const REQUIRED_FIELDS: FieldName[] = ["contact", "category", "quantity"];

export type LeadStatus =
  | "in_progress"
  | "qualified_follow_up"
  | "human_handoff_requested"
  | "unresolved";

export interface LeadRecord {
  leadId: string;
  contact: { name?: string; method?: string };
  requirements: {
    categories: string[];
    brands: string[];
    grade?: string;
    quantity?: number;
    budget?: number;
    currency?: string;
    destination?: string;
    timeframe?: string;
  };
  questions: string[];
  unknownFields: FieldName[];
  status: LeadStatus;
  recommendedNextAction?: string;
  guardrailEvents: {
    kind: "unprovenanced_number" | "escalation";
    detail: string;
    turnIndex: number;
  }[];
  escalation?: { reason: string; context: string };
}

// ---------- Knowledge ----------
export interface KnowledgeFact {
  category: string;
  styleTags: string[];
  brands: string[];
  grade?: string;
  availability: string;
  unitPriceRange?: [number, number];
  balePrice?: number;
  moq?: number;
  origin?: string;
  notes?: string;
}
export type KnowledgeResult =
  | { kind: "facts"; facts: KnowledgeFact[] }
  | { kind: "not_found" };

// ---------- Tool contract (the agent's only capabilities) ----------
export const TOOL_NAMES = [
  "search_supplier_knowledge",
  "create_or_update_lead",
  "request_human_follow_up",
  "end_call",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ---------- Escalation rule ids ----------
export const RULE_IDS = [
  "binding_price_request",
  "exclusive_or_payment_exception",
  "complaint_or_legal",
  "item_not_in_knowledge",
  "human_requested",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

// ---------- Chips ----------
export type FieldChipState = {
  field: FieldName;
  state: "pending" | "captured";
  value?: string;
};

// ---------- Summary Agent ----------
export interface SummaryInput {
  lead: LeadRecord;
  transcript: { role: "buyer" | "agent"; text: string }[];
  events: { kind: string; detail: string }[];
}
export interface SummaryOutput {
  prose: string;
  insights: string[];
  nextActionPhrasing?: string;
}
export type SummaryAgent = (input: SummaryInput) => Promise<SummaryOutput>;

// ---------- Event stream (server -> frontend) ----------
export type AgentEvent =
  | {
      type: "session.started";
      sessionId: string;
      mode: "voice" | "text";
      provider?: "openai" | "elevenlabs";
    }
  | { type: "turn"; role: "buyer" | "agent"; text: string; final: boolean; turnIndex: number }
  | { type: "tool.call"; tool: ToolName; args: unknown; turnIndex: number }
  | { type: "tool.result"; tool: ToolName; summary: string; payload: unknown; turnIndex: number }
  | {
      type: "guardrail";
      kind: "unprovenanced_number" | "escalation";
      detail: string;
      ruleId?: RuleId;
      turnIndex: number;
    }
  | { type: "chips"; chips: FieldChipState[] }
  | { type: "call.ended"; endedBy: "end_call" | "hangup" | "error" }
  | { type: "summary.ready"; lead: LeadRecord; prose: string; insights?: string[] };

// ---------- Transport ----------
export interface SessionTransport {
  start(mode: "voice" | "text"): Promise<void>;
  sendText(text: string): void;
  end(): void;
  onEvent(cb: (e: AgentEvent) => void): () => void;
  setMuted?(muted: boolean): void;
}

// ---------- Wire credentials (voice mode) ----------
export type VoiceProvider = "openai" | "elevenlabs";
export type VoiceCredentials =
  | { provider: "openai"; clientSecret: string }
  | { provider: "elevenlabs"; signedUrl: string };
