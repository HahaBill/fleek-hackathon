# Plan 2 — Voice Session Service (`apps/server`) · ~4 hours · needs OPENAI_API_KEY (+ optional ELEVENLABS_API_KEY)

## Context (paste-ready for Composer)

You are building the backend voice pipeline for an inbound supplier voice agent (Fleek x a16z hackathon). It creates voice sessions with a **pluggable voice provider — OpenAI Realtime or ElevenLabs Agents (ConvAI)** — routes the agent's tool calls into a deterministic qualification core, enforces the Numeric Provenance Guardrail, and runs a post-call Summary Agent. The provider only owns speech; tool execution, qualification state, guardrails, and the event stream are provider-agnostic and live on our server. It implements the wire protocol and `SessionTransport` interface from `packages/shared/src/contracts.ts` (see Plan 0 — create `packages/shared` first if missing). **Until Plan 1 lands, use a `FakeCore`** (hand-written, ~60 lines) implementing `QualificationCore` with canned denim facts — the swap at integration is one import. Stack: TypeScript, Fastify (+ @fastify/websocket), OpenAI Realtime API (WebRTC ephemeral tokens for voice, `gpt-realtime` via WebSocket for server-driven text mode is NOT needed — text mode uses a plain chat completions loop with the same tools), vitest.

## Deliverables

```
apps/server/
  src/
    index.ts              # Fastify bootstrap
    routes/session.ts     # POST /api/session, WS /ws/session/:id
    agent/instructions.ts # system prompt (AI disclosure, guardrails, tool usage)
    agent/tools.ts        # tool JSON schemas matching shared TOOL_NAMES
    agent/textLoop.ts     # text-mode agentic loop (chat completions + tools)
    providers/openai.ts   # mints ephemeral Realtime client secrets
    providers/elevenlabs.ts # ensures ConvAI agent config + mints signed URLs
    guardrail/provenance.ts
    summary/stub.ts       # fixed-prose SummaryAgent stand-in until Plan 4 merges
    session/store.ts      # sessionId → { core, events[], provenanceLedger, provider }
    fakeCore.ts           # stand-in until Plan 1 merges
packages/voice-client/    # small browser SDK, all implementing SessionTransport
  src/realtimeTransport.ts    # OpenAI WebRTC
  src/elevenLabsTransport.ts  # @elevenlabs/client ConvAI session
  src/textTransport.ts
```

## Steps

### 1. Session plumbing + event bus (~45 min)
`POST /api/session {mode, provider?}` → creates session in `store`, instantiates a core (`FakeCore` for now), returns `{sessionId, mode, voice?: VoiceCredentials}` (shared contract). Default provider from `VOICE_PROVIDER` env (`openai` | `elevenlabs`), overridable per request. Provider modules both expose `createVoiceSession(sessionId): Promise<VoiceCredentials>`:
- `providers/openai.ts`: mint an ephemeral Realtime client secret (`POST https://api.openai.com/v1/realtime/client_secrets`) with instructions + tool schemas injected.
- `providers/elevenlabs.ts`: on server startup, idempotently create/update a ConvAI agent via API (system prompt from `instructions.ts`, the four tools registered as **client tools** — config lives in code, not the dashboard); per session, mint a signed session URL (`GET /v1/convai/conversation/get-signed-url?agent_id=...`).

**API keys never reach the browser** in either case. `WS /ws/session/:id`: on connect, replay buffered events, then stream; every `AgentEvent` emitted anywhere in the pipeline goes through one `emit(sessionId, event)` that buffers + broadcasts.

### 2. Agent instructions + tool schemas (~30 min)
`instructions.ts`: disclose AI status in first turn; answer ONLY from `search_supplier_knowledge` results; never state a number not returned by a tool this session; ask one missing field at a time (the question target arrives via tool results — see step 3); confirm the full request before ending — and after the buyer approves the read-back, call `create_or_update_lead` once more with `confirmed: true`; on discount/human/complaint triggers call `request_human_follow_up`; support Hindi/Urdu naturally. `tools.ts`: JSON schemas for the four `TOOL_NAMES` exactly matching the shared contract; `create_or_update_lead` includes an optional `confirmed: boolean` arg.

### 3. Tool routing (~45 min)
One handler used by BOTH transports: `handleToolCall(sessionId, name, args)` →
- `search_supplier_knowledge` → `core.searchKnowledge` → record every number in the result into the session's **provenance ledger**; emit `tool.call` + `tool.result` (summary "→ 3 facts" / "→ not_found", `payload` = the full facts array — the eval harness verifies provenance from it).
- `create_or_update_lead` → `core.upsertLead`; if args include `confirmed: true` → `core.markConfirmed()`; response includes `missing_fields` AND `next_question` (from `core.nextQuestion()`) so the deterministic service — not the model — picks the next question; emit `chips`.
- `request_human_follow_up` → `core.requestHandoff`; emit `guardrail {kind:"escalation", ruleId}` (ruleId from the rules-engine hit that prompted it, if any).
- `end_call` → `core.finalize`, emit `call.ended`, trigger summary agent.
Also on every buyer turn: `core.noteBuyerTurn(text)` + record the buyer's own numbers into the provenance ledger (buyer-stated quantities may be restated by the agent); `core.evaluateEscalations(text)` — if a rule fires and the model hasn't called `request_human_follow_up` within that turn, inject a nudge ("Escalation rule fired: X. Call request_human_follow_up now."). Nudge delivery per transport: text mode → append to the loop history; OpenAI voice → send over the server WS to the browser transport, which injects it as a `conversation.item.create` on the data channel; ElevenLabs → `conversation.sendContextualUpdate()`. Emit updated `chips` after every buyer turn.

