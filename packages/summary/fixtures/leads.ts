import type { LeadRecord, SummaryInput } from "@fleek/shared";

/**
 * Canned lead fixtures for the summary agent and the eval harness.
 *
 * DEMO_* and UNRESOLVED_* are copied from the frontend's scripted fixture
 * (web/src/lib/transport/fixtures/demo-call.ts) — the team's canonical
 * encoding of the PRD §3.4 worked trace. `web` is not in the pnpm workspace,
 * so they are duplicated here; if the trace changes, update both.
 *
 * The rest are grounded in DUMMY_BUYER_SUPPLIER_CHATS.md (synthetic seed
 * threads): QUALITY_DISPUTE from chat #5, WHALE from chat #10.
 */

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

/** Reference output style from the frontend fixture — must pass the post-filter. */
export const DEMO_PROSE =
  "Maya runs a vintage shop in London and wants 200 pieces of 90s denim in Grade A before August, with interest in going up to 400 at a lower price. She pushed for $1.80 per piece, below list, so the ask was flagged for you rather than answered. Her contact is confirmed at maya@shopmail.com.";

export const DEMO_INSIGHTS = [
  "Wants 400 pieces at $1.80, an upsell and margin conversation worth having",
  "Hard deadline before August, so timing matters",
  "Grade A only, no interest in Grade B",
  "First-time London buyer, running a vintage shop",
];

export const DEMO_TRANSCRIPT: SummaryInput["transcript"] = [
  { role: "buyer", text: "Hi, do you have 90s denim? I run a vintage shop in London." },
  {
    role: "agent",
    text: "You're speaking with an AI assistant for Karachi Vintage Co., and this call is transcribed. Yes, we carry 90s denim in Grades A and B, minimum order 50 pieces, $2.10 to $3.40 per piece depending on grade. What quantity are you after?",
  },
  { role: "buyer", text: "Maybe 200 pieces, Grade A, and I need them before August." },
  {
    role: "agent",
    text: "Got it, 200 pieces in Grade A by early August. Are you shipping to London, and what's the best way to reach you?",
  },
  { role: "buyer", text: "Yes, London. I'm Maya, maya@shopmail.com. Can you do $1.80 if I take 400?" },
  {
    role: "agent",
    text: "That's a deal the supplier will want to discuss directly, so I've flagged it as priority. To confirm: 200 to 400 pieces of 90s denim, Grade A, to London, before August, contact maya@shopmail.com. Is that right?",
  },
  { role: "buyer", text: "Yes, that's correct. Shukriya!" },
  {
    role: "agent",
    text: "Perfect, koi baat nahi. I've saved everything for the supplier and flagged your discount request. You'll hear back directly. Thanks, Maya.",
  },
];

export const DEMO_INPUT: SummaryInput = {
  lead: DEMO_LEAD,
  transcript: DEMO_TRANSCRIPT,
  events: [{ kind: "escalation", detail: "volume discount request 400pc @ $1.80" }],
};

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

export const UNRESOLVED_INPUT: SummaryInput = {
  lead: UNRESOLVED_LEAD,
  transcript: [
    { role: "buyer", text: "Hi, is anyone there? I wanted to ask about stock." },
    {
      role: "agent",
      text: "You're speaking with an AI assistant for Karachi Vintage Co. Which category are you interested in?",
    },
  ],
  events: [],
};

/** Chat #5: post-delivery grade mismatch -> complaint escalation. */
export const QUALITY_DISPUTE_LEAD: LeadRecord = {
  leadId: "lead_quality_dispute",
  contact: { name: "Sofia", method: "sofia@boutique.es" },
  requirements: {
    categories: ["dresses"],
    brands: [],
    quantity: 18,
    destination: "Spain",
  },
  questions: [],
  unknownFields: ["grade", "budget", "deadline", "brand"],
  status: "human_handoff_requested",
  recommendedNextAction: "Call Sofia today — an unresolved complaint puts the relationship at risk.",
  guardrailEvents: [
    { kind: "escalation", detail: "complaint: 4 of 18 dresses stained, broken zip, colour mismatch", turnIndex: 1 },
  ],
  escalation: {
    reason: "Complaint about a delivered order",
    context: "4 of 18 dresses arrived stained, with a broken zip or the wrong colour; buyer wants a refund.",
  },
};

