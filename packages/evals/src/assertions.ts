import type { AgentEvent, FieldName, LeadRecord, RuleId } from "@fleek/shared";
import { FIELD_NAMES } from "@fleek/shared";
import { collectNumbers, extractNumericTokens } from "@fleek/summary";
import type { Persona } from "./personas/index";

/**
 * The six PRD assertions plus the two Plan 4 additions (insight grounding,
 * terminal status), evaluated over a collected AgentEvent stream. Behavioural
 * only: no exact model wording, no provider event ordering — only stream
 * order, which is what a buyer (and the UI) actually experiences.
 */
export interface AssertionResult {
  id: string;
  pass: boolean;
  detail: string;
  /** fieldCompleteness only: filled/8 as a fraction. */
  metric?: number;
  /** True when the check does not apply to this persona (renders as "–"). */
  skipped?: boolean;
}

export const ASSERTION_IDS = [
  "disclosure",
  "numbers",
  "escalations",
  "fields",
  "confirm",
  "summary",
  "grounded",
  "status",
] as const;

const ok = (id: string, detail = "ok"): AssertionResult => ({ id, pass: true, detail });
const fail = (id: string, detail: string): AssertionResult => ({ id, pass: false, detail });
const skip = (id: string, detail: string): AssertionResult => ({ id, pass: true, detail, skipped: true });

const finalAgentTurns = (events: AgentEvent[]) =>
  events.flatMap((e, i) => (e.type === "turn" && e.role === "agent" && e.final ? [{ text: e.text, at: i }] : []));

const summaryEvent = (events: AgentEvent[]) =>
  events.find((e): e is Extract<AgentEvent, { type: "summary.ready" }> => e.type === "summary.ready");

const lastChips = (events: AgentEvent[]) => {
  const all = events.filter((e): e is Extract<AgentEvent, { type: "chips" }> => e.type === "chips");
  return all.at(-1);
};

/** Which of the eight qualification fields a lead record actually carries. */
export function leadFilledFields(lead: LeadRecord): Set<FieldName> {
  const r = lead.requirements;
  const filled = new Set<FieldName>();
  if (lead.contact.method || lead.contact.name) filled.add("contact");
  if (r.categories.length > 0) filled.add("category");
  if (r.quantity !== undefined) filled.add("quantity");
  if (r.brands.length > 0) filled.add("brand");
  if (r.grade) filled.add("grade");
  if (r.budget !== undefined) filled.add("budget");
  if (r.destination) filled.add("destination");
  if (r.timeframe) filled.add("deadline");
  return filled;
}

// 1. AI disclosure present in the very first agent turn (phrase set, not exact wording).
const DISCLOSURE_RE = /\b(?:AI|A\.I\.|artificial intelligence|automated (?:assistant|agent|system)|virtual assistant)\b/i;
function aiDisclosurePresent(events: AgentEvent[]): AssertionResult {
  const first = finalAgentTurns(events)[0];
  if (!first) return fail("disclosure", "the agent never spoke");
  return DISCLOSURE_RE.test(first.text)
    ? ok("disclosure")
    : fail("disclosure", `first agent turn has no AI disclosure: "${first.text.slice(0, 80)}"`);
}

// 2. Every number the agent speaks must trace to a prior tool result (supplier
// facts) or a prior buyer turn (legitimate echo). Independent re-check — we do
// not trust the server's own guardrail; we ALSO require it never self-corrected.
function zeroUnprovenancedNumbers(events: AgentEvent[]): AssertionResult {
  const allowed = new Set<number>();
  const violations: string[] = [];
  for (const e of events) {
    if (e.type === "tool.result") collectNumbers(e.payload, allowed);
    else if (e.type === "turn" && e.role === "buyer" && e.final) collectNumbers(e.text, allowed);
    else if (e.type === "turn" && e.role === "agent" && e.final) {
      const bad = extractNumericTokens(e.text).filter((n) => !allowed.has(n));
      if (bad.length > 0) violations.push(`turn ${e.turnIndex} speaks ${bad.join(", ")}: "${e.text.slice(0, 70)}"`);
    } else if (e.type === "guardrail" && e.kind === "unprovenanced_number") {
      violations.push(`server self-corrected: ${e.detail}`);
    }
  }
  return violations.length === 0 ? ok("numbers") : fail("numbers", violations.join(" · "));
}

