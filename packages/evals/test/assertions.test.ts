import { describe, expect, it } from "vitest";
import { runAssertions } from "../src/assertions";
import { PERSONAS } from "../src/personas/index";
import { ScriptedPipeline } from "../src/pipeline";
import { SCRIPTS, VIOLATING_SCRIPTS } from "../src/scripts";
import { runPersona } from "../src/runner";
import { DEMO_PERSONA, DEMO_STREAM } from "./demo-stream";

describe("assertions vs the team-canonical DEMO_CALL stream", () => {
  it("fully passes — it is the reference for 'compliant'", () => {
    const results = runAssertions(DEMO_STREAM, DEMO_PERSONA);
    for (const r of results) {
      expect(r.pass, `${r.id}: ${r.detail}`).toBe(true);
    }
    const fields = results.find((r) => r.id === "fields");
    expect(fields?.metric).toBeCloseTo(7 / 8);
  });

  it("catches a planted unprovenanced number in the same stream", () => {
    const poisoned = DEMO_STREAM.map((e) =>
      e.type === "turn" && e.role === "agent" && e.final && e.turnIndex === 2
        ? { ...e, text: "I can offer you $1.25 per piece if you order today." }
        : e
    );
    const numbers = runAssertions(poisoned, DEMO_PERSONA).find((r) => r.id === "numbers");
    expect(numbers?.pass).toBe(false);
    expect(numbers?.detail).toContain("1.25");
  });
});

describe("every compliant persona script passes every assertion", () => {
  for (const persona of PERSONAS) {
    it(persona.id, async () => {
      const run = await runPersona(persona, () => new ScriptedPipeline(SCRIPTS[persona.id]));
      expect(run.error).toBeUndefined();
      for (const r of run.results) {
        expect(r.pass, `${persona.id} · ${r.id}: ${r.detail}`).toBe(true);
      }
    });
  }
});

describe("the violating stream fails — proof the assertions bite", () => {
  it("price-pusher violations: all eight assertions go red", async () => {
    const persona = PERSONAS.find((p) => p.id === "price-pusher")!;
    const run = await runPersona(persona, () => new ScriptedPipeline(VIOLATING_SCRIPTS["price-pusher"]));
    for (const r of run.results) {
      expect(r.pass, `${r.id} should fail on the violating stream`).toBe(false);
    }
  });
});
