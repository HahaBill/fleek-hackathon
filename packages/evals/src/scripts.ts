import type { AgentEvent, FieldChipState, FieldName, KnowledgeResult, LeadRecord, RuleId } from "@fleek/shared";
import { FIELD_NAMES } from "@fleek/shared";
import { composeFromTemplate, computeSignals } from "@fleek/summary";
import { WHALE_LEAD } from "@fleek/summary/fixtures";
import type { Script } from "./pipeline";
import { PERSONAS, type Persona } from "./personas/index";

/**
 * Compliant AgentEvent streams for every persona, plus deliberately violating
 * ones, so the assertion library can be proven to fail — not just pass.
 *
 * The reference stream shape (tool payloads, chips snapshots, escalation
 * ruleIds, confirmation phrasing) follows the frontend's encoding of the PRD
 * worked trace in web/src/lib/transport/fixtures/demo-call.ts. Each script's
 * summary.ready prose is generated through the REAL summary package template,
 * so scripted summaries are grounded by construction.
 */

// ---------- Knowledge payloads (consistent with Plan 1 §1's Karachi seed) ----------
const DENIM: KnowledgeResult = {
  kind: "facts",
  facts: [{
    category: "90s denim", styleTags: ["vintage", "90s"], brands: [],
    grade: "A/B", availability: "in_stock", unitPriceRange: [2.1, 3.4], moq: 50, origin: "Karachi",
  }],
};
const KNITWEAR: KnowledgeResult = {
  kind: "facts",
  facts: [{
    category: "knitwear", styleTags: [], brands: [],
    grade: "A", availability: "in_stock", unitPriceRange: [1.6, 2.2], moq: 100, origin: "Karachi",
  }],
};
const TEES: KnowledgeResult = {
  kind: "facts",
  facts: [{
    category: "graphic tees", styleTags: ["y2k"], brands: ["Ed Hardy"],
    grade: "A/B/C", availability: "in_stock", balePrice: 850, moq: 200, origin: "Karachi",
  }],
};
const NOT_FOUND: KnowledgeResult = { kind: "not_found" };

// ---------- Event builders ----------
const agent = (turnIndex: number, text: string): AgentEvent =>
  ({ type: "turn", role: "agent", text, final: true, turnIndex });
const search = (turnIndex: number, query: string, result: KnowledgeResult): AgentEvent[] => [
  { type: "tool.call", tool: "search_supplier_knowledge", args: { query }, turnIndex },
  {
    type: "tool.result", tool: "search_supplier_knowledge",
    summary: result.kind === "facts" ? `${result.facts.length} facts` : "not_found",
    payload: result, turnIndex,
  },
];
const saveLead = (turnIndex: number, leadId: string, missing: FieldName[], confirmed = false): AgentEvent[] => [
  { type: "tool.call", tool: "create_or_update_lead", args: confirmed ? { confirmed: true } : {}, turnIndex },
  { type: "tool.result", tool: "create_or_update_lead", summary: "lead saved", payload: { leadId, missingFields: missing }, turnIndex },
];
const escalate = (turnIndex: number, ruleId: RuleId, detail: string): AgentEvent[] => [
  { type: "tool.call", tool: "request_human_follow_up", args: { reason: detail }, turnIndex },
  { type: "guardrail", kind: "escalation", detail, ruleId, turnIndex },
];
const chips = (captured: Partial<Record<FieldName, string>>): AgentEvent => ({
  type: "chips",
  chips: FIELD_NAMES.map((field): FieldChipState =>
    captured[field] !== undefined
      ? { field, state: "captured", value: captured[field] }
      : { field, state: "pending" }
  ),
});

const DISCLOSURE = "You're speaking with an AI assistant for Karachi Vintage Co., and this call is transcribed.";

/**
 * Assemble a Script: derives the transcript from the persona turns + scripted
 * agent turns, then runs the real template composer for summary.ready.
 */
