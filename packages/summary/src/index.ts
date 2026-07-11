import { z } from "zod";
import type { SummaryAgent, SummaryInput, SummaryOutput } from "@fleek/shared";
import { computeSignals, type Signal, type SignalId } from "./insights";
import { composeFromTemplate } from "./template";
import { collectNumbers, extractNumericTokens, ungroundedNumbers } from "./numbers";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";

export { computeSignals, composeFromTemplate, collectNumbers, extractNumericTokens, ungroundedNumbers };
export type { Signal, SignalId };

/** Minimal LLM seam so tests inject fakes and providers stay swappable. */
export interface JsonCompleter {
  completeJSON(args: { system: string; user: string; signal: AbortSignal }): Promise<string>;
}

export interface SummaryAgentOptions {
  model?: string;
  /** Injected LLM (tests). Defaults to OpenAI when OPENAI_API_KEY is set. */
  client?: JsonCompleter;
  /** LLM budget before degrading to the template (the card must never hang). */
  timeoutMs?: number;
}

const OutputSchema = z.object({
  prose: z.string().min(1),
  insights: z.array(z.string()).default([]),
  nextActionPhrasing: z.string().optional(),
});

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

/**
 * Provenance allowlist for the composer's output: every numeric token in the
 * record, the signal evidence, and the event details. Anything else in the
 * model's prose/insights is an invention and gets rejected.
 */
function buildAllowlist(input: SummaryInput, signals: Signal[]): Set<number> {
  const allowed = collectNumbers(input.lead);
  for (const s of signals) collectNumbers(s.evidence, allowed);
  for (const e of input.events) collectNumbers(e.detail, allowed);
  return allowed;
}

/** null = prose ungrounded (hard fail -> template); insights are filtered soft. */
function groundOutput(
  raw: z.infer<typeof OutputSchema>,
  input: SummaryInput,
  allowed: Set<number>
): SummaryOutput | null {
  if (ungroundedNumbers(raw.prose, allowed).length > 0) return null;

  // Any email in the prose must be the buyer's actual contact method.
  const method = input.lead.contact.method ?? "";
  for (const email of raw.prose.match(EMAIL_RE) ?? []) {
    if (!method.includes(email)) return null;
  }

  const insights = raw.insights
    .filter((i) => ungroundedNumbers(i, allowed).length === 0)
    .slice(0, 4);
  return { prose: raw.prose, insights, nextActionPhrasing: raw.nextActionPhrasing };
}

function defaultClient(model: string): JsonCompleter | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return {
    async completeJSON({ system, user, signal }) {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI();
      const res = await openai.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: 500,
        },
        { signal }
      );
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

/**
 * The post-call Summary Agent (Plan 4 §0). Narrates the already-finalized
 * lead record; the deterministic core owns every field value. On any LLM
 * problem — no key, timeout, bad JSON, invented number — it degrades to the
 * deterministic template so the summary card always renders.
 */
export function createSummaryAgent(opts: SummaryAgentOptions = {}): SummaryAgent {
  const model = opts.model ?? process.env.SUMMARY_MODEL ?? "gpt-4o-mini";
  const timeoutMs = opts.timeoutMs ?? 5_000;

  return async (input: SummaryInput): Promise<SummaryOutput> => {
    const signals = computeSignals(input);
    const client = opts.client ?? defaultClient(model);
    if (!client) return composeFromTemplate(input, signals);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const text = await client.completeJSON({
        system: SYSTEM_PROMPT,
        user: buildUserMessage(input, signals),
        signal: controller.signal,
      });
      const parsed = OutputSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return composeFromTemplate(input, signals);
      const grounded = groundOutput(parsed.data, input, buildAllowlist(input, signals));
      return grounded ?? composeFromTemplate(input, signals);
    } catch {
      return composeFromTemplate(input, signals);
    } finally {
      clearTimeout(timer);
    }
  };
}
