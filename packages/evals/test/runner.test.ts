import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@fleek/shared";
import { PERSONAS } from "../src/personas/index";
import { ScriptedPipeline, type PipelineTarget } from "../src/pipeline";
import { SCRIPTS } from "../src/scripts";
import { runPersona, runSuite } from "../src/runner";
import { renderConsole, renderMarkdown, totals } from "../src/report";

describe("runSuite over the scripted pipeline", () => {
  it("the full persona suite is green and reportable", async () => {
    const runs = await runSuite(PERSONAS, (p) => new ScriptedPipeline(SCRIPTS[p.id]));
    const t = totals(runs);
    expect(t.allGreen).toBe(true);
    expect(t.personas).toBe(PERSONAS.length);

    const console_ = renderConsole(runs);
    expect(console_).toContain("persona");
    expect(console_).toContain(`${PERSONAS.length}/${PERSONAS.length} personas passed`);
    const md = renderMarkdown(runs);
    expect(md).toContain("| persona |");
    expect(md).not.toContain("## Failures");
  });
});

describe("runner failure paths", () => {
  const hanging: PipelineTarget = {
    start: async () => {},
    sendTurn: () => new Promise<void>(() => {}),
    end: async () => {},
    events: (): AgentEvent[] => [],
  };

  it("a hung pipeline times out and records an error run with all-red results", async () => {
    const run = await runPersona(PERSONAS[0], () => hanging, { turnTimeoutMs: 50 });
    expect(run.error).toContain("timed out");
    expect(run.results).toHaveLength(8);
    expect(run.results.every((r) => !r.pass)).toBe(true);
  });

  it("a throwing pipeline is captured, not crashed", async () => {
    const throwing: PipelineTarget = {
      ...hanging,
      start: async () => { throw new Error("connection refused"); },
    };
    const run = await runPersona(PERSONAS[0], () => throwing, { turnTimeoutMs: 50 });
    expect(run.error).toContain("connection refused");
  });
});
