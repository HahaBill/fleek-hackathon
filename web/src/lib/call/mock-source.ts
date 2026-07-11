import type {
  CallEvent,
  CallEventHandler,
  CallMode,
  CallSource,
  LeadRecord,
} from "./types";

/**
 * Scripted stand-in for the real call backend. It replays the PRD worked-call
 * trace (90s denim -> qualification chips -> discount escalation -> confirmation
 * -> summary) so the whole UI can be built and demoed without the voice
 * pipeline. Swap this for a real `CallSource` and the screen is unchanged.
 *
 * - Voice mode: the buyer lines auto-play on a compressed timeline.
 * - Text mode: each buyer line waits for the user to type and send; the typed
 *   text is shown, then the scripted agent response for that beat plays.
 */

type Timed = { delay: number; event: CallEvent };

interface Beat {
  /** Scripted buyer line (shown in voice mode; text mode shows typed input). */
  buyer: string;
  /** Agent-side events that follow the buyer turn, with relative delays. */
  agent: Timed[];
}

let seq = 0;
const nextId = (role: string) => `${role}-${++seq}`;

const FINAL_LEAD: LeadRecord = {
  buyerName: "Maya",
  status: "qualified_follow_up",
  escalationReason:
    "Volume discount request: 400 pieces at $1.80 each, below list price. Needs a pricing decision from you.",
  summary:
    "Maya runs a vintage shop in London and wants 200 to 400 pieces of 90s denim in Grade A, delivered before August. She pushed for $1.80 per piece at 400 units, which is below list, so the request was flagged for you instead of answered. Contact is confirmed.",
  recommendedNextAction:
    "Call Maya today. A volume-discount ask plus a hard August deadline makes this time sensitive.",
  fields: {
    category: "90s denim",
    grade: "Grade A",
    quantity: "200 to 400 pieces",
    destination: "London, UK",
    deadline: "Before August",
    contact: "Maya, maya@shopmail.com",
    budget: "Asked $1.80/pc at 400",
  },
};

const BEATS: Beat[] = [
  {
    buyer: "Hi, do you have 90s denim? I run a vintage shop in London.",
    agent: [
      { delay: 500, event: { type: "agent.state", state: "thinking" } },
      {
        delay: 700,
        event: {
          type: "tool",
          tool: "search_supplier_knowledge",
          detail: '"90s denim" -> 5 facts',
        },
      },
      { delay: 300, event: { type: "field", field: "category", value: "90s denim" } },
      { delay: 500, event: { type: "agent.state", state: "talking" } },
      {
        delay: 100,
        event: {
          type: "turn",
          role: "agent",
          id: nextId("agent"),
          text: "You're speaking with an AI assistant for Karachi Vintage Co., and this call is transcribed. Yes, we carry 90s denim in Grades A and B, minimum order 50 pieces, $2.10 to $3.40 per piece depending on grade. What quantity are you after?",
        },
      },
      { delay: 2600, event: { type: "agent.state", state: "listening" } },
    ],
  },
  {
    buyer: "Maybe 200 pieces, Grade A, and I need them before August.",
    agent: [
      { delay: 500, event: { type: "agent.state", state: "thinking" } },
      { delay: 400, event: { type: "field", field: "quantity", value: "200 pieces" } },
      { delay: 300, event: { type: "field", field: "grade", value: "Grade A" } },
      { delay: 300, event: { type: "field", field: "deadline", value: "Before August" } },
      { delay: 500, event: { type: "agent.state", state: "talking" } },
      {
        delay: 100,
        event: {
          type: "turn",
          role: "agent",
          id: nextId("agent"),
          text: "Got it, 200 pieces in Grade A by early August. Are you shipping to London, and what's the best way to reach you?",
        },
      },
      { delay: 2200, event: { type: "agent.state", state: "listening" } },
    ],
  },
  {
    buyer:
      "Yes, London. I'm Maya, maya@shopmail.com. Can you do $1.80 if I take 400?",
    agent: [
      { delay: 500, event: { type: "agent.state", state: "thinking" } },
      { delay: 300, event: { type: "field", field: "destination", value: "London, UK" } },
      {
        delay: 300,
        event: { type: "field", field: "contact", value: "Maya, maya@shopmail.com" },
      },
      {
        delay: 600,
        event: {
          type: "tool",
          tool: "request_human_follow_up",
          detail: "volume discount, 400 pc at $1.80",
        },
      },
      {
        delay: 200,
        event: {
          type: "escalation",
          reason: "Volume discount request flagged for supplier",
        },
      },
      { delay: 500, event: { type: "agent.state", state: "talking" } },
      {
        delay: 100,
        event: {
          type: "turn",
          role: "agent",
          id: nextId("agent"),
          text: "That's a deal the supplier will want to discuss directly, so I've flagged it as priority. To confirm: 200 to 400 pieces of 90s denim, Grade A, to London, before August, contact maya@shopmail.com. Is that right?",
        },
      },
      { delay: 2800, event: { type: "agent.state", state: "listening" } },
    ],
  },
  {
    buyer: "Yes, that's correct. Shukriya!",
    agent: [
      { delay: 500, event: { type: "agent.state", state: "thinking" } },
      {
        delay: 500,
        event: {
          type: "tool",
          tool: "create_or_update_lead",
          detail: "lead saved, 7 fields",
        },
      },
      { delay: 300, event: { type: "status", status: "qualified_follow_up" } },
      { delay: 500, event: { type: "agent.state", state: "talking" } },
      {
        delay: 100,
        event: {
          type: "turn",
          role: "agent",
          id: nextId("agent"),
          text: "Perfect, koi baat nahi. I've saved everything for the supplier and flagged your discount request. You'll hear back directly. Thanks, Maya.",
        },
      },
      { delay: 1800, event: { type: "agent.state", state: null } },
      { delay: 200, event: { type: "session.ended", lead: FINAL_LEAD } },
    ],
  },
];

