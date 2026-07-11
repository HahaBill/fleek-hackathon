/**
 * Numeric-token extraction shared by the summary post-filter and the eval
 * harness's provenance assertions. Digits only — spelled-out numbers
 * ("fifty") are a documented v1 gap.
 *
 * Pinned behaviours (see test/numbers.test.ts):
 *   "90s denim"      -> [90]
 *   "$2.10–3.40/pc"  -> [2.1, 3.4]
 *   "1,000 kg"       -> [1000]
 *   "24/7"           -> [24, 7]
 *   "Grade A"        -> []
 */
export function extractNumericTokens(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number.parseFloat(m[0].replaceAll(",", ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Deep-walk arbitrary values (lead records, tool payloads, evidence strings)
 * and collect every numeric token, including digits embedded in strings —
 * so a lead with category "90s denim" whitelists 90.
 */
export function collectNumbers(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(value);
  } else if (typeof value === "string") {
    for (const n of extractNumericTokens(value)) into.add(n);
  } else if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, into);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
  return into;
}

/** Numbers present in `text` that are not in the allowlist. */
export function ungroundedNumbers(text: string, allowed: Set<number>): number[] {
  return extractNumericTokens(text).filter((n) => !allowed.has(n));
}
