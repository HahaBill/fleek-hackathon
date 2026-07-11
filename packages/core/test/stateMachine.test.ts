import { describe, expect, it } from "vitest";
import { FIELD_NAMES } from "@fleek/shared";
import { createStateMachine } from "../src/stateMachine.js";
import { loadSeed } from "../src/index.js";
import { createKnowledgeService } from "../src/knowledge.js";

function makeSm() {
  const vocab = createKnowledgeService(loadSeed()).categoryVocabulary();
  return createStateMachine({ categoryVocabulary: vocab });
}

describe("stateMachine", () => {
  it("chips follow FIELD_NAMES order", () => {
    const sm = makeSm();
    expect(sm.chips().map((c) => c.field)).toEqual([...FIELD_NAMES]);
  });

  it("nextQuestion priority: contact > category > quantity > …", () => {
    const sm = makeSm();
    expect(sm.nextQuestion()).toBe("contact");
    sm.capture("contact", "maya@shopmail.com");
    expect(sm.nextQuestion()).toBe("category");
    sm.capture("category", "denim");
    expect(sm.nextQuestion()).toBe("quantity");
    sm.capture("quantity", "200");
    expect(sm.nextQuestion()).toBe("destination");
    sm.capture("destination", "London");
    expect(sm.nextQuestion()).toBe("deadline");
    sm.capture("deadline", "before August");
    expect(sm.nextQuestion()).toBe("grade");
    sm.capture("grade", "A");
    expect(sm.nextQuestion()).toBe("budget");
    sm.capture("budget", "1000");
    expect(sm.nextQuestion()).toBe("brand");
    sm.capture("brand", "Levi's");
    expect(sm.nextQuestion()).toBeNull();
  });

  it("canQualify requires contact + (category+quantity OR category+budget)", () => {
    const sm = makeSm();
    expect(sm.canQualify()).toBe(false);
    sm.capture("contact", "maya@shopmail.com");
    expect(sm.canQualify()).toBe(false);
    sm.capture("category", "denim");
    expect(sm.canQualify()).toBe(false);
    sm.capture("quantity", "200");
    expect(sm.canQualify()).toBe(true);

    const sm2 = makeSm();
    sm2.capture("contact", "a@b.co");
    sm2.capture("category", "denim");
    sm2.capture("budget", "500");
    expect(sm2.canQualify()).toBe(true);
  });

  it("confirmed only via markConfirmed", () => {
    const sm = makeSm();
    expect(sm.isConfirmed()).toBe(false);
    sm.markConfirmed();
    expect(sm.isConfirmed()).toBe(true);
  });

  it("conflicting capture: later wins and logs event", () => {
    const sm = makeSm();
    sm.capture("quantity", "200");
    sm.capture("quantity", "400");
    expect(sm.getValue("quantity")).toBe("400");
    expect(sm.getConflicts()).toEqual([
      { field: "quantity", previous: "200", next: "400" },
    ]);
  });

  it("partial details leave canQualify false → unresolved path input", () => {
    const sm = makeSm();
    sm.capture("category", "denim");
    sm.capture("quantity", "200");
    // missing contact
    expect(sm.canQualify()).toBe(false);
  });

  describe("noteBuyerTurn extraction", () => {
    it("extracts quantity from pieces/pcs/units", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("Maybe 200 pieces, Grade A");
      expect(sm.getValue("quantity")).toBe("200");
      expect(sm.getValue("grade")).toBe("A");
    });

    it("extracts email as contact", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("Reach me at maya@shopmail.com");
      expect(sm.getValue("contact")).toBe("maya@shopmail.com");
    });

    it("extracts phone as contact", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("Call +44 7700 900123 please");
      expect(sm.getValue("contact")).toMatch(/\+44/);
    });

    it("extracts deadline before month", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("need them before August");
      expect(sm.getValue("deadline")?.toLowerCase()).toContain("before august");
    });

    it("extracts grade", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("looking for grade B stock");
      expect(sm.getValue("grade")).toBe("B");
    });

    it("extracts destination from known list", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("I run a vintage shop in London.");
      expect(sm.getValue("destination")).toBe("London");
    });

    it("extracts category from seed vocabulary", () => {
      const sm = makeSm();
      sm.noteBuyerTurn("Hi, do you have 90s denim?");
      expect(sm.getValue("category")).toBeTruthy();
    });

    it("does not overwrite quantity on discount ask with larger take qty", () => {
      const sm = makeSm();
      sm.capture("quantity", "200");
      sm.noteBuyerTurn("Can you do $1.80 if I take 400?");
      expect(sm.getValue("quantity")).toBe("200");
    });
  });
});
