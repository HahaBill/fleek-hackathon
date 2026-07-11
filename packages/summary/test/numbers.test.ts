import { describe, expect, it } from "vitest";
import { collectNumbers, extractNumericTokens, ungroundedNumbers } from "../src/numbers";

describe("extractNumericTokens (pinned cases)", () => {
  it("treats decade shorthand as its number", () => {
    expect(extractNumericTokens("90s denim")).toEqual([90]);
  });

  it("splits price ranges into both endpoints, normalized", () => {
    expect(extractNumericTokens("$2.10–3.40/pc")).toEqual([2.1, 3.4]);
  });

  it("strips thousands separators", () => {
    expect(extractNumericTokens("1,000 kg")).toEqual([1000]);
  });

  it("splits 24/7 into both tokens", () => {
    expect(extractNumericTokens("24/7")).toEqual([24, 7]);
  });

  it("finds nothing in letter grades", () => {
    expect(extractNumericTokens("Grade A")).toEqual([]);
  });
});

describe("collectNumbers", () => {
  it("deep-walks records including digits inside strings", () => {
    const allowed = collectNumbers({
      requirements: { categories: ["90s denim"], quantity: 200, budget: 1.8 },
      note: "MOQ 50, $2.10–3.40",
    });
    for (const n of [90, 200, 1.8, 50, 2.1, 3.4]) expect(allowed.has(n)).toBe(true);
  });
});

describe("ungroundedNumbers", () => {
  it("matches formatting variants through normalization", () => {
    const allowed = collectNumbers({ budget: 1.8, moq: 50 });
    expect(ungroundedNumbers("$1.80 at 50 pieces", allowed)).toEqual([]);
  });

  it("flags numbers with no source", () => {
    const allowed = collectNumbers({ quantity: 200 });
    expect(ungroundedNumbers("I can do $1.50 for 200", allowed)).toEqual([1.5]);
  });
});
