import { describe, expect, it } from "vitest";
import type { JsonCompleter } from "../src/index";
import {
  collectNumbers,
  composeFromTemplate,
  computeSignals,
  createSummaryAgent,
  ungroundedNumbers,
} from "../src/index";
import {
  DEMO_INPUT,
  DEMO_INSIGHTS,
  DEMO_PROSE,
  QUALITY_DISPUTE_INPUT,
  UNRESOLVED_INPUT,
  WHALE_INPUT,
} from "../fixtures/leads";

const fake = (response: string): JsonCompleter => ({
  completeJSON: async () => response,
});

const sentenceCount = (prose: string) => prose.split(/(?<=[.!?])\s+/).filter(Boolean).length;

describe("template fallback composer", () => {
  it("PRD trace: names the buyer, the ask, and the escalation", () => {
    const out = composeFromTemplate(DEMO_INPUT, computeSignals(DEMO_INPUT));
    expect(out.prose).toContain("Maya");
    expect(out.prose).toContain("200");
    expect(out.prose).toContain("flagged");
    expect(sentenceCount(out.prose)).toBeGreaterThanOrEqual(2);
    expect(sentenceCount(out.prose)).toBeLessThanOrEqual(4);
    expect(out.insights.length).toBeLessThanOrEqual(4);
  });

  it("is null-safe on the empty unresolved lead", () => {
    const out = composeFromTemplate(UNRESOLVED_INPUT, computeSignals(UNRESOLVED_INPUT));
    expect(out.prose).toContain("before the enquiry could be qualified");
    expect(out.prose).toContain("contact, category, quantity");
  });

  it("handoff leads lead with the escalation reason", () => {
    for (const input of [QUALITY_DISPUTE_INPUT, WHALE_INPUT]) {
      const out = composeFromTemplate(input, computeSignals(input));
      expect(out.prose).toContain("flagged for you");
      expect(out.prose).toContain(input.lead.escalation!.reason);
    }
  });

  it("never emits a number absent from record + signals (grounded by construction)", () => {
    for (const input of [DEMO_INPUT, UNRESOLVED_INPUT, QUALITY_DISPUTE_INPUT, WHALE_INPUT]) {
      const signals = computeSignals(input);
      const allowed = collectNumbers(input.lead);
      for (const s of signals) collectNumbers(s.evidence, allowed);
      const out = composeFromTemplate(input, signals);
      expect(ungroundedNumbers(out.prose, allowed)).toEqual([]);
      for (const i of out.insights) expect(ungroundedNumbers(i, allowed)).toEqual([]);
    }
  });
});

describe("createSummaryAgent", () => {
  it("returns grounded LLM output when the model behaves", async () => {
    const agent = createSummaryAgent({
      client: fake(
        JSON.stringify({
          prose: "Maya wants 200 pieces of 90s denim in Grade A before August. She pushed for $1.80 at 400 pieces, so the ask was flagged for you.",
          insights: ["Asked about 400 pieces at $1.80 — upsell potential"],
          nextActionPhrasing: "Ring Maya today.",
        })
      ),
    });
    const out = await agent(DEMO_INPUT);
    expect(out.prose).toContain("Maya");
    expect(out.insights).toHaveLength(1);
    expect(out.nextActionPhrasing).toBe("Ring Maya today.");
  });

  it("red team: drops an insight containing a fabricated price", async () => {
    const agent = createSummaryAgent({
      client: fake(
        JSON.stringify({
          prose: "Maya wants 200 pieces of 90s denim in Grade A before August.",
          insights: [
            "Offer her $1.50 to close quickly",
            "Hard deadline before August, so timing matters",
          ],
        })
      ),
    });
    const out = await agent(DEMO_INPUT);
    expect(out.insights).toEqual(["Hard deadline before August, so timing matters"]);
  });

  it("red team: a fabricated price in the prose forces the template fallback", async () => {
    const agent = createSummaryAgent({
      client: fake(
        JSON.stringify({
          prose: "Maya will take 500 pieces if offered $1.50 each.",
          insights: [],
        })
      ),
    });
    const out = await agent(DEMO_INPUT);
    expect(out.prose).not.toContain("1.50");
    expect(out.prose).toContain("Maya"); // template path
  });

  it("red team: a foreign email in the prose forces the template fallback", async () => {
    const agent = createSummaryAgent({
      client: fake(
        JSON.stringify({ prose: "Reach the buyer at hacker@evil.example to close.", insights: [] })
      ),
    });
    const out = await agent(DEMO_INPUT);
    expect(out.prose).not.toContain("hacker@evil.example");
  });

  it("malformed JSON degrades to the template", async () => {
    const agent = createSummaryAgent({ client: fake("prose: not json at all") });
    const out = await agent(DEMO_INPUT);
    expect(out.prose).toContain("Maya");
  });

  it("a hung model degrades to the template within the timeout", async () => {
    const never: JsonCompleter = {
      completeJSON: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    };
    const agent = createSummaryAgent({ client: never, timeoutMs: 50 });
    const out = await agent(DEMO_INPUT);
    expect(out.prose).toContain("Maya");
  });

  it("caps insights at 4 even when the model returns more", async () => {
    const agent = createSummaryAgent({
      client: fake(
        JSON.stringify({
          prose: "Maya wants 200 pieces of 90s denim.",
          insights: ["a", "b", "c", "d", "e", "f"],
        })
      ),
    });
    const out = await agent(DEMO_INPUT);
    expect(out.insights).toHaveLength(4);
  });
});

describe("reference output (web's DEMO_PROSE/DEMO_INSIGHTS) passes our own post-filter", () => {
  it("every number in the frontend's reference prose is grounded", () => {
    const signals = computeSignals(DEMO_INPUT);
    const allowed = collectNumbers(DEMO_INPUT.lead);
    for (const s of signals) collectNumbers(s.evidence, allowed);
    for (const e of DEMO_INPUT.events) collectNumbers(e.detail, allowed);
    expect(ungroundedNumbers(DEMO_PROSE, allowed)).toEqual([]);
    for (const i of DEMO_INSIGHTS) expect(ungroundedNumbers(i, allowed)).toEqual([]);
  });
});

describe.skipIf(!process.env.OPENAI_API_KEY || !process.env.LIVE)("live smoke test", () => {
  it("composes real prose for the PRD trace (eyeball the output)", async () => {
    const agent = createSummaryAgent();
    const out = await agent(DEMO_INPUT);
    // eslint-disable-next-line no-console
    console.log("\nLIVE SUMMARY:\n", JSON.stringify(out, null, 2));
    expect(out.prose.length).toBeGreaterThan(40);
  }, 20_000);
});