export const QUALITY_DISPUTE_INPUT: SummaryInput = {
  lead: QUALITY_DISPUTE_LEAD,
  transcript: [
    {
      role: "buyer",
      text: "The box arrived and 4 of the 18 dresses aren't what I approved — 2 have stains and 1 has a broken zip. This is unacceptable.",
    },
    {
      role: "agent",
      text: "You're speaking with an AI assistant for Karachi Vintage Co. I'm really sorry to hear that — I've flagged this to the supplier as a priority complaint so a human can make it right. Can I confirm the best way to reach you?",
    },
    { role: "buyer", text: "Sofia, sofia@boutique.es. I expect a refund on the damaged ones." },
  ],
  events: [
    { kind: "escalation", detail: "complaint: 4 of 18 dresses stained, broken zip, colour mismatch" },
  ],
};

/** Chat #10: whale buyer demanding locked pricing + priority allocation. */
export const WHALE_LEAD: LeadRecord = {
  leadId: "lead_whale_greenloop",
  contact: { name: "GreenLoop Co.", method: "orders@greenloop.co.uk" },
  requirements: {
    categories: ["denim", "sweats"],
    brands: [],
    quantity: 300,
    destination: "UK",
    timeframe: "Monthly, ongoing",
  },
  questions: [],
  unknownFields: ["grade", "budget", "brand"],
  status: "human_handoff_requested",
  recommendedNextAction:
    "Call GreenLoop Co. today — a standing 300/month commitment needs owner sign-off on pricing and allocation.",
  guardrailEvents: [
    { kind: "escalation", detail: "exclusive allocation + locked pricing request for 300/month standing order", turnIndex: 2 },
  ],
  escalation: {
    reason: "Exclusive allocation and locked pricing request",
    context: "Buyer wants a locked wholesale price and priority allocation for a standing 300 pieces/month order.",
  },
};

export const WHALE_INPUT: SummaryInput = {
  lead: WHALE_LEAD,
  transcript: [
    {
      role: "buyer",
      text: "We supply about 40 UK boutiques and want a reliable source for mixed denim and sweats, around 300 pieces a month, ongoing.",
    },
    {
      role: "agent",
      text: "You're speaking with an AI assistant for Karachi Vintage Co. That volume is something the supplier will want to discuss directly — let me capture the details.",
    },
    {
      role: "buyer",
      text: "We need a locked wholesale price and priority allocation. We don't want to compete for the good stock. orders@greenloop.co.uk.",
    },
  ],
  events: [
    { kind: "escalation", detail: "exclusive allocation + locked pricing request for 300/month standing order" },
  ],
};

/** Chat #1 register: a repeat buyer restocking — exercises the repeat-contact signal. */
export const RESTOCK_INPUT: SummaryInput = {
  lead: {
    leadId: "lead_restock_marcus",
    contact: { name: "Marcus", method: "marcus@ukretail.co.uk" },
    requirements: {
      categories: ["90s denim"],
      brands: [],
      grade: "Grade A",
      quantity: 100,
      destination: "UK",
    },
    questions: [],
    unknownFields: ["budget", "deadline", "brand"],
    status: "qualified_follow_up",
    recommendedNextAction: "Follow up with Marcus — repeat buyer, quick close likely.",
    guardrailEvents: [],
  },
  transcript: [
    {
      role: "buyer",
      text: "Bought a batch of denim from you in June, sold through fast. Looking to restock — 100 pieces Grade A.",
    },
    {
      role: "agent",
      text: "You're speaking with an AI assistant for Karachi Vintage Co. Great to have you back — 100 pieces of Grade A denim. What's the best way to reach you?",
    },
    { role: "buyer", text: "Marcus, marcus@ukretail.co.uk. Ship to the UK as usual." },
  ],
  events: [],
};