export class MockCallSource implements CallSource {
  private handlers = new Set<CallEventHandler>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private beatIndex = 0;
  private mode: CallMode = "voice";
  private stopped = false;

  subscribe(handler: CallEventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: CallEvent) {
    if (this.stopped && event.type !== "session.ended") return;
    this.handlers.forEach((h) => h(event));
  }

  private schedule(event: CallEvent, at: number) {
    this.timers.push(setTimeout(() => this.emit(event), at));
  }

  /** Play one beat's agent-side events starting from `base` ms. Returns end ms. */
  private playAgent(beat: Beat, base: number) {
    let t = base;
    for (const { delay, event } of beat.agent) {
      t += delay;
      this.schedule(event, t);
    }
    return t;
  }

  start(mode: CallMode) {
    this.mode = mode;
    this.stopped = false;
    this.beatIndex = 0;
    this.emit({ type: "session.started", mode });

    if (mode === "voice") {
      // Auto-play the whole conversation on a compressed timeline.
      let t = 300;
      this.schedule({ type: "agent.state", state: "listening" }, t);
      for (const beat of BEATS) {
        t += 900;
        this.schedule(
          { type: "turn", role: "buyer", id: nextId("buyer"), text: beat.buyer },
          t
        );
        t = this.playAgent(beat, t) + 700;
      }
    }
    // Text mode waits for sendText to advance beat by beat.
  }

  sendText(text: string) {
    if (this.mode !== "text" || this.stopped) return;
    const beat = BEATS[this.beatIndex];
    if (!beat) return;
    // Show the buyer's actual typed message, then play the scripted response.
    this.emit({ type: "turn", role: "buyer", id: nextId("buyer"), text });
    this.playAgent(beat, 250);
    this.beatIndex += 1;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    // If the buyer hangs up before qualifying, mark the lead unresolved.
    this.emit({
      type: "session.ended",
      lead: {
        status: "unresolved",
        fields: {},
        summary:
          "The call ended before the buyer's request could be qualified. No contact or requirement was confirmed.",
        recommendedNextAction: "No action needed unless the buyer calls back.",
      },
    });
  }
}
