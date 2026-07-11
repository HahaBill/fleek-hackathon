import { ASSERTION_IDS, runAssertions, type AssertionResult } from "./assertions";
import type { PipelineTarget } from "./pipeline";
import type { Persona } from "./personas/index";

export interface PersonaRun {
  persona: Persona;
  results: AssertionResult[];
  ms: number;
  error?: string;
}

export interface RunnerOptions {
  /** Per-turn (and per-end) budget; generous for a live LLM pipeline. */
  turnTimeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function runPersona(
  persona: Persona,
  makePipeline: (persona: Persona) => PipelineTarget,
  opts: RunnerOptions = {}
): Promise<PersonaRun> {
  const timeout = opts.turnTimeoutMs ?? 30_000;
  const started = Date.now();
  const pipeline = makePipeline(persona);
  try {
    await withTimeout(pipeline.start(), timeout, `${persona.id} start`);
    for (const turn of persona.turns) {
      await withTimeout(pipeline.sendTurn(turn), timeout, `${persona.id} turn "${turn.slice(0, 40)}"`);
    }
    await withTimeout(pipeline.end(), timeout, `${persona.id} end`);
    return {
      persona,
      results: runAssertions(pipeline.events(), persona),
      ms: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      persona,
      results: ASSERTION_IDS.map((id) => ({ id, pass: false, detail: `run error: ${message}` })),
      ms: Date.now() - started,
      error: message,
    };
  }
}

/** Personas are independent sessions — run them in parallel. */
export async function runSuite(
  personas: Persona[],
  makePipeline: (persona: Persona) => PipelineTarget,
  opts: RunnerOptions = {}
): Promise<PersonaRun[]> {
  return Promise.all(personas.map((p) => runPersona(p, makePipeline, opts)));
}
