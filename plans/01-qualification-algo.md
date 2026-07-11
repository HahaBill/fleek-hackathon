# Plan 1 — Qualification Core (`packages/core`) · ~3 hours · zero external dependencies

## Context (paste-ready for Composer)

You are building the deterministic brain of an inbound voice agent for a secondhand-clothing wholesale supplier (Fleek x a16z hackathon). The LLM converses; **this package decides**. It implements the `QualificationCore` interface from `packages/shared/src/contracts.ts` (see Plan 0 — create `packages/shared` first if it doesn't exist). No network calls, no LLM calls, 100% unit-testable. Stack: TypeScript, vitest, zod.

## Deliverables

```
packages/core/
  src/
    knowledge.ts        # search_supplier_knowledge over seed JSON
    stateMachine.ts     # qualification state machine
    escalations.ts      # declarative rules engine
    leadBuilder.ts      # lead assembly + validation + terminal status
    core.ts             # QualificationCore implementation composing the above
    seed/karachi-vintage-co.json
  test/                 # vitest suites per module
```

## Steps

### 1. Seed supplier knowledge (~20 min)
Create `seed/karachi-vintage-co.json`: one realistic Karachi supplier — "Karachi Vintage Co." Stock entries (each conforming to `KnowledgeFactSchema`): 90s denim (grades A/B, MOQ 50, $2.10–3.40/pc), knitwear (grade A, MOQ 100, $1.60–2.20), graphic tees (grades A/B/C, MOQ 200, bale price $850), plus 1–2 more. Policies block: `shipping_regions: ["UK", "EU", "US"]`, `lead_times: "7–14 days to UK"`, `payment_language: "50% deposit, balance before shipment"`, `escalation_contact: "Imran (owner)"`. Make numbers plausible — they appear on stage.

### 2. Knowledge service (~30 min)
`searchKnowledge(query, filters?)`: lowercase keyword + tag matching against stock categories, style tags, and brands; filters narrow by grade/category. Returns `{kind:"facts", facts:[...]}` or `{kind:"not_found"}` — **never** fuzzy-invents. Also match policy questions ("shipping", "payment", "lead time") to policy facts (represent policies as facts with `category:"policy"`).
Tests: hit ("90s denim" → denim facts incl. MOQ+price), miss ("bridal wear" → not_found), filter narrowing, policy lookup.

### 3. Qualification State Machine (~45 min)
`stateMachine.ts` tracks all eight `FieldName`s with `pending | captured` + captured value. Public API: `capture(field, value)`, `chips()`, `nextQuestion()` (priority order: contact > category > quantity > destination > deadline > grade > budget > brand — ask ONE at a time), `canQualify()` (contact captured AND ≥1 actionable commercial requirement: category+quantity, or category+budget), `confirmed` flag set by an explicit `markConfirmed()` — exposed on the `QualificationCore` interface; the server calls it when the model passes `confirmed: true` to `create_or_update_lead` after the buyer approves the read-back.
Field extraction from buyer turns lives here too (`noteBuyerTurn`): deterministic regex/heuristics — quantities (`\d+\s*(pieces|pcs|units)`), emails/phones → contact, month names / "before X" → deadline, "Grade A/B/C" → grade, city/country list → destination, category vocabulary from the seed file. Keep it honest: only capture what clearly matches; the LLM's `create_or_update_lead` tool calls are the primary capture path, this is belt-and-braces.
Tests: every transition in the PRD diagram (`in_progress → qualified_follow_up | human_handoff_requested | unresolved`), partial details, conflicting requirements (later value wins, event logged), chips ordering, next-question priority.

### 4. Escalation Rules Engine (~30 min)
`escalations.ts`: rules as **data** — `{ id: RuleId, description, matcher: (text) => boolean | RegExp, action: "escalate" | "state_unavailable" }`, ids exactly the shared `RULE_IDS` (the eval harness asserts on them). Implement the five PRD rules: binding price/discount request ("can you do $X", "discount", "best price if I take"), exclusive allocation / payment exception, complaint or legal language, item outside knowledge base (triggered by `not_found` follow-up, not text match), explicit human request ("speak to a person/human/owner/manager").
`evaluateEscalations(buyerText)` returns all fired rules with reasons.
Tests: each rule fires on 2–3 phrasings and does NOT fire on near-misses ("what's the price?" is a knowledge question, not a discount push).

### 5. Lead builder + finalize (~30 min)
`leadBuilder.ts` assembles `LeadRecord` from state machine + escalation + guardrail events. `finalize(endedBy)` computes terminal status deterministically:
- handoff requested at any point → `human_handoff_requested`
- else `canQualify() && confirmed` → `qualified_follow_up`
- else → `unresolved`
`recommendedNextAction`: template-based, e.g. `"Call {name} today — {escalation reason | deadline-driven | new qualified lead}"`. Validation via `LeadRecordSchema.parse` — malformed tool args from the model are rejected with a typed error, never crash.
Tests: status matrix (all combinations), malformed args rejected, `recommendedNextAction` templates.

### 6. Compose `QualificationCore` (~30 min)
`core.ts`: `createCore(seed): QualificationCore` wiring 2–5 behind the interface from `packages/shared`. Export a factory + the seed loader. Add one integration-style test: replay the PRD's worked call trace (Section 3.4) as a sequence of `noteBuyerTurn`/tool calls (including `markConfirmed()` after "Correct.") and assert the final record — Maya, 200pc, Grade A denim, London, before August. **Status decision (pinned): handoff trumps, so the trace ends `human_handoff_requested`** with the escalation reason ("volume discount request") on the record — the red badge + escalation callout is the demo's payoff. The fields being fully captured still shows via green chips.

## Test independently
`pnpm --filter @fleek/core test` — everything green with no server, no LLM, no browser.

## Integration surface (what others consume)
- Plan 2 imports `createCore` and calls it per session (one core instance per call).
- Plan 4 imports `createCore` directly for in-process eval runs.
- Nothing here changes at integration time — this package is the stable center.