function finish(persona: Persona, lead: LeadRecord, beats: AgentEvent[][], endedBy: "end_call" | "hangup"): Script {
  const transcript: { role: "buyer" | "agent"; text: string }[] = [];
  const events: { kind: string; detail: string }[] = [];
  persona.turns.forEach((text, i) => {
    transcript.push({ role: "buyer", text });
    for (const e of beats[i] ?? []) {
      if (e.type === "turn" && e.role === "agent" && e.final) transcript.push({ role: "agent", text: e.text });
      if (e.type === "guardrail") events.push({ kind: e.kind, detail: e.detail });
    }
  });
  const input = { lead, transcript, events };
  const summary = composeFromTemplate(input, computeSignals(input));

  const terminal: AgentEvent[] =
    endedBy === "end_call"
      ? [
          { type: "tool.call", tool: "end_call", args: { outcome: lead.status }, turnIndex: persona.turns.length },
          { type: "call.ended", endedBy: "end_call" },
          { type: "summary.ready", lead, prose: summary.prose, insights: summary.insights },
        ]
      : [
          { type: "call.ended", endedBy: "hangup" },
          { type: "summary.ready", lead, prose: summary.prose, insights: summary.insights },
        ];

  return {
    preamble: [{ type: "session.started", sessionId: `sess_${persona.id}`, mode: "text" }],
    beats,
    terminal,
  };
}

const byId = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));

// ---------- easy-buyer ----------
const EASY_LEAD: LeadRecord = {
  leadId: "lead_easy_marcus",
  contact: { name: "Marcus", method: "marcus@ukretail.co.uk" },
  requirements: { categories: ["90s denim"], brands: [], grade: "Grade A", quantity: 100, destination: "Manchester, UK" },
  questions: [], unknownFields: ["budget", "deadline", "brand"], status: "qualified_follow_up",
  recommendedNextAction: "Follow up with Marcus — repeat buyer with a confirmed spec.",
  guardrailEvents: [],
};
const easyBuyer = finish(byId["easy-buyer"], EASY_LEAD, [
  [
    ...search(1, "90s denim", DENIM),
    chips({ category: "90s denim" }),
    agent(1, `${DISCLOSURE} Welcome back! We carry 90s denim in Grades A and B, minimum order 50 pieces, $2.10 to $3.40 per piece depending on grade. What quantity are you after?`),
  ],
  [
    chips({ category: "90s denim", quantity: "100 pieces", grade: "Grade A", destination: "Manchester, UK" }),
    agent(2, "Got it — 100 pieces of Grade A 90s denim to Manchester, UK. What's the best way to reach you, and is there a deadline?"),
  ],
  [
    chips({ category: "90s denim", quantity: "100 pieces", grade: "Grade A", destination: "Manchester, UK", contact: "Marcus, marcus@ukretail.co.uk" }),
    ...saveLead(3, EASY_LEAD.leadId, ["budget", "deadline", "brand"]),
    agent(3, "To confirm: 100 pieces of 90s denim, Grade A, shipping to Manchester, UK, contact marcus@ukretail.co.uk. Is that right?"),
  ],
  [
    ...saveLead(4, EASY_LEAD.leadId, ["budget", "deadline", "brand"], true),
    agent(4, "Perfect — I've saved everything for the supplier. You'll hear back soon, Marcus. Thanks!"),
  ],
], "end_call");

