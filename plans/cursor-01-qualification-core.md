# Cursor Composer 2.5 — Build Plan: Qualification Core (`packages/core`)

> Paste this whole file into Composer as the task. It is self-contained; where it says
> "see `plans/00-shared.md`" the file is in this repo and you should open it.

## Mission

Build the **deterministic brain** of an inbound voice agent for a secondhand-clothing
wholesale supplier (Fleek x a16z hackathon). The LLM converses; **this package decides**.
Implement the `QualificationCore` interface exactly as defined in Plan 0. No network calls,
no LLM calls, 100% unit-testable. Stack: **TypeScript, vitest, zod, Node 20+**.

This is the source-of-truth center of the system — Plan 2 (voice server) and Plan 4 (evals)
import it unchanged. Correctness and determinism matter more than cleverness.

## Scope — build exactly this, nothing more

Create a small pnpm workspace containing **only** two packages:

```
package.json               # workspace root (private, packageManager pnpm@9)
pnpm-workspace.yaml         # packages: ["packages/*"]
tsconfig.base.json          # shared strict TS config
packages/
  shared/                   # contracts only (zod + types) — verbatim from Plan 0
    package.json            # name: @fleek/shared
    tsconfig.json
    src/contracts.ts
    src/index.ts            # re-export ./contracts
  core/                     # THIS component — all logic + tests
    package.json            # name: @fleek/core, deps: @fleek/shared (workspace:*), zod
    tsconfig.json
    vitest.config.ts
    src/
      knowledge.ts
      stateMachine.ts
      escalations.ts
      leadBuilder.ts
      core.ts
      index.ts              # export createCore + loadSeed + types
      seed/karachi-vintage-co.json
    test/
      knowledge.test.ts
      stateMachine.test.ts
      escalations.test.ts
      leadBuilder.test.ts
      core.test.ts          # PRD 3.4 worked-trace replay
```

### Hard constraints (do not violate)

- **Do NOT touch `web/`.** The frontend is a separate flat Next.js app on npm, outside this
  workspace's globs. Leave it exactly as-is. Do not add it to `pnpm-workspace.yaml`.
- **Do NOT create** `packages/{evals,summary,voice-client}` or `apps/server` — other plans own those.
- **No runtime logic in `packages/shared`** — types, zod schemas, and interfaces only.
- **`packages/shared/src/contracts.ts` must be copied VERBATIM** from the `## packages/shared/src/contracts.ts (verbatim)` block in `plans/00-shared.md`. Do not paraphrase, rename, or "improve" it — Plan 2/3/4 depend on byte-compatible types. (The existing `web/src/lib/contracts.ts` is a type-only mirror of the same thing; keep them aligned but do not edit it.)
- **No network, no filesystem side effects at runtime, no LLM calls.** Pure functions + in-memory state.
- **Never fuzzy-invent knowledge.** A miss returns `not_found`; the escalation engine handles it.
- Node 20+. Use `pnpm` (enable via `corepack enable pnpm`). Keep dependencies minimal:
  `packages/core` → `@fleek/shared` (`workspace:*`) + `zod`; dev: `vitest`, `typescript`.

## Setup steps

1. `corepack enable pnpm` (Node 22 is installed; pnpm is not — corepack ships with Node).
2. Root `package.json`: `{ "name": "fleek-hack", "private": true, "packageManager": "pnpm@9" }`.
   `pnpm-workspace.yaml`: `packages: ["packages/*"]`.
3. `tsconfig.base.json`: strict, `"target": "ES2022"`, `"module": "ESNext"`,
   `"moduleResolution": "Bundler"`, `"resolveJsonModule": true`, `"esModuleInterop": true`,
   `"skipLibCheck": true`, `"declaration": true`, `"strict": true`.
4. Create `packages/shared` (contracts verbatim + `index.ts` re-export). Depends on `zod`.
5. Create `packages/core` per the steps below.
6. `pnpm install`.
7. Run `pnpm --filter @fleek/core test` and **iterate until every test is green.**

---

## Implementation steps (order matters)

### 1. Seed supplier knowledge — `src/seed/karachi-vintage-co.json`

One realistic Karachi supplier: **"Karachi Vintage Co."** Numbers appear on stage, so keep
them plausible. Represent both stock and policies as flat records that your knowledge service
can search. Suggested shape:

```jsonc
{
  "supplier": "Karachi Vintage Co.",
  "stock": [
    // each conforms to KnowledgeFactSchema (category, styleTags[], brands[], grade?,
    // availability, unitPriceRange?, balePrice?, moq?, origin?, notes?)
    { "category": "denim", "styleTags": ["90s", "vintage", "jeans"], "brands": ["Levi's", "Wrangler"],
      "grade": "A/B", "availability": "in stock", "unitPriceRange": [2.10, 3.40], "moq": 50, "origin": "Karachi" },
    { "category": "knitwear", "styleTags": ["sweaters", "jumpers"], "brands": [],
      "grade": "A", "availability": "in stock", "unitPriceRange": [1.60, 2.20], "moq": 100, "origin": "Karachi" },
    { "category": "graphic tees", "styleTags": ["tees", "t-shirts", "printed"], "brands": [],
      "grade": "A/B/C", "availability": "in stock", "balePrice": 850, "moq": 200, "origin": "Karachi" }
    // add 1–2 more (e.g. jackets/outerwear, workwear) for texture
  ],
  "policies": {
    "shipping_regions": ["UK", "EU", "US"],
    "lead_times": "7–14 days to UK",
    "payment_language": "50% deposit, balance before shipment",
    "escalation_contact": "Imran (owner)"
  }
}
```

