# PRD — Supplier Voice Agent
**Fleek x a16z Hackathon · Track: Agents & LLMs · Status: LOCKED — build spec v2 (single-screen)**

**One-liner:** An inbound AI voice agent that answers buyer enquiries for secondhand clothing suppliers 24/7, qualifies deals within supplier-defined guardrails, and produces a structured lead summary — so no sale is lost while the supplier is grading, packing, or asleep.

**v2 scope decision:** ONE screen. Call button → live conversation with compact transcript → end-of-call summary card. No dashboard, no routes, no supplier admin UI. The summary card IS the supplier-facing product for the demo ("this is what the supplier wakes up to").

---

## 1. Problem & Evidence (why this is real, sourced)

Secondhand wholesale runs on conversations. Fleek exists because suppliers were negotiating over Instagram and ad-hoc video calls (TechCrunch, Nov 2024). Three structural facts make enquiry load a real, unsolved cost:

1. **Time-zone mismatch.** Suppliers are in Pakistan, India, and Dubai; buyers are primarily in the US and Europe (TechCrunch). A London buyer's 2pm call is 7pm in Karachi — enquiries land while suppliers sleep. Unanswered calls are lost leads.
2. **Enquiries compete with physical work.** These wholesalers take in, sort, mend, clean, and ship up to 400,000 kg of clothing per day (TechCrunch). Every call answered is time off the floor.
3. **Deal context arrives scattered.** Category, brand, grade, quantity, budget, destination, deadline — collected across fragmented chats, often incomplete, forcing repeat conversations.

**The trap this product avoids:** an agent that overpromises stock, prices, or delivery is worse than no agent. Every design decision below flows from that constraint.

Source: https://techcrunch.com/2024/11/12/fleek-a-marketplace-for-wholesale-second-hand-clothes-sews-up-20m/

---

## 2. Solution

An **inbound, real-time voice agent** reached from a single web page (phone number = production roadmap, not demo scope). The buyer presses call and speaks naturally; the agent:

1. Discloses it is an AI assistant.
2. Answers questions **only** from supplier-approved knowledge (catalogue facts + policies).
3. Asks only for the qualification fields still missing.
4. Confirms the full request back to the buyer.
5. At call end, a **summary agent** composes the structured lead brief the supplier receives.

**Not** autonomous negotiation. **Not** order placement. The agent qualifies; the human closes.

**The asleep-supplier premise (drives all UI decisions):** the buyer and supplier are never online at the same time. The call happens without the supplier; the summary card is the asynchronous artifact they find later. Therefore: no live supplier monitoring, no notifications during calls, no barge-in, no real-time dashboard. One screen serves the whole story.

---

## 3. How It Works — Architecture

### 3.1 The three services (unchanged) + one screen

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌───────────────────────┐
│  VOICE SESSION       │     │  KNOWLEDGE &             │     │  SINGLE-SCREEN        │
│  SERVICE (backend)   │────▶│  QUALIFICATION SERVICE   │────▶│  FRONTEND             │
│                      │     │  (backend)               │     │                       │
│ · Creates Realtime   │     │ · search_supplier_       │     │ · State A: idle       │
│   sessions (server-  │     │   knowledge (facts API)  │     │   (call button)       │
│   side credentials)  │     │ · Qualification State    │     │ · State B: in-call    │
│ · Injects agent      │     │   Machine (deterministic)│     │   (transcript + chips)│
│   instructions       │     │ · Escalation Rules       │     │ · State C: post-call  │
│ · Routes tool calls  │     │   Engine (declarative)   │     │   (summary card)      │
│ · Numeric Provenance │     │ · Lead builder +         │     │                       │
│   Guardrail          │     │   validation             │     │                       │
│ · Lifecycle events   │     │ · Summary Agent (LLM,    │     │                       │
│                      │     │   post-call composition) │     │                       │
└─────────────────────┘     └──────────────────────────┘     └───────────────────────┘
        OpenAI Realtime API          Deterministic core,              One page,
        (speech in/out)              fully unit-testable              three states