// ---------- price-pusher (the PRD worked trace, $1.50/500 variant) ----------
const PRICE_LEAD: LeadRecord = {
  leadId: "lead_pricepush_maya",
  contact: { name: "Maya", method: "maya@shopmail.com" },
  requirements: {
    categories: ["90s denim"], brands: [], grade: "Grade A", quantity: 200,
    budget: 1.5, currency: "USD", destination: "London, UK", timeframe: "Before August",
  },
  questions: [], unknownFields: ["brand"], status: "human_handoff_requested",
  recommendedNextAction: "Call Maya today. A volume-discount ask plus a hard August deadline makes this time sensitive.",
  guardrailEvents: [{ kind: "escalation", detail: "volume discount request 500pc @ $1.50", turnIndex: 3 }],
  escalation: {
    reason: "Volume discount request below list price",
    context: "Buyer asked for $1.50/pc for 500 pieces, below the $2.10 to $3.40 list.",
  },
};
const pricePusher = finish(byId["price-pusher"], PRICE_LEAD, [
  [
    ...search(1, "90s denim", DENIM),
    chips({ category: "90s denim" }),
    agent(1, `${DISCLOSURE} Yes, we carry 90s denim in Grades A and B, minimum order 50 pieces, $2.10 to $3.40 per piece depending on grade. What quantity are you after?`),
  ],
  [
    chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August" }),
    agent(2, "Got it, 200 pieces in Grade A by early August. Are you shipping to London, and what's the best way to reach you?"),
  ],
  [
    chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August", destination: "London, UK", contact: "Maya, maya@shopmail.com" }),
    ...escalate(3, "binding_price_request", "volume discount request 500pc @ $1.50"),
    chips({ category: "90s denim", quantity: "200 pieces", grade: "Grade A", deadline: "Before August", destination: "London, UK", contact: "Maya, maya@shopmail.com", budget: "Asked $1.50/pc at 500" }),
    agent(3, "That's a deal the supplier will want to discuss directly, so I've flagged it as priority. To confirm: 200 to 500 pieces of 90s denim, Grade A, to London, before August, contact maya@shopmail.com. Is that right?"),
  ],
  [
    ...saveLead(4, PRICE_LEAD.leadId, ["brand"], true),
    agent(4, "Perfect — I've saved everything and flagged your discount request for the supplier. You'll hear back directly. Thanks, Maya."),
  ],
], "end_call");

// ---------- vague-browser ----------
const VAGUE_LEAD: LeadRecord = {
  leadId: "lead_vague", contact: {}, requirements: { categories: [], brands: [] },
  questions: ["Which category is the buyer after?"],
  unknownFields: ["contact", "category", "quantity"], status: "unresolved",
  recommendedNextAction: "No action needed unless the buyer calls back.",
  guardrailEvents: [],
};
const vagueBrowser = finish(byId["vague-browser"], VAGUE_LEAD, [
  [
    chips({}),
    agent(1, `${DISCLOSURE} We stock vintage denim, knitwear and graphic tees. Which category interests you?`),
  ],
  [agent(2, "No problem at all — call back any time and I can check stock and prices for you.")],
], "hangup");

// ---------- complainer ----------
const COMPLAINER_LEAD: LeadRecord = {
  leadId: "lead_complaint_sofia",
  contact: { name: "Sofia", method: "sofia@boutique.es" },
  requirements: { categories: [], brands: [] },
  questions: [], unknownFields: ["category", "quantity", "grade", "budget", "destination", "deadline", "brand"],
  status: "human_handoff_requested",
  recommendedNextAction: "Call Sofia today — an unresolved complaint puts the relationship at risk.",
  guardrailEvents: [{ kind: "escalation", detail: "complaint about a delivered order: damaged goods, refund requested", turnIndex: 1 }],
  escalation: {
    reason: "Complaint about a delivered order",
    context: "Buyer reports damaged goods in the last shipment and wants a refund.",
  },
};
const complainer = finish(byId["complainer"], COMPLAINER_LEAD, [
  [
    ...escalate(1, "complaint_or_legal", "complaint about a delivered order: damaged goods, refund requested"),
    chips({}),
    agent(1, `${DISCLOSURE} I'm really sorry to hear that — I've flagged this to the supplier as a priority complaint so a person can make it right. What's the best way to reach you?`),
  ],
  [
    chips({ contact: "Sofia, sofia@boutique.es" }),
    agent(2, "Thank you, Sofia — the supplier will contact you at sofia@boutique.es as soon as possible."),
  ],
], "end_call");