The knowledge service should also expose policies as searchable facts with `category: "policy"`
(map each policy into a `KnowledgeFact`-shaped record, e.g. `availability` = the policy text).

### 2. Knowledge service — `src/knowledge.ts`

`searchKnowledge(query, filters?): KnowledgeResult`

- Lowercase keyword + tag matching against stock `category`, `styleTags`, and `brands`.
- `filters` (`Record<string,string>`) narrow results by `grade` / `category`.
- Policy questions ("shipping", "payment", "lead time", "deposit", "delivery") match the
  `category: "policy"` facts.
- Returns `{ kind: "facts", facts: [...] }` on hit, `{ kind: "not_found" }` on miss.
- **Never fuzzy-invents.** No partial-credit hallucination.

**Tests (`test/knowledge.test.ts`):** hit (`"90s denim"` → denim facts incl. MOQ + price
range), miss (`"bridal wear"` → `not_found`), filter narrowing (grade/category), policy
lookup (`"shipping"` → shipping regions; `"payment"` → deposit language).

### 3. Qualification State Machine — `src/stateMachine.ts`

Tracks all eight `FieldName`s, each `{ state: "pending" | "captured", value?: string }`.

Public API:
- `capture(field, value)` — set/overwrite. **Conflicting requirement → later value wins AND a
  conflict event is logged** (surface these events so `leadBuilder` can attach them).
- `chips(): FieldChipState[]` — stable order matching the shared `FIELD_NAMES` order.
- `nextQuestion(): FieldName | null` — single most-important **missing** field, priority:
  **contact > category > quantity > destination > deadline > grade > budget > brand**.
  Ask ONE at a time. Return `null` when nothing important is missing.
- `canQualify(): boolean` — `contact` captured **AND** ≥1 actionable commercial requirement:
  (`category` + `quantity`) **or** (`category` + `budget`).
- `confirmed` flag, set only by explicit `markConfirmed()` (the server calls this when the model
  passes `confirmed: true` to `create_or_update_lead` after the buyer approves the read-back).

**Deterministic extraction (`noteBuyerTurn(text)`)** — belt-and-braces; the model's
`create_or_update_lead` tool calls are the *primary* capture path, so **only capture what
clearly matches**, never guess:
- quantities: `/\b(\d+)\s*(pieces|pcs|units|pc)\b/i`
- email → contact.method (`/[^\s@]+@[^\s@]+\.[^\s@]+/`), phone → contact.method
- deadline: month names (`january…december`) or `"before <X>"` / `"by <X>"`
- grade: `/grade\s+([abc])/i`
- destination: city/country from a small known list (London, UK, EU, US, Manchester, Berlin, …)
- category: vocabulary drawn from the seed file's categories + styleTags

Be conservative in extraction: e.g. `"$1.80 if I take 400"` is a *discount ask* (escalation
context), it must **not** silently overwrite a previously captured quantity of 200. Prefer
letting explicit `upsertLead` tool calls drive committed values.

**Tests (`test/stateMachine.test.ts`):** each transition input path
(`in_progress → qualified_follow_up | human_handoff_requested | unresolved` — assert via
`canQualify`/status inputs), partial details, conflicting requirements (later wins + event
logged), chips ordering, next-question priority, `noteBuyerTurn` extraction for each heuristic.

### 4. Escalation Rules Engine — `src/escalations.ts`

Rules as **data**: `{ id: RuleId, description: string, matcher: (text: string) => boolean, action: "escalate" | "state_unavailable" }`.
`id`s are exactly the shared `RULE_IDS` (the eval harness asserts on them):

