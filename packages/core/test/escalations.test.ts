import { describe, expect, it } from "vitest";
import { RULE_IDS } from "@fleek/shared";
import { ESCALATION_RULES, evaluateEscalations } from "../src/escalations.js";

describe("evaluateEscalations", () => {
  it("does not include item_not_in_knowledge in text rules", () => {
    expect(ESCALATION_RULES.map((r) => r.id)).not.toContain(
      "item_not_in_knowledge",
    );
    expect(RULE_IDS).toContain("item_not_in_knowledge");
  });

  describe("binding_price_request", () => {
    it.each([
      "can you do $1.80",
      "any discount on bulk?",
      "best price if I take 400",
      "give me a better rate",
      "could you do 1.80 per piece if I commit to 400?",
      "my last supplier gave me a volume deal",
    ])("fires on %#: %s", (text) => {
      const fired = evaluateEscalations(text);
      expect(fired.some((f) => f.rule === "binding_price_request")).toBe(true);
    });

    it("does not fire on plain price question", () => {
      const fired = evaluateEscalations("what's the price?");
      expect(fired.some((f) => f.rule === "binding_price_request")).toBe(false);
    });
  });

  describe("exclusive_or_payment_exception", () => {
    it.each([
      "I want exclusive allocation of this lot",
      "can I pay net-30?",
      "hold all stock for me",
      "can I pay on delivery",
    ])("fires on %#: %s", (text) => {
      const fired = evaluateEscalations(text);
      expect(
        fired.some((f) => f.rule === "exclusive_or_payment_exception"),
      ).toBe(true);
    });

    it("does not fire on generic payment policy question", () => {
      const fired = evaluateEscalations("what's your payment policy?");
      expect(
        fired.some((f) => f.rule === "exclusive_or_payment_exception"),
      ).toBe(false);
    });
  });

  describe("complaint_or_legal", () => {
    it.each([
      "this is defective merchandise",
      "this is a scam",
      "I'll sue you",
      "my lawyer will call",
      "refund or I report you",
    ])("fires on %#: %s", (text) => {
      const fired = evaluateEscalations(text);
      expect(fired.some((f) => f.rule === "complaint_or_legal")).toBe(true);
    });

    it("does not fire on return policy question", () => {
      const fired = evaluateEscalations("what's your return policy?");
      expect(fired.some((f) => f.rule === "complaint_or_legal")).toBe(false);
    });
  });

  describe("human_requested", () => {
    it.each([
      "speak to a person please",
      "I want to talk to a human",
      "put me through to Imran",
      "speak to the owner",
      "transfer me to a manager",
    ])("fires on %#: %s", (text) => {
      const fired = evaluateEscalations(text);
      expect(fired.some((f) => f.rule === "human_requested")).toBe(true);
    });

    it("does not fire on AI disclosure question", () => {
      const fired = evaluateEscalations("are you a real person?");
      expect(fired.some((f) => f.rule === "human_requested")).toBe(false);
    });
  });
});
