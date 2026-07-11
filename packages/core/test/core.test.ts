import { describe, expect, it } from "vitest";
import { createCore, loadSeed } from "../src/index.js";

describe("QualificationCore — PRD §3.4 worked trace", () => {
  it("replays the demo call and ends human_handoff_requested", () => {
    const core = createCore(loadSeed());

    core.noteBuyerTurn(
      "Hi, do you have 90s denim? I run a vintage shop in London.",
    );
    const knowledge = core.searchKnowledge("90s denim");
    expect(knowledge.kind).toBe("facts");
    if (knowledge.kind === "facts") {
      expect(knowledge.facts.some((f) => f.category === "denim")).toBe(true);
    }

    core.upsertLead({ categories: ["denim"] });
    core.noteBuyerTurn("Maybe 200 pieces, Grade A, need them before August.");
    core.upsertLead({
      quantity: 200,
      grade: "A",
      timeframe: "before August",
    });
    core.noteBuyerTurn(
      "Yes London. I'm Maya — maya@shopmail.com. Can you do $1.80 if I take 400?",
    );
    core.upsertLead({
      destination: "London",
      contact: { name: "Maya", method: "maya@shopmail.com" },
    });

    const fired = core.evaluateEscalations(
      "Can you do $1.80 if I take 400?",
    );
    expect(fired.some((f) => f.rule === "binding_price_request")).toBe(true);

    core.requestHandoff("volume discount request", "400pc @ $1.80");
    core.markConfirmed();

    const lead = core.finalize("end_call");

    expect(lead.status).toBe("human_handoff_requested");
    expect(lead.escalation?.reason).toBe("volume discount request");
    expect(lead.requirements.categories).toContain("denim");
    expect(lead.requirements.quantity).toBe(200);
    expect(lead.requirements.grade).toBe("A");
    expect(lead.requirements.destination).toBe("London");
    expect(lead.requirements.timeframe?.toLowerCase()).toContain("august");
    expect(lead.contact.name).toBe("Maya");
    expect(lead.contact.method).toBe("maya@shopmail.com");

    const chips = core.chips();
    for (const field of [
      "contact",
      "category",
      "quantity",
      "grade",
      "destination",
      "deadline",
    ] as const) {
      const chip = chips.find((c) => c.field === field);
      expect(chip?.state).toBe("captured");
    }
  });

  it("fires item_not_in_knowledge via searchKnowledge not_found", () => {
    const core = createCore(loadSeed());
    const result = core.searchKnowledge("bridal wear");
    expect(result.kind).toBe("not_found");
    const snap = core.snapshot();
    expect(
      snap.guardrailEvents.some((e) =>
        e.detail.includes("item_not_in_knowledge"),
      ),
    ).toBe(true);
  });

  it("exposes nextQuestion and markConfirmed", () => {
    const core = createCore(loadSeed());
    expect(core.nextQuestion()).toBe("contact");
    core.upsertLead({ contact: { method: "a@b.co" } });
    expect(core.nextQuestion()).toBe("category");
    core.recordGuardrailEvent("unprovenanced $9.99", 1);
    const snap = core.snapshot();
    expect(snap.guardrailEvents.some((e) => e.kind === "unprovenanced_number")).toBe(
      true,
    );
  });
});