```

**Design principle (say this on stage):** *the LLM converses; deterministic services decide.* The model never determines lead status, never invents a number, never chooses whether to escalate. It talks; the machines govern.

### 3.2 The five named components (technical depth)

**A. Qualification State Machine (deterministic).**
Tracks required fields: `contact`, `category`, `quantity`, plus optional `brand`, `grade`, `budget`, `destination`, `deadline`. After every buyer turn, the service — not the model — computes: which fields are filled, which are missing, what single question to ask next, and whether the lead can transition state. Runs DURING the call (visible as chips in the UI). Transitions:

```
in_progress ─▶ qualified_follow_up     (contact + ≥1 actionable commercial requirement, confirmed)
in_progress ─▶ human_handoff_requested (escalation rule fired)
in_progress ─▶ unresolved              (call ended before qualification)
```

**B. Numeric Provenance Guardrail.**
Every number the agent speaks (price, MOQ, lead time, quantity) must originate from a `search_supplier_knowledge` tool response in the current session. The voice session service post-processes each agent turn: a number without tool provenance triggers an immediate self-correction and logs a guardrail event. Architectural answer to "how do you stop it promising a discount?"

**C. Escalation Rules Engine (declarative).**
Rules stored as data, evaluated on every turn:

| Trigger | Action |
|---|---|
| Buyer requests binding price / discount | Escalate + capture context |
| Exclusive allocation or payment exception | Escalate |
| Complaint or legal issue | Escalate immediately |
| Item outside knowledge base | State unavailability, offer human follow-up |
| Buyer explicitly asks for a human | Escalate |

The agent must never promise inventory, order acceptance, shipping dates, or discounts. Escalation ≠ failure; it is a first-class lead outcome.

**D. Summary Agent (NEW — the post-call composer).**
Critical architecture rule: **the summary agent narrates an already-structured record; it does not extract from raw transcript.** Input: the state machine's final lead record (deterministic fields) + transcript + guardrail/escalation events. Output: a prose brief + recommended next action. The LLM writes the paragraph; it cannot alter, add, or invent a field value. Rendered fields on the card come from the state machine ONLY. (If the summary agent extracted from raw transcript instead, the state machine would be decorative and one hallucinated quantity kills the demo.)

**E. Eval Harness.**
Ten scripted buyer personas replayed automatically (text transport), with assertions per transcript: AI disclosure present · zero unprovenanced numbers · correct escalations fired · lead field-completeness % · confirmation step occurred · summary card fields exactly match state-machine record. Personas: easy buyer, price-pusher, vague browser, complainer, off-topic caller, multilingual buyer, interrupter, everything-at-once buyer, unavailable-item hunter, human-demander.

### 3.3 Tool contract (the agent's only capabilities)

```
search_supplier_knowledge(query, filters?) → facts[] | "not_found"
create_or_update_lead(fields)              → lead_id, missing_fields[]
request_human_follow_up(reason, context)   → handoff_id
end_call(outcome)                          → closes session
```

Tool responses are authoritative. If knowledge returns `not_found`, the agent says so — it never infers.

### 3.4 Worked call trace (= the demo script core)

```
BUYER  "Hi, do you have 90s denim? I run a vintage shop in London."
AGENT  [discloses AI] → search_supplier_knowledge("90s denim")
       → facts: {category: denim, era: 90s, grades: [A,B], MOQ: 50, price: $2.10–3.40/pc}
       "Yes — 90s denim in Grades A and B, minimum order 50 pieces,
        $2.10–3.40 per piece depending on grade. What quantity are you after?"
BUYER  "Maybe 200 pieces, Grade A, need them before August."
AGENT  [state machine: missing → contact, destination]
       "Got it — 200 pieces Grade A by early August. Shipping to London?
        And what's the best way to reach you?"
BUYER  "Yes London. I'm Maya — maya@shopmail.com. Can you do $1.80 if I take 400?"
AGENT  [Escalation Rules Engine: binding-discount trigger fires]
       → request_human_follow_up(reason: "volume discount request 400pc @ $1.80")
       "That's a deal the supplier will want to discuss directly — I've flagged it
        as priority. To confirm: 200–400 pieces, 90s denim Grade A, London,
        before August, contact maya@shopmail.com. Correct?"