### 4. Text-mode loop (~45 min) — FIRST E2E MILESTONE
`textLoop.ts`: chat-completions agentic loop (model: fast/cheap tier) with the same instructions + tools. WS message `{type:"user_text"}` → append to history → loop until the model produces a text reply (executing tool calls via step 3 en route) → emit `turn` events. This is fallback rung 2 in the demo AND the eval-harness target. **Get this working end-to-end with FakeCore before touching voice.** Manual test: `pnpm dev` + a 20-line `scripts/repl.ts` that speaks WS from the terminal.

### 5. Numeric Provenance Guardrail (~40 min)
`provenance.ts`: post-process every final agent turn (text mode: before emitting; voice: on the transcript event). Extract numbers (prices, quantities, MOQs, lead times — regex incl. `$X`, ranges, "X pieces/days"); each must appear in the session's provenance ledger (with tolerance for formatting: `2.1` vs `$2.10`). Whitelist conversational numbers the buyer said (quantities they stated) and small ordinals. On violation: emit `guardrail {kind:"unprovenanced_number"}`, log to core via `recordGuardrailEvent`, and in text mode inject a self-correction system message ("You stated $1.80 without a knowledge-base source. Correct yourself."). Unit-test the extractor + ledger matching hard — this is the on-stage differentiator.

### 6. Voice transports (~75 min)
All transports implement `SessionTransport` — this package is what Plan 3 swaps in. Both voice transports follow the same shape: provider handles audio; tool calls and transcripts are forwarded to OUR server so guardrail + `noteBuyerTurn` + chips run server-side; the UI renders only the server's `AgentEvent` broadcast.
- `realtimeTransport.ts` (OpenAI): fetch `/api/session`, open WebRTC with the ephemeral secret, attach mic + remote audio; on data-channel `response.function_call_arguments.done` → `POST /api/session/:id/tool` → send `function_call_output` back on the data channel; forward transcript deltas over the server WS.
- `elevenLabsTransport.ts`: fetch `/api/session {provider:"elevenlabs"}`, start a `Conversation` via `@elevenlabs/client` with the signed URL, passing the four tools as `clientTools` whose implementations just `POST /api/session/:id/tool` and return the JSON result; wire `onMessage` (user/agent transcript callbacks) to the server WS; `endSession()` on `end()`. Note: ElevenLabs owns STT/TTS/turn-taking, so guardrail self-correction is post-hoc only there (the violation event still fires and logs; the correction nudge is an OpenAI-path feature — acceptable, say so if asked).
- `textTransport.ts`: thin WS wrapper.

Build OpenAI first (primary demo path), ElevenLabs second — it's the backup voice vendor AND a judge-pleasing "provider-agnostic by construction" line. If time is tight at the venue, ElevenLabs is the cuttable half of this step.

### 7. Summary Agent wiring (~15 min)
The Summary Agent itself is built in Plan 4 (`packages/summary`) behind the shared `SummaryAgent` function type. Here you only wire the seam: on `end_call`/hangup, `core.finalize()` → call the injected `SummaryAgent` with `{lead, transcript, events}` → emit `summary.ready {lead: <the exact finalized record>, prose, insights}`. **The lead object in the event comes straight from `finalize()`** — the agent's output contributes prose/insights strings only, never field values. Until Plan 4 merges, inject `summary/stub.ts` (returns fixed prose + one canned insight). Test: `summary.ready.lead` is deep-equal to `finalize()`'s output regardless of what the injected agent returns.

## Test independently
- `pnpm --filter @fleek/server test`: contract tests — tool handler schema conformance, malformed args → typed error responses, provenance extractor/ledger, summary field-immutability. All with FakeCore + mocked LLM.
- Manual: `scripts/repl.ts` text conversation end-to-end; then browser voice smoke test from a bare HTML page in `apps/server/public/dev.html` (mic → answer → tool call visible in logs) so voice is proven before the real frontend exists. `dev.html` gets a provider toggle — smoke-test both vendors from the same page.

## Integration surface
- Swap `fakeCore.ts` import → `createCore` from `@fleek/core` (Checkpoint 1).
- Swap `summary/stub.ts` → `createSummaryAgent` from `@fleek/summary` (Plan 4) — one injection change.
- Plan 3 consumes `packages/voice-client`; it picks a transport from `VOICE_PROVIDER` without knowing provider internals (Checkpoint 2).
- Plan 4 drives `WS /ws/session/:id` in text mode (Checkpoint 3) — provider-independent by design.

Env: `OPENAI_API_KEY` (required — text loop + summary agent use it even when voice is ElevenLabs), `ELEVENLABS_API_KEY` + optional `ELEVENLABS_AGENT_ID` (only for the ElevenLabs path), `VOICE_PROVIDER=openai|elevenlabs` (default `openai`).