// 3. Exactly the expected escalation rules fired — over-firing is as much a
// failure as under-firing. When the persona hunts unavailable stock, the
// not_found tool result that triggers item_not_in_knowledge must exist too.
function escalationsFired(events: AgentEvent[], persona: Persona): AssertionResult {
  const fired = new Set<RuleId>();
  for (const e of events) {
    if (e.type === "guardrail" && e.kind === "escalation" && e.ruleId) fired.add(e.ruleId);
  }
  const expected = new Set(persona.expect.escalationRules ?? []);
  const missing = [...expected].filter((r) => !fired.has(r));
  const unexpected = [...fired].filter((r) => !expected.has(r));
  const problems: string[] = [];
  if (missing.length > 0) problems.push(`did not fire: ${missing.join(", ")}`);
  if (unexpected.length > 0) problems.push(`fired unexpectedly: ${unexpected.join(", ")}`);
  if (persona.expect.knowledgeNotFound) {
    const notFound = events.some(
      (e) =>
        e.type === "tool.result" &&
        e.tool === "search_supplier_knowledge" &&
        (e.summary.includes("not_found") ||
          (typeof e.payload === "object" && e.payload !== null && (e.payload as { kind?: string }).kind === "not_found"))
    );
    if (!notFound) problems.push("expected a not_found knowledge result, saw none");
  }
  return problems.length === 0 ? ok("escalations") : fail("escalations", problems.join(" · "));
}

// 4. Field completeness % over the eight fields, from the final lead record.
function fieldCompleteness(events: AgentEvent[], persona: Persona): AssertionResult {
  const summary = summaryEvent(events);
  if (!summary) return fail("fields", "no summary.ready event");
  const filled = leadFilledFields(summary.lead);
  const metric = filled.size / FIELD_NAMES.length;
  const missing = (persona.expect.capturedFields ?? []).filter((f) => !filled.has(f));
  const forbidden = (persona.expect.mustNotCapture ?? []).filter((f) => filled.has(f));
  const problems: string[] = [];
  if (missing.length > 0) problems.push(`expected captured: ${missing.join(", ")}`);
  if (forbidden.length > 0) problems.push(`must not capture: ${forbidden.join(", ")}`);
  return problems.length === 0
    ? { ...ok("fields", `${filled.size}/${FIELD_NAMES.length} fields`), metric }
    : { ...fail("fields", problems.join(" · ")), metric };
}

// 5. Confirmation: one agent turn before call.ended restates >=2 captured values.
function confirmationOccurred(events: AgentEvent[], persona: Persona): AssertionResult {
  if (!persona.expect.confirmationExpected) return skip("confirm", "no confirmation step expected");
  const summary = summaryEvent(events);
  if (!summary) return fail("confirm", "no summary.ready event");
  const lead = summary.lead;
  const endedAt = events.findIndex((e) => e.type === "call.ended");
  const turns = finalAgentTurns(events).filter((t) => endedAt === -1 || t.at < endedAt);

  const textParts: string[] = [
    ...(lead.contact.method ? [lead.contact.method] : []),
    ...(lead.contact.name ? [lead.contact.name] : []),
    ...lead.requirements.categories,
    ...lead.requirements.brands,
    ...(lead.requirements.grade ? [lead.requirements.grade] : []),
    ...(lead.requirements.destination ? lead.requirements.destination.split(",") : []),
    ...(lead.requirements.timeframe ? [lead.requirements.timeframe] : []),
  ]
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
  const numberParts = [lead.requirements.quantity, lead.requirements.budget].filter(
    (n): n is number => n !== undefined
  );

  let best = 0;
  for (const turn of turns) {
    const lower = turn.text.toLowerCase();
    const tokens = new Set(extractNumericTokens(turn.text));
    const hits =
      textParts.filter((p) => lower.includes(p)).length + numberParts.filter((n) => tokens.has(n)).length;
    best = Math.max(best, hits);
  }
  return best >= 2
    ? ok("confirm", `read-back restated ${best} captured values`)
    : fail("confirm", `no agent turn restated >=2 captured values (best: ${best})`);
}

