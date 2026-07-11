import { ASSERTION_IDS } from "./assertions";
import type { PersonaRun } from "./runner";

/**
 * The persona × assertion grid — the on-stage artifact ("ten hostile buyers,
 * eight assertions each"). Console render + markdown twin (report.md).
 */

const LABELS: Record<(typeof ASSERTION_IDS)[number], string> = {
  disclosure: "disclose",
  numbers: "numbers",
  escalations: "escalate",
  fields: "fields",
  confirm: "confirm",
  summary: "summary",
  grounded: "grounded",
  status: "status",
};

function cell(run: PersonaRun, id: string): string {
  const r = run.results.find((x) => x.id === id);
  if (!r) return "?";
  if (r.skipped) return "–";
  if (id === "fields" && r.metric !== undefined) {
    return `${r.pass ? "✓" : "✗"} ${Math.round(r.metric * 100)}%`;
  }
  return r.pass ? "✓" : "✗";
}

export function totals(runs: PersonaRun[]) {
  const applicable = runs.flatMap((r) => r.results.filter((x) => !x.skipped));
  const passed = applicable.filter((x) => x.pass);
  const personasPassed = runs.filter((r) => r.results.every((x) => x.pass)).length;
  return {
    personas: runs.length,
    personasPassed,
    assertions: applicable.length,
    assertionsPassed: passed.length,
    allGreen: personasPassed === runs.length,
  };
}

export function renderConsole(runs: PersonaRun[]): string {
  const idWidth = Math.max(...runs.map((r) => r.persona.id.length), 7) + 2;
  const cols = ASSERTION_IDS.map((id) => LABELS[id]);
  const colWidth = 9;

  const lines: string[] = [];
  lines.push("persona".padEnd(idWidth) + cols.map((c) => c.padEnd(colWidth)).join("") + "time");
  lines.push("─".repeat(idWidth + cols.length * colWidth + 6));
  for (const run of runs) {
    lines.push(
      run.persona.id.padEnd(idWidth) +
        ASSERTION_IDS.map((id) => cell(run, id).padEnd(colWidth)).join("") +
        `${run.ms}ms`
    );
  }

  const failures = runs.flatMap((run) =>
    run.results.filter((r) => !r.pass).map((r) => `  ✗ ${run.persona.id} · ${r.id}: ${r.detail}`)
  );
  if (failures.length > 0) {
    lines.push("", "failures:", ...failures);
  }

  const t = totals(runs);
  lines.push(
    "",
    `${t.personasPassed}/${t.personas} personas passed · ${t.assertionsPassed}/${t.assertions} assertions green`
  );
  return lines.join("\n");
}

export function renderMarkdown(runs: PersonaRun[]): string {
  const header = `| persona | ${ASSERTION_IDS.map((id) => LABELS[id]).join(" | ")} | time |`;
  const sep = `|---|${ASSERTION_IDS.map(() => "---").join("|")}|---|`;
  const rows = runs.map(
    (run) =>
      `| ${run.persona.id} | ${ASSERTION_IDS.map((id) => cell(run, id)).join(" | ")} | ${run.ms}ms |`
  );
  const t = totals(runs);
  const failures = runs.flatMap((run) =>
    run.results.filter((r) => !r.pass).map((r) => `- ✗ **${run.persona.id}** · ${r.id}: ${r.detail}`)
  );
  return [
    "# Eval report — supplier voice agent",
    "",
    `**${t.personasPassed}/${t.personas} personas passed · ${t.assertionsPassed}/${t.assertions} assertions green**`,
    "",
    header,
    sep,
    ...rows,
    ...(failures.length > 0 ? ["", "## Failures", ...failures] : []),
    "",
    `_Generated ${new Date().toISOString()}_`,
  ].join("\n");
}