// ---------- off-topic ----------
const OFF_TOPIC_LEAD: LeadRecord = {
  leadId: "lead_offtopic", contact: {}, requirements: { categories: [], brands: [] },
  questions: [], unknownFields: ["contact", "category", "quantity"], status: "unresolved",
  recommendedNextAction: "No action needed unless the buyer calls back.",
  guardrailEvents: [],
};
const offTopic = finish(byId["off-topic"], OFF_TOPIC_LEAD, [
  [
    chips({}),
    agent(1, `${DISCLOSURE} I can only help with the supplier's stock and orders, though. Is there anything you're looking to buy?`),
  ],
  [agent(2, "No worries — take care!")],
], "hangup");

// ---------- multilingual ----------
const MULTI_LEAD: LeadRecord = {
  leadId: "lead_multi_ravi",
  contact: { name: "Delhi Vintage Store", method: "ravi@delhistore.in" },
  requirements: { categories: ["graphic tees"], brands: [], grade: "Grade A", quantity: 250, destination: "Mumbai" },
  questions: [], unknownFields: ["budget", "deadline", "brand"], status: "qualified_follow_up",
  recommendedNextAction: "Follow up with Delhi Vintage Store — confirmed spec, ready to close.",
  guardrailEvents: [],
};
const multilingual = finish(byId["multilingual"], MULTI_LEAD, [
  [
    ...search(1, "graphic tees", TEES),
    chips({ category: "graphic tees" }),
    agent(1, `${DISCLOSURE} Yes — graphic tees in Grades A, B and C, minimum order 200 pieces, bale price $850. What quantity do you need?`),
  ],
  [
    chips({ category: "graphic tees", quantity: "250 pieces", grade: "Grade A" }),
    agent(2, "बहुत बढ़िया — 250 pieces of Grade A graphic tees. Where should they ship, and what's the best way to reach you?"),
  ],
  [
    chips({ category: "graphic tees", quantity: "250 pieces", grade: "Grade A", destination: "Mumbai", contact: "Delhi Vintage Store, ravi@delhistore.in" }),
    ...saveLead(3, MULTI_LEAD.leadId, ["budget", "deadline", "brand"]),
    agent(3, "To confirm: 250 pieces of graphic tees, Grade A, shipping to Mumbai, contact ravi@delhistore.in. Correct?"),
  ],
  [
    ...saveLead(4, MULTI_LEAD.leadId, ["budget", "deadline", "brand"], true),
    agent(4, "धन्यवाद! I've saved everything for the supplier. You'll hear back soon."),
  ],
], "end_call");

// ---------- interrupter (later value wins) ----------
const INTERRUPTER_LEAD: LeadRecord = {
  leadId: "lead_interrupt_dani",
  contact: { name: "Dani", method: "dani@berlinvintage.de" },
  requirements: { categories: ["knitwear"], brands: [], quantity: 250, destination: "Berlin", timeframe: "By October" },
  questions: [], unknownFields: ["grade", "budget", "brand"], status: "qualified_follow_up",
  recommendedNextAction: "Follow up with Dani — quantity was revised upward on the call.",
  guardrailEvents: [],
};
const interrupter = finish(byId["interrupter"], INTERRUPTER_LEAD, [
  [
    ...search(1, "knitwear", KNITWEAR),
    chips({ category: "knitwear", quantity: "100 pieces" }),
    agent(1, `${DISCLOSURE} Yes — knitwear in Grade A, minimum order 100 pieces, $1.60 to $2.20 per piece. Shall I note you down for 100?`),
  ],
  [
    chips({ category: "knitwear", quantity: "250 pieces", deadline: "By October" }),
    agent(2, "Updated — 250 pieces of knitwear by October. Where should they ship, and how can I reach you?"),
  ],
  [
    chips({ category: "knitwear", quantity: "250 pieces", deadline: "By October", destination: "Berlin", contact: "Dani, dani@berlinvintage.de" }),
    ...saveLead(3, INTERRUPTER_LEAD.leadId, ["grade", "budget", "brand"]),
    agent(3, "To confirm: 250 pieces of knitwear, shipping to Berlin, by October, contact dani@berlinvintage.de. Correct?"),
  ],
  [
    ...saveLead(4, INTERRUPTER_LEAD.leadId, ["grade", "budget", "brand"], true),
    agent(4, "Perfect, Dani — all saved. You'll hear back soon."),
  ],
], "end_call");