BUYER  "Correct."
AGENT  → create_or_update_lead(...) → qualified_follow_up + handoff → end_call
SCREEN Summary card renders: structured fields + prose brief + next action.
```

Runtime: ~90 seconds. The escalation firing live is the demo's drama beat.

### 3.5 Data model (demo scope)

**SupplierKnowledge (seed JSON, no admin UI):** `stock[] {category, style_tags, brands, grade, availability, unit_price_range, bale_price, moq, origin, notes}` + `policies {shipping_regions, lead_times, payment_language, escalation_contact}`. One realistic Karachi supplier profile (denim / knitwear / tees, plausible grades and prices).
**Lead:** `contact {name, method}, requirements {categories, brands, grade, quantity, budget, currency, destination, timeframe}, questions[], summary, transcript_ref, unknown_fields[], status, recommended_next_action, guardrail_events[]`

---

## 4. UI Specification — ONE screen, three states

### State A — Idle
- Supplier name + avatar ("Karachi Vintage Co.")
- One large call button: "Call supplier"
- Disclosure line beneath: "Calls are answered by an AI assistant and transcribed"
- Small "Type instead" link (opens text mode — same pipeline, fallback rung 2)
- Nothing else. Sparse is the aesthetic.

### State B — In-call
- Call button morphs to end-call control + running timer (mm:ss)
- **Compact live transcript** (small type, auto-scrolling, ~40% of viewport max — it's ambience, not the hero):
  - Buyer turns right-aligned, agent turns left-aligned
  - **Tool-event lines** inline in the stream, muted style: "⛁ search_supplier_knowledge → 3 facts" — judges watch the agent look things up
  - **Guardrail/escalation events** inline, warning style: "⚠ escalated: volume discount request"
- **Field-capture chips row** (the state machine made visible): `category ✓ · quantity ✓ · contact … · destination …` — chips flip from pending to captured in real time
- Mute + End call controls

### State C — Post-call
- Transcript collapses to a folded "View transcript" toggle
- **Summary card takes over** (the payoff + the closing shot):
  - Header: buyer name + status badge (`qualified follow-up` green / `human handoff` red / `unresolved` gray)
  - Structured field grid (from the state machine record ONLY): category, grade, quantity, budget, destination, deadline, contact
  - Prose brief (from the Summary Agent): 2–3 sentences
  - "Recommended next action" line, emphasized: "Call Maya today — volume discount intent, deadline-driven"
  - Escalation reason surfaced if present
- "New call" button resets to State A

### State transitions
```
A (idle) ──press call──▶ B (in-call) ──end_call tool | hangup──▶ C (summary)
C ──new call──▶ A
B ──connection failure──▶ A with error toast ("Couldn't connect. Try text mode")
Text mode: A ──type instead──▶ B-text (same pipeline, chat input instead of mic) ──▶ C
```

### Explicitly CUT from UI scope (do not build)
Dashboard/routes · lead queue/history · metrics bar (say numbers verbally in pitch) · editable knowledge UI (seed JSON in repo; show file for 3s if asked) · standalone guardrail log view (events render inline in transcript) · supplier notifications · live monitoring / barge-in · multi-supplier support.

---

## 5. Demo Plan

**Opening line:** *"It's 3am in Karachi. A buyer in London wants 200 pieces of 90s denim. Today, that call rings out and the sale walks. Watch what happens instead."*

**Script (3:00), all on the one screen:**
- 0:00–0:20 — Problem framing (line above + one supplier-workload fact)
- 0:20–2:00 — Live call: knowledge answer → qualification chips filling → **discount push → escalation fires in transcript** → confirmation → one **Hindi/Urdu exchange** (15s; Realtime handles it natively; suppliers speak these languages)
- 2:00–2:40 — Call ends → summary card lands → *"The supplier slept through everything you just watched. This card is what they wake up to."*
- 2:40–2:55 — 10 seconds on the eval harness screen ("we test that it never invents a number — here are 10 hostile buyers run automatically")
- 2:55–3:00 — Close: *"The agent qualifies; the supplier closes. Same backend, next channel: WhatsApp voice notes."* + cost line: ≈ $0.0X per qualified lead vs. supplier minutes worth $Y (pre-compute; mirrors Fleek's own $6M/yr frontier-model cost discipline).

**Fallback ladder (in order):**
1. Live voice, **headset mic** (never laptop mic in a demo hall)
2. Text mode — same pipeline, same chips, same summary card
3. Pre-recorded voice clip of a real session played over the live UI
4. Eval-harness replay as proof-of-life

**Hard limits:** perceived turn latency < 1s; agent wraps the call by ~90s. The demo buyer is scripted to push a discount so judges watch the guardrail fire.

---

## 6. Testing

- **Unit (knowledge & qualification service):** complete qualification · partial details · unavailable stock · conflicting requirements · malformed tool args · every escalation trigger · state-machine transitions · **summary-card fields === state-machine record (no LLM-introduced values)**.
- **Contract (tool handlers):** schema conformance, auth, failure responses.
- **Browser (mocked transport):** State A → B → C flow; chips update; summary renders; text mode works.
- **Eval harness:** 10 personas, run on every significant change.
- **Manual acceptance (before judging):** live Realtime — disclosure, interruption handling, provenance guardrail, missing-field logic, confirmation, escalation, summary card, Hindi exchange.

Behavioural assertions only — never assert model wording or provider event ordering.

---

## 7. Success Metrics

**Primary:** qualified-lead capture rate (completed calls yielding confirmed contact + ≥1 actionable commercial requirement).
**Secondary:** field-completeness % per lead · handoff rate · unresolved rate · guardrail-event rate (should trend to zero) · perceived latency.
Stated verbally in the pitch; the summary card shows per-call completeness implicitly (every chip green).

---

## 8. Q&A Landmines (prepared answers)

- **"Isn't this a thin Realtime wrapper?"** → The model only talks. Qualification is a deterministic state machine, escalation is a declarative rules engine, every spoken number carries tool provenance, the summary can't invent a field, and it's all covered by an automated eval harness. Five systems the wrapper doesn't have.
- **"Why voice, not WhatsApp?"** → Calls and voice notes are already the medium of this trade; voice is the harder channel, and the backend is channel-agnostic — WhatsApp voice notes are the same pipeline, next sprint.
- **"Where's the supplier's app?"** → Deliberately absent: the premise is an asleep supplier. The summary card is the async artifact; in production it arrives as WhatsApp/email + a phone number replaces the browser button. One screen is the product decision, not a shortcut.
- **"What if it promises something wrong?"** → It architecturally can't state a number that didn't come from the supplier's knowledge base — and when the buyer pushed for a discount, you watched it escalate instead of answer.
- **"Cost at scale?"** → [pre-computed]: ≈ $0.0X per qualified lead vs. supplier time worth $Y. Fleek rejected frontier models at $6M/yr for grading; same discipline applied to conversations.

---

## 9. Build Order (hackathon hours) — 3-person split

**Person A — Qualification core (start immediately, zero external deps):**
- H1: knowledge service + seed supplier JSON + state machine with unit tests
- H2: escalation rules engine + lead builder/validation
- H5–6: eval harness + 10 personas

**Person B — Voice pipeline:**
- H1–2: backend Realtime session service + tool handlers wired to A's service; first end-to-end **text-mode** conversation
- H3: browser voice working; provenance guardrail post-processor
- H5: summary agent (consumes A's lead record; prose only)

**Person C — Frontend + demo:**
- H1–2: single screen, three states, mocked data (build against fake events so no blocking on B)
- H3: wire to real event stream; transcript + tool-event lines + chips
- H4: summary card + text-mode input
- H6: demo data polish, Hindi exchange test, record fallback clip
- H7 (ALL): demo hardening — headset test in the actual room, script rehearsal ×3, latency check, run eval suite, freeze code

Integration checkpoints: end of H2 (text-mode E2E), end of H4 (voice E2E + card), 16:30 venue checkpoint (feature freeze — polish only after).

---

## 10. Post-Hackathon Assumptions to Validate

Which channels dominate supplier enquiries · phone number vs. embedded web voice first · minimum data for an actionable lead · how supplier knowledge stays current · whether buyers accept AI qualification at higher deal values · how the summary artifact should be delivered (WhatsApp/email/app).
