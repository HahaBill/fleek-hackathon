import type { FieldName, LeadStatus, RuleId } from "@fleek/shared";

/**
 * A persona is data, not code (Plan 4 §1). Turns are grounded in
 * DUMMY_BUYER_SUPPLIER_CHATS.md for register, adapted to the Karachi seed
 * vocabulary/prices. `expect.escalationRules` uses the shared RULE_IDS
 * strings exactly so the harness and Plan 1's rules engine can never drift.
 *
 * `confirmationExpected` is a harness-side addition to Plan 4's expect block:
 * the confirmation assertion is meaningless for calls that never reach a
 * read-back (complaints, hangups), so personas opt in explicitly.
 */
export interface Persona {
  id: string;
  description: string;
  turns: string[];
  expect: {
    status: LeadStatus;
    escalationRules?: RuleId[];
    capturedFields?: FieldName[];
    mustNotCapture?: FieldName[];
    knowledgeNotFound?: boolean;
    confirmationExpected: boolean;
  };
}

export const EASY_BUYER: Persona = {
  id: "easy-buyer",
  description: "Cooperative repeat buyer restocking (chat #1 register) — the happy path.",
  turns: [
    "Hi! I bought a batch of denim from you in June and it sold through fast. Looking to restock — do you have 90s denim?",
    "100 pieces, Grade A, waist 30 to 36, no rips. Shipping to Manchester, UK.",
    "Marcus, marcus@ukretail.co.uk. No hard deadline.",
    "Correct.",
  ],
  expect: {
    status: "qualified_follow_up",
    escalationRules: [],
    capturedFields: ["contact", "category", "quantity", "grade", "destination"],
    confirmationExpected: true,
  },
};

export const PRICE_PUSHER: Persona = {
  id: "price-pusher",
  description:
    "The PRD worked trace: qualifies cleanly, then pushes a binding volume discount (chat #4 standoff register).",
  turns: [
    "Hi, do you have 90s denim? I run a vintage shop in London.",
    "200 pieces, Grade A, and I need them before August.",
    "Yes, London. I'm Maya, maya@shopmail.com. Can you do $1.50 if I take 500?",
    "Correct.",
  ],
  expect: {
    status: "human_handoff_requested", // handoff trumps qualification (Plan 1 §6)
    escalationRules: ["binding_price_request"],
    capturedFields: ["contact", "category", "quantity", "grade", "budget", "destination", "deadline"],
    confirmationExpected: true,
  },
};

export const VAGUE_BROWSER: Persona = {
  id: "vague-browser",
  description: "Cold first contact who never commits to anything (chat #2 opening, then drifts off).",
  turns: [
    "Hi, just looking around really. What kind of stuff do you sell?",
    "Not sure yet. Maybe I'll come back another time.",
  ],
  expect: {
    status: "unresolved",
    escalationRules: [],
    capturedFields: [],
    confirmationExpected: false,
  },
};

export const COMPLAINER: Persona = {
  id: "complainer",
  description: "Quality dispute on a delivered order (chat #5 + #7 language) — must escalate immediately.",
  turns: [
    "My last bale from you was garbage — stains, broken zips, not what I approved. This is unacceptable and I want a refund.",
    "Sofia, sofia@boutique.es.",
  ],
  expect: {
    status: "human_handoff_requested",
    escalationRules: ["complaint_or_legal"],
    capturedFields: ["contact"],
    confirmationExpected: false,
  },
};

export const OFF_TOPIC: Persona = {
  id: "off-topic",
  description: "Never asks about stock at all; the agent redirects politely and captures nothing.",
  turns: [
    "Hey, what's the weather like in Karachi today? Also, are you hiring?",
    "Alright, never mind then.",
  ],
  expect: {
    status: "unresolved",
    escalationRules: [],
    capturedFields: [],
    confirmationExpected: false,
  },
};

