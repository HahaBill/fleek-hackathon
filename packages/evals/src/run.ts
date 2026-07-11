import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PERSONAS, type Persona } from "./personas/index";

// Repo-root .env (OPENAI_API_KEY etc.) — optional, only matters when the
// target pipeline runs in-process code that talks to a provider.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // no .env is fine
}
import { ScriptedPipeline, type PipelineTarget } from "./pipeline";
import { SCRIPTS, VIOLATING_SCRIPTS } from "./scripts";
import { WsPipeline } from "./wsPipeline";
import { runSuite } from "./runner";
import { renderConsole, renderMarkdown, totals } from "./report";

/**
 * CLI: pnpm evals [-- --persona <id>] [-- --violations]
 *   EVAL_TARGET=scripted (default) runs the standalone fake pipeline.
 *   EVAL_TARGET=ws EVAL_URL=http://localhost:3000 drives the real server.
 *   --violations swaps in the deliberately broken streams (scripted only) to
 *   prove the assertions catch a lying agent — expect red.
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const target = process.env.EVAL_TARGET ?? "scripted";
const violations = flag("violations");
const only = value("persona");

const personas = only ? PERSONAS.filter((p) => p.id === only) : PERSONAS;
if (personas.length === 0) {
  console.error(`unknown persona "${only}" — known: ${PERSONAS.map((p) => p.id).join(", ")}`);
  process.exit(2);
}

function makePipeline(persona: Persona): PipelineTarget {
  if (target === "ws") {
    return new WsPipeline(process.env.EVAL_URL ?? "http://localhost:3000");
  }
  const script = (violations && VIOLATING_SCRIPTS[persona.id]) || SCRIPTS[persona.id];
  if (!script) throw new Error(`no script for persona ${persona.id}`);
  return new ScriptedPipeline(script);
}

const runs = await runSuite(personas, makePipeline);

console.log(
  `\nSupplier voice agent — eval suite (target: ${target}${violations ? ", VIOLATIONS mode" : ""})\n`
);
console.log(renderConsole(runs));
writeFileSync(new URL("../report.md", import.meta.url), renderMarkdown(runs));
console.log("\nreport written to packages/evals/report.md");

process.exit(totals(runs).allGreen ? 0 : 1);