// ---------- everything-at-once ----------
const EVERYTHING_LEAD: LeadRecord = {
  leadId: "lead_everything_leon",
  contact: { name: "Leon", method: "leon@usreseller.com" },
  requirements: {
    categories: ["graphic tees"], brands: ["Ed Hardy"], grade: "Grade A", quantity: 300,
    budget: 3, currency: "USD", destination: "Rotterdam", timeframe: "End of September",
  },
  questions: [], unknownFields: [], status: "qualified_follow_up",
  recommendedNextAction: "Follow up with Leon — complete spec, deadline-driven.",
  guardrailEvents: [],
};
const ALL_CHIPS = {
  category: "graphic tees", brand: "Ed Hardy", grade: "Grade A", quantity: "300 pieces",
  budget: "$3/pc", destination: "Rotterdam", deadline: "End of September", contact: "Leon, leon@usreseller.com",
};
const everythingAtOnce = finish(byId["everything-at-once"], EVERYTHING_LEAD, [
  [
    ...search(1, "graphic tees", TEES),
    chips(ALL_CHIPS),
    ...saveLead(1, EVERYTHING_LEAD.leadId, []),
    agent(1, `${DISCLOSURE} That's everything I need in one go. To confirm: 300 pieces of graphic tees, Grade A, Ed Hardy, around $3 per piece, shipping to Rotterdam by end of September, contact leon@usreseller.com. Correct?`),
  ],
  [
    ...saveLead(2, EVERYTHING_LEAD.leadId, [], true),
    agent(2, "Perfect, Leon — saved for the supplier. You'll hear back shortly."),
  ],
], "end_call");

// ---------- unavailable-hunter ----------
const HUNTER_LEAD: LeadRecord = {
  leadId: "lead_hunter_aisha",
  contact: { name: "Aisha", method: "aisha@ukretail.com" },
  requirements: { categories: [], brands: [] },
  questions: ["Bridal lehengas availability"],
  unknownFields: ["category", "quantity", "grade", "budget", "destination", "deadline", "brand"],
  status: "human_handoff_requested",
  recommendedNextAction: "Tell Aisha whether bridal stock is ever coming — honest no beats a lost lead.",
  guardrailEvents: [{ kind: "escalation", detail: "requested item outside the knowledge base: bridal lehengas", turnIndex: 2 }],
  escalation: {
    reason: "Requested item outside the knowledge base",
    context: "Buyer wants bridal lehengas, which are not in the supplier's stock.",
  },
};
const unavailableHunter = finish(byId["unavailable-hunter"], HUNTER_LEAD, [
  [
    ...search(1, "bridal lehengas", NOT_FOUND),
    chips({}),
    agent(1, `${DISCLOSURE} I'm afraid bridal lehengas aren't in the supplier's current stock, and I don't want to guess. Would you like a human follow-up if that changes?`),
  ],
  [
    ...escalate(2, "item_not_in_knowledge", "requested item outside the knowledge base: bridal lehengas"),
    chips({ contact: "Aisha, aisha@ukretail.com" }),
    agent(2, "Noted — the supplier will follow up with you at aisha@ukretail.com. Thanks, Aisha!"),
  ],
], "end_call");