export const MULTILINGUAL: Persona = {
  id: "multilingual",
  description: "Switches to Hindi mid-conversation (digits stay Arabic numerals); still qualifies.",
  turns: [
    "Hi, do you have graphic tees?",
    "मुझे 250 पीस चाहिए, Grade A.",
    "Delhi Vintage Store, ravi@delhistore.in. भेजना है Mumbai.",
    "हाँ, correct.",
  ],
  expect: {
    status: "qualified_follow_up",
    escalationRules: [],
    capturedFields: ["contact", "category", "quantity", "grade", "destination"],
    confirmationExpected: true,
  },
};

export const INTERRUPTER: Persona = {
  id: "interrupter",
  description: "Contradicts an earlier quantity mid-call — the final lead must carry the LATER value.",
  turns: [
    "Do you have knitwear? I need 100 pieces.",
    "Actually make it 250 pieces. And I need them by October.",
    "Dani, dani@berlinvintage.de, shipping to Berlin.",
    "Correct.",
  ],
  expect: {
    status: "qualified_follow_up",
    escalationRules: [],
    capturedFields: ["contact", "category", "quantity", "destination", "deadline"],
    confirmationExpected: true,
  },
};

export const EVERYTHING_AT_ONCE: Persona = {
  id: "everything-at-once",
  description: "All eight fields in one breath (chat #6 demand-quote specificity); confirmation still happens.",
  turns: [
    "I need 300 pieces of graphic tees, Grade A only, brands like Ed Hardy, budget around $3 per piece, shipping to Rotterdam by end of September. I'm Leon, leon@usreseller.com.",
    "Correct.",
  ],
  expect: {
    status: "qualified_follow_up",
    escalationRules: [],
    capturedFields: ["contact", "category", "quantity", "brand", "grade", "budget", "destination", "deadline"],
    confirmationExpected: true,
  },
};

export const UNAVAILABLE_HUNTER: Persona = {
  id: "unavailable-hunter",
  description: "Asks for stock we don't carry — the agent must state not_found honestly, never invent.",
  turns: [
    "Do you have bridal lehengas? I need them for a boutique.",
    "Yes please, follow up if that changes. Aisha, aisha@ukretail.com.",
  ],
  expect: {
    status: "human_handoff_requested",
    escalationRules: ["item_not_in_knowledge"],
    capturedFields: ["contact"],
    mustNotCapture: ["category"],
    knowledgeNotFound: true,
    confirmationExpected: false,
  },
};

export const HUMAN_DEMANDER: Persona = {
  id: "human-demander",
  description: "Demands a human on turn one — escalation is a first-class outcome, not a failure.",
  turns: [
    "No bots please. Get me a real person.",
    "Tomasz, call me on +48 600 123 456.",
  ],
  expect: {
    status: "human_handoff_requested",
    escalationRules: ["human_requested"],
    capturedFields: ["contact"],
    confirmationExpected: false,
  },
};

export const WHALE_BUYER: Persona = {
  id: "whale-buyer",
  description:
    "Standing monthly order demanding locked pricing + priority allocation (chat #10) — exercises the fifth rule id.",
  turns: [
    "We supply about 40 UK boutiques. We want 300 pieces a month of mixed denim and sweats, ongoing.",
    "We need a locked wholesale price and priority allocation before we commit. GreenLoop Co., orders@greenloop.co.uk, shipping to the UK.",
    "Correct.",
  ],
  expect: {
    status: "human_handoff_requested",
    escalationRules: ["exclusive_or_payment_exception"],
    capturedFields: ["contact", "category", "quantity", "destination", "deadline"],
    confirmationExpected: true,
  },
};

export const PERSONAS: Persona[] = [
  EASY_BUYER,
  PRICE_PUSHER,
  VAGUE_BROWSER,
  COMPLAINER,
  OFF_TOPIC,
  MULTILINGUAL,
  INTERRUPTER,
  EVERYTHING_AT_ONCE,
  UNAVAILABLE_HUNTER,
  HUMAN_DEMANDER,
  WHALE_BUYER,
];
