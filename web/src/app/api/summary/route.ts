import { LeadRecordSchema, type SummaryInput } from "@fleek/shared";
import { createSummaryAgent } from "@fleek/summary";

/**
 * Runs the post-call Summary Agent server-side (the OpenAI key never reaches
 * the browser). Body = SummaryInput {lead, transcript, events}; response =
 * SummaryOutput {prose, insights, nextActionPhrasing?}.
 *
 * The agent itself degrades to a deterministic template on any provider
 * problem (no key, quota, timeout, ungrounded output), so this route only
 * fails on malformed input.
 *
 * Stopgap seam: once the real voice server lands (plans/02 §7), it composes
 * the summary at call end and emits it in `summary.ready` — this route and
 * the fetch in use-call.ts get deleted then.
 */

const isTranscript = (v: unknown): v is SummaryInput["transcript"] =>
  Array.isArray(v) &&
  v.every(
    (t) =>
      t &&
      typeof t === "object" &&
      ((t as { role?: unknown }).role === "buyer" || (t as { role?: unknown }).role === "agent") &&
      typeof (t as { text?: unknown }).text === "string"
  );

const isEvents = (v: unknown): v is SummaryInput["events"] =>
  Array.isArray(v) &&
  v.every(
    (e) =>
      e &&
      typeof e === "object" &&
      typeof (e as { kind?: unknown }).kind === "string" &&
      typeof (e as { detail?: unknown }).detail === "string"
  );

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { lead, transcript, events } = (body ?? {}) as Record<string, unknown>;
  const parsedLead = LeadRecordSchema.safeParse(lead);
  if (!parsedLead.success || !isTranscript(transcript) || !isEvents(events)) {
    return Response.json({ error: "invalid summary input" }, { status: 400 });
  }

  // Headroom over the package's 5s default (sectioned gpt-5.x summaries run
  // ~5s with slow tails); stays under the client fetch's 20s abort.
  const agent = createSummaryAgent({ timeoutMs: 15_000 });
  const output = await agent({ lead: parsedLead.data, transcript, events });
  return Response.json(output);
}