| id | fires on (examples) | not on (near-miss) |
|---|---|---|
| `binding_price_request` | "can you do $1.80", "any discount", "best price if I take 400", "give me a better rate" | "what's the price?" (that's a knowledge question) |
| `exclusive_or_payment_exception` | "exclusive allocation", "can I pay net-30 / on delivery", "hold all stock for me" | generic payment-policy question |
| `complaint_or_legal` | "this is defective / a scam", "I'll sue", "lawyer", "refund or I report you" | "what's your return policy?" |
| `human_requested` | "speak to a person / human / owner / manager", "put me through to Imran" | "are you a real person?" (disclosure question) |
| `item_not_in_knowledge` | **triggered by a `not_found` knowledge result, NOT by text match** | — |

`evaluateEscalations(buyerText): { rule: RuleId; reason: string }[]` runs the **text-based**
matchers and returns all fired rules with human-readable reasons. `item_not_in_knowledge` is
**not** text-matched here — `core.ts` fires it programmatically when `searchKnowledge` returns
`not_found` on a buyer request (record it as a guardrail/escalation event with that ruleId).

**Tests (`test/escalations.test.ts`):** each text rule fires on 2–3 phrasings and does NOT fire
on its near-miss. Confirm `item_not_in_knowledge` is excluded from text matching.

### 5. Lead builder + finalize — `src/leadBuilder.ts`

Assemble a `LeadRecord` from state-machine values + escalation + guardrail events. Map the
singular state-machine fields onto the `LeadRecord.requirements` shape:
`category → categories: [value]`, `brand → brands: [value]`, `quantity → number`,
`budget → number`, `grade`, `destination`, `deadline → timeframe`, `contact → { name, method }`.

`finalize(endedBy: "end_call" | "hangup"): LeadRecord` computes terminal status
**deterministically, in this precedence order**:
1. handoff requested at any point → `human_handoff_requested`  *(handoff trumps everything)*
2. else `canQualify() && confirmed` → `qualified_follow_up`
3. else → `unresolved`

`recommendedNextAction`: template-based, e.g.
`"Call {name} today — {escalation reason | deadline-driven | new qualified lead}"`.

Validate every assembled record with `LeadRecordSchema.parse` (from `@fleek/shared`). Malformed
tool args from the model must be rejected with a **typed error**, never crash the process.
`snapshot()` returns current (possibly non-terminal) state; `finalize()` returns terminal.

**Tests (`test/leadBuilder.test.ts`):** the full status matrix (all handoff/canQualify/confirmed
combinations), malformed args rejected with typed error, `recommendedNextAction` templates.

### 6. Compose `QualificationCore` — `src/core.ts`

`createCore(seed): QualificationCore` wires steps 2–5 behind the Plan 0 interface. Export a
`createCore` factory + a `loadSeed` helper (imports the seed JSON) from `src/index.ts`.

Implement every method of `QualificationCore`:
`noteBuyerTurn`, `searchKnowledge` (fires `item_not_in_knowledge` escalation event on
`not_found`), `upsertLead` (returns `{ leadId, missingFields }`), `requestHandoff`
(returns `{ handoffId }`, records a handoff so `finalize` returns `human_handoff_requested`),
`evaluateEscalations`, `chips`, `nextQuestion`, `markConfirmed`, `recordGuardrailEvent`,
`finalize`, `snapshot`.

**Integration test (`test/core.test.ts`)** — replay the PRD §3.4 worked trace exactly, then
assert the final record. Drive it with this deterministic call sequence (so committed values
are unambiguous):

```ts
const core = createCore(loadSeed());
core.noteBuyerTurn("Hi, do you have 90s denim? I run a vintage shop in London.");
core.searchKnowledge("90s denim");                       // → facts (denim)
core.upsertLead({ categories: ["denim"] });
core.noteBuyerTurn("Maybe 200 pieces, Grade A, need them before August.");
core.upsertLead({ quantity: 200, grade: "A", timeframe: "before August" });
core.noteBuyerTurn("Yes London. I'm Maya — maya@shopmail.com. Can you do $1.80 if I take 400?");
core.upsertLead({ destination: "London", contact: { name: "Maya", method: "maya@shopmail.com" } });
const fired = core.evaluateEscalations("Can you do $1.80 if I take 400?");   // binding_price_request
core.requestHandoff("volume discount request", "400pc @ $1.80");
core.markConfirmed();                                     // buyer said "Correct."
const lead = core.finalize("end_call");
```

Assert:
- `lead.status === "human_handoff_requested"` — **pinned decision: handoff trumps**, even though
  all fields are captured and confirmed. The red badge + escalation callout is the demo payoff.
- `lead.escalation.reason === "volume discount request"` present on the record.
- `fired` includes `{ rule: "binding_price_request", ... }`.
- Requirements captured: `categories` includes `"denim"`, `quantity === 200`, `grade === "A"`,
  `destination === "London"`, `timeframe` reflects "before August", `contact.name === "Maya"`,
  `contact.method === "maya@shopmail.com"`.
- `chips()` shows the captured fields as `"captured"` (green in the UI).

---

## Acceptance criteria (definition of done)

- `pnpm install` succeeds; `pnpm --filter @fleek/core test` is **fully green**.
- `pnpm --filter @fleek/core exec tsc --noEmit` passes with `strict` on (no type errors).
- `packages/shared/src/contracts.ts` is byte-verbatim from `plans/00-shared.md`.
- Every `QualificationCore` method is implemented and exercised by a test.
- The §3.4 integration test passes with the pinned `human_handoff_requested` outcome.
- `web/` is untouched; no extra packages created; no network/LLM/filesystem calls at runtime.

## Notes for the model

- Reference `plans/00-shared.md` (contracts + interfaces) and `plans/01-qualification-algo.md`
  (this component's spec) and PRD §3.2–3.5 for behavioural intent. Where this file and those
  disagree, **this file wins** for scope; the shared contracts win for type shapes.
- Behavioural assertions only — never assert on model wording. This package has no model in it.
- Keep it deterministic and pure. If you're tempted to add "smart" fuzzy matching, don't —
  the whole product thesis is that this layer is boringly predictable.