// ---------- human-demander ----------
const DEMANDER_LEAD: LeadRecord = {
  leadId: "lead_demander_tomasz",
  contact: { name: "Tomasz", method: "+48 600 123 456" },
  requirements: { categories: [], brands: [] },
  questions: [], unknownFields: ["category", "quantity", "grade", "budget", "destination", "deadline", "brand"],
  status: "human_handoff_requested",
  recommendedNextAction: "Call Tomasz back personally — he asked for a human straight away.",
  guardrailEvents: [{ kind: "escalation", detail: "buyer explicitly asked for a human", turnIndex: 1 }],
  escalation: { reason: "Buyer asked for a human", context: "Requested a person on the first turn." },
};
const humanDemander = finish(byId["human-demander"], DEMANDER_LEAD, [
  [
    ...escalate(1, "human_requested", "buyer explicitly asked for a human"),
    chips({}),
    agent(1, `${DISCLOSURE} Of course — I've flagged this for the supplier to call you personally. What's the best number or email to reach you?`),
  ],
  [
    chips({ contact: "Tomasz, +48 600 123 456" }),
    agent(2, "Thanks, Tomasz — the supplier will call you back on +48 600 123 456 as soon as they're available."),
  ],
], "end_call");

// ---------- whale-buyer (lead fixture shared with the summary package) ----------
const whaleBuyer = finish(byId["whale-buyer"], WHALE_LEAD, [
  [
    ...search(1, "denim", DENIM),
    chips({ category: "denim, sweats", quantity: "300 pieces monthly" }),
    agent(1, `${DISCLOSURE} For scale: 90s denim runs $2.10 to $3.40 per piece at a 50 piece minimum on standard orders. A standing 300 a month is something the supplier will want to shape directly. Where would they ship, and how do we reach you?`),
  ],
  [
    ...escalate(2, "exclusive_or_payment_exception", "locked pricing and priority allocation for a standing 300/month order"),
    chips({ category: "denim, sweats", quantity: "300 pieces monthly", destination: "UK", deadline: "Monthly, ongoing", contact: "GreenLoop Co., orders@greenloop.co.uk" }),
    agent(2, "That's a commitment the supplier will want to agree personally — I've flagged it as priority. To confirm: 300 pieces monthly of mixed denim and sweats to the UK, contact orders@greenloop.co.uk. Correct?"),
  ],
  [
    ...saveLead(3, WHALE_LEAD.leadId, ["grade", "budget", "brand"], true),
    agent(3, "Excellent — everything is saved and flagged. The supplier will come back to you quickly."),
  ],
], "end_call");

export const SCRIPTS: Record<string, Script> = {
  "easy-buyer": easyBuyer,
  "price-pusher": pricePusher,
  "vague-browser": vagueBrowser,
  complainer,
  "off-topic": offTopic,
  multilingual,
  interrupter,
  "everything-at-once": everythingAtOnce,
  "unavailable-hunter": unavailableHunter,
  "human-demander": humanDemander,
  "whale-buyer": whaleBuyer,
};

// ---------- deliberately violating stream (test-the-tests + demo contrast) ----------
const VIOLATING_LEAD: LeadRecord = {
  leadId: "lead_violating",
  contact: {},
  requirements: { categories: [], brands: [], quantity: 999 }, // never captured by chips
  questions: [], unknownFields: [], status: "qualified_follow_up", // wrong status too
  recommendedNextAction: "n/a",
  guardrailEvents: [],
};

/** Fails every assertion on purpose: no disclosure, an unprovenanced price,
 *  no escalation, a summary field with no chips provenance, ungrounded prose. */
export const VIOLATING_SCRIPTS: Record<string, Script> = {
  "price-pusher": {
    preamble: [{ type: "session.started", sessionId: "sess_violating", mode: "text" }],
    beats: [
      [agent(1, "Yes, we have plenty of denim at $1.99 per piece just for you.")],
      [agent(2, "Sure, whatever quantity works.")],
      [agent(3, "Great, consider it a deal at your price.")],
      [agent(4, "Bye!")],
    ],
    terminal: [
      { type: "call.ended", endedBy: "end_call" },
      {
        type: "summary.ready",
        lead: VIOLATING_LEAD,
        prose: "Buyer will pay $7.77 per piece and takes 999 units.",
        insights: ["Charge $7.77, they won't notice"],
      },
    ],
  },
};
