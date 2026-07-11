# Plan 3 — Single-Screen Frontend (`apps/web`) · ~3.5 hours · zero backend dependency until integration

## Context (paste-ready for Composer)

You are building the ONE screen of a supplier voice agent demo (Fleek x a16z hackathon): call button → live conversation with compact transcript → end-of-call summary card. The summary card IS the supplier-facing product. You build **entirely against a `MockTransport`** that replays a scripted event fixture, so no backend is needed until integration. All event/transport types come from `packages/shared/src/contracts.ts` (see Plan 0 — create `packages/shared` first if missing). Stack: React + Vite + TypeScript, Tailwind, vitest + @testing-library/react (Playwright optional).

**Aesthetic: sparse.** This is judged on stage — dark, calm, generous whitespace, one accent color. No dashboard chrome, no nav, no routes.

## Deliverables

```
apps/web/
  src/
    App.tsx               # state machine: idle → in-call → post-call
    transport/mock.ts     # MockTransport implementing SessionTransport
    transport/fixtures/demo-call.ts   # scripted AgentEvent[] with timings
    components/
      IdleScreen.tsx      # supplier card + call button + disclosure + "Type instead"
      CallScreen.tsx      # timer, transcript, chips, mute/end controls
      Transcript.tsx      # buyer right / agent left / tool + guardrail event lines
      ChipsRow.tsx        # field-capture chips
      SummaryCard.tsx     # the payoff
      TextComposer.tsx    # text-mode input bar
  test/
```

## Steps

### 1. Mock transport + demo fixture (~40 min) — do this FIRST
`fixtures/demo-call.ts`: the PRD Section 3.4 worked trace encoded as `{delayMs, event: AgentEvent}[]` — session.started → buyer/agent `turn` events (stream agent turns as several non-final then one final frame to exercise streaming UI) → `tool.call`/`tool.result` ("search_supplier_knowledge → 3 facts") → `chips` updates flipping fields → `guardrail {kind:"escalation", detail:"volume discount request 400pc @ $1.80"}` → confirmation turns → `call.ended` → `summary.ready` with a fully-populated `LeadRecord` (Maya / 200pc Grade A 90s denim / London / before August / maya@shopmail.com, status `human_handoff_requested` — handoff trumps, per Plan 1) + prose + 2 insights (discount push / deadline-driven). `MockTransport` implements `SessionTransport`: `start()` replays with delays; `sendText()` echoes a canned reply path; `end()` jumps to the terminal events. Add a second short fixture for the `unresolved` path.

### 2. App shell + State A (idle) (~30 min)
`App.tsx` holds `"idle" | "in-call" | "post-call"` + `mode: "voice" | "text"`. State A: supplier avatar + "Karachi Vintage Co.", one large pulsing "Call supplier" button, disclosure line "Calls are answered by an AI assistant and transcribed", small "Type instead" link. Nothing else.

### 3. State B (in-call) (~60 min)
- Call button morphs to end-call + running `mm:ss` timer.
- **Transcript**: max ~40vh, auto-scroll (pinned to bottom unless user scrolls up), small type. Buyer right-aligned, agent left-aligned; agent turns render streaming (non-final frames update in place). **Tool-event lines** inline, muted monospace: `⛁ search_supplier_knowledge → 3 facts`. **Guardrail/escalation lines** inline, warning style: `⚠ escalated: volume discount request`.
- **ChipsRow**: all eight fields as chips, `pending` (dim, "…") → `captured` (accent, ✓ + value) with a satisfying flip transition — this is the state machine made visible, judges must notice it.
- Mute button (calls `transport.setMuted?`), End call (calls `transport.end()`).
- **Text mode**: same screen with `TextComposer` bar instead of mic indicator; submit → `transport.sendText()`. Same transcript, same chips.

### 4. State C (summary card) (~50 min)
On `summary.ready`: transcript collapses to a "View transcript" fold; **SummaryCard takes over**:
- Header: buyer name + status badge — `qualified follow-up` green / `human handoff` red / `unresolved` gray.
- Structured field grid rendered **only from `event.lead`** (never from prose): category, grade, quantity, budget, destination, deadline, contact. Missing fields shown as "—".
- Prose brief (2–3 sentences), then emphasized "Recommended next action" line, then escalation reason callout if present.
- "Insights" list (from `event.insights`, if present): up to 4 short bullets, e.g. "Asked about 400pc at a lower price — upsell potential". Render only; never derive.
- "New call" button → reset to State A (fresh transport).
Make this the most designed component — it's the closing shot of the demo.

### 5. Edge states + polish (~40 min)
- `B → A` on transport error with toast: "Couldn't connect. Try text mode."
- `call.ended {endedBy:"hangup"}` before qualification → summary card renders the `unresolved` fixture correctly.
- Keyboard: Enter submits text mode; Esc = end call (demo convenience).
- A hidden `?fixture=demo|unresolved&autoplay=1` query param that auto-runs the mock — this doubles as fallback rung 3 (playing a recorded session over the live UI).

## Test independently
- `pnpm --filter @fleek/web test`: render tests — A→B→C flow driven by MockTransport; chips flip on `chips` events; tool/guardrail lines render with correct styling; summary grid matches `lead` exactly (assert a field present in prose but absent in `lead` does NOT render); error path returns to A.
- Manual: `pnpm --filter web dev` → click call → watch the whole PRD demo trace play out with zero backend.

## Integration surface
- Checkpoint 2: replace `new MockTransport(fixture)` with the real transports from `packages/voice-client` (Plan 2). One constructor swap behind a `TRANSPORT=mock|real` env flag — keep the flag, it's the demo fallback ladder. Which voice vendor backs the real transport (`RealtimeTransport` vs `ElevenLabsTransport`) is chosen by `VOICE_PROVIDER` and is invisible to every component in this plan — the UI only ever sees `SessionTransport` + `AgentEvent`s.
