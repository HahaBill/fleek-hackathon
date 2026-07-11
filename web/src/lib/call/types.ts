/**
 * Shared front-end contract for a supplier voice call.
 *
 * The UI is driven entirely by a stream of `CallEvent`s produced by a
 * `CallSource`. Today that source is the scripted mock in `mock-source.ts`;
 * the voice backend (Person B) becomes real by implementing the same
 * `CallSource` interface against the OpenAI Realtime event stream. Nothing in
 * the UI layer needs to change when that swap happens.
 *
 * Design rule carried over from the PRD: the summary card renders lead fields
 * from the state-machine record ONLY. The `summary` prose is the sole thing the
 * LLM writes; it can never introduce or alter a field value. Keep that split
 * intact when wiring the real backend.
 */

export type Role = "buyer" | "agent";

/** The qualification fields tracked as live chips during the call. */
export type LeadField =
  | "category"
  | "grade"
  | "quantity"
  | "budget"
  | "destination"
  | "deadline"
  | "contact";

/** Fields the state machine treats as required to qualify a lead. */
export const REQUIRED_FIELDS: LeadField[] = ["category", "quantity", "contact"];

/** Order the chips appear in during the call. */
export const CHIP_ORDER: LeadField[] = [
  "category",
  "quantity",
  "grade",
  "destination",
  "deadline",
  "contact",
];

export const FIELD_LABELS: Record<LeadField, string> = {
  category: "Category",
  grade: "Grade",
  quantity: "Quantity",
  budget: "Budget",
  destination: "Destination",
  deadline: "Deadline",
  contact: "Contact",
};

export type LeadStatus =
  | "in_progress"
  | "qualified_follow_up"
  | "human_handoff"
  | "unresolved";

export type CallMode = "voice" | "text";

/** A single finalized turn in the transcript. */
export interface Turn {
  id: string;
  role: Role;
  text: string;
}

/** The deterministic lead record. Field values here are authoritative. */
export interface LeadRecord {
  buyerName?: string;
  fields: Partial<Record<LeadField, string>>;
  status: LeadStatus;
  escalationReason?: string;
  /** Prose brief, authored by the summary agent. Narration only. */
  summary?: string;
  /** Emphasized call-to-action for the supplier. */
  recommendedNextAction?: string;
}

/**
 * Events emitted by a CallSource. Ordering is meaningful; the UI applies them
 * in arrival order.
 */
export type CallEvent =
  | { type: "session.started"; mode: CallMode }
  /** Agent is between states: null = idle, else the live agent state. */
  | { type: "agent.state"; state: "thinking" | "listening" | "talking" | null }
  /** A completed turn to append to the transcript. */
  | { type: "turn"; role: Role; id: string; text: string }
  /** A tool invocation, rendered inline in the stream (muted). */
  | { type: "tool"; tool: string; detail: string }
  /** A qualification field was captured by the state machine. */
  | { type: "field"; field: LeadField; value: string }
  /** An escalation rule fired, rendered inline in the stream (warning). */
  | { type: "escalation"; reason: string }
  /** The lead status transitioned. */
  | { type: "status"; status: LeadStatus }
  /** The call ended; carries the final record + summary agent output. */
  | { type: "session.ended"; lead: LeadRecord };

export type CallEventHandler = (event: CallEvent) => void;

/**
 * A source of call events. Implement this to back the UI with a real
 * transport (Realtime voice, text pipeline, replayed clip). `start` kicks off
 * the session; `sendText` feeds buyer input in text mode; `stop` ends early
 * (buyer hangs up). The returned function from `subscribe` unsubscribes.
 */
export interface CallSource {
  subscribe(handler: CallEventHandler): () => void;
  start(mode: CallMode): void;
  sendText(text: string): void;
  stop(): void;
}
