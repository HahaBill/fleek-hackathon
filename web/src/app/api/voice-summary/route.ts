import { createCore, loadSeed } from "@fleek/core";
import type { SummaryInput } from "@fleek/shared";
import { createSummaryAgent } from "@fleek/summary";

/**
 * Post-call summary for the LIVE VOICE path (ElevenLabs runs client-side with
 * no backend session, so there is no lead record when the call ends).
 *
 * Body = {transcript}. The deterministic qualification core replays the
 * buyer's turns — field capture, escalation rules, terminal status — and the
 * summary agent narrates the resulting record. The LLM never decides a field
 * value (PRD §3.2 D); everything rendered in the card's grid comes from
 * @fleek/core. Response = {lead, prose, insights, nextActionPhrasing?}.
 */

const isTranscript = (v: unknown): v is SummaryInput["transcript"] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(
    (t) =>
      t &&
      typeof t === "object" &&
      ((t as { role?: unknown }).role === "buyer" || (t as { role?: unknown }).role === "agent") &&
      typeof (t as { text?: unknown }).text === "string"
  );

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { transcript } = (body ?? {}) as Record<string, unknown>;
  if (!isTranscript(transcript)) {
    return Response.json({ error: "transcript required" }, { status: 400 });
  }

  const core = createCore(loadSeed());
  const events: SummaryInput["events"] = [];
  for (const turn of transcript) {
    if (turn.role !== "buyer") continue;
    core.noteBuyerTurn(turn.text);
    for (const fired of core.evaluateEscalations(turn.text)) {
      core.requestHandoff(fired.reason, turn.text.slice(0, 140));
      events.push({ kind: "escalation", detail: fired.reason });
    }
  }
  // "hangup": the browser session simply ended — no end_call tool exists on
  // this path, and the core computes the honest terminal status from that.
  const lead = core.finalize("hangup");

  // Headroom over the package's 5s default: first call in a fresh server pays
  // SDK + TLS warm-up. Stays under the client fetch's 15s abort.
  const agent = createSummaryAgent({ timeoutMs: 12_000 });
  const summary = await agent({ lead, transcript, events });
  return Response.json({ lead, ...summary });
}
