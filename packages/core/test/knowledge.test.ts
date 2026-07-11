import { describe, expect, it } from "vitest";
import { createKnowledgeService } from "../src/knowledge.js";
import { loadSeed } from "../src/index.js";

const seed = loadSeed();
const knowledge = createKnowledgeService(seed);

describe("searchKnowledge", () => {
  it("hits 90s denim with MOQ and price range", () => {
    const result = knowledge.searchKnowledge("90s denim");
    expect(result.kind).toBe("facts");
    if (result.kind !== "facts") return;
    expect(result.facts.some((f) => f.category === "denim")).toBe(true);
    const denim = result.facts.find((f) => f.category === "denim")!;
    expect(denim.moq).toBe(50);
    expect(denim.unitPriceRange).toEqual([2.1, 3.4]);
    expect(denim.styleTags).toContain("90s");
  });

  it("returns not_found for bridal wear", () => {
    const result = knowledge.searchKnowledge("bridal wear");
    expect(result).toEqual({ kind: "not_found" });
  });

  it("narrows by category filter", () => {
    const result = knowledge.searchKnowledge("vintage", {
      category: "denim",
    });
    expect(result.kind).toBe("facts");
    if (result.kind !== "facts") return;
    expect(result.facts.every((f) => f.category === "denim")).toBe(true);
  });

  it("narrows by grade filter", () => {
    const result = knowledge.searchKnowledge("knitwear", { grade: "A" });
    expect(result.kind).toBe("facts");
    if (result.kind !== "facts") return;
    expect(result.facts.every((f) => (f.grade ?? "").includes("A"))).toBe(true);
  });

  it("looks up shipping policy", () => {
    const result = knowledge.searchKnowledge("shipping");
    expect(result.kind).toBe("facts");
    if (result.kind !== "facts") return;
    expect(result.facts.every((f) => f.category === "policy")).toBe(true);
    expect(
      result.facts.some((f) =>
        f.availability.toLowerCase().includes("uk"),
      ),
    ).toBe(true);
  });

  it("looks up payment / deposit policy", () => {
    const result = knowledge.searchKnowledge("payment");
    expect(result.kind).toBe("facts");
    if (result.kind !== "facts") return;
    expect(
      result.facts.some((f) =>
        f.availability.toLowerCase().includes("deposit"),
      ),
    ).toBe(true);
  });

  it("never invents facts on empty miss", () => {
    expect(knowledge.searchKnowledge("spacesuits")).toEqual({
      kind: "not_found",
    });
  });
});