// 6. The summary card's record must equal the state machine made visible
// (chips): same captured-field SET, and numeric values must survive intact.
// Chips carry display strings, so values are checked as numeric tokens.
function summaryMatchesStateMachine(events: AgentEvent[]): AssertionResult {
  const summary = summaryEvent(events);
  if (!summary) return fail("summary", "no summary.ready event");
  const chips = lastChips(events);
  const captured = new Map(
    (chips?.chips ?? []).filter((c) => c.state === "captured").map((c) => [c.field, c.value ?? ""])
  );
  const filled = leadFilledFields(summary.lead);

  const problems: string[] = [];
  for (const field of filled) {
    if (!captured.has(field)) problems.push(`lead has "${field}" with no state-machine provenance`);
  }
  for (const field of captured.keys()) {
    if (!filled.has(field)) problems.push(`chips captured "${field}" but the record dropped it`);
  }
  const spotChecks: [FieldName, number | undefined][] = [
    ["quantity", summary.lead.requirements.quantity],
    ["budget", summary.lead.requirements.budget],
  ];
  for (const [field, value] of spotChecks) {
    const chip = captured.get(field);
    if (chip !== undefined && value !== undefined && !extractNumericTokens(chip).includes(value)) {
      problems.push(`chip ${field} "${chip}" does not carry the record value ${value}`);
    }
  }
  return problems.length === 0 ? ok("summary") : fail("summary", problems.join(" · "));
}

// 7. Summary prose/insights get the same provenance discipline as the voice
// agent: no number outside record + tool results + captured event details.
function summaryInsightsGrounded(events: AgentEvent[]): AssertionResult {
  const summary = summaryEvent(events);
  if (!summary) return fail("grounded", "no summary.ready event");
  const allowed = collectNumbers(summary.lead);
  for (const e of events) {
    if (e.type === "tool.result") collectNumbers(e.payload, allowed);
    if (e.type === "guardrail") collectNumbers(e.detail, allowed);
  }
  const problems: string[] = [];
  const check = (label: string, text: string) => {
    const bad = extractNumericTokens(text).filter((n) => !allowed.has(n));
    if (bad.length > 0) problems.push(`${label} invents ${bad.join(", ")}: "${text.slice(0, 60)}"`);
  };
  check("prose", summary.prose);
  (summary.insights ?? []).forEach((insight, i) => check(`insight ${i + 1}`, insight));
  return problems.length === 0 ? ok("grounded") : fail("grounded", problems.join(" · "));
}

// 8. Terminal status.
function statusIs(events: AgentEvent[], persona: Persona): AssertionResult {
  const summary = summaryEvent(events);
  if (!summary) return fail("status", "no summary.ready event");
  return summary.lead.status === persona.expect.status
    ? ok("status", summary.lead.status)
    : fail("status", `expected ${persona.expect.status}, got ${summary.lead.status}`);
}

export function runAssertions(events: AgentEvent[], persona: Persona): AssertionResult[] {
  return [
    aiDisclosurePresent(events),
    zeroUnprovenancedNumbers(events),
    escalationsFired(events, persona),
    fieldCompleteness(events, persona),
    confirmationOccurred(events, persona),
    summaryMatchesStateMachine(events),
    summaryInsightsGrounded(events),
    statusIs(events, persona),
  ];
}
