import { describe, expect, it } from "vitest";
import { computeSignals } from "../src/insights";
import {
  DEMO_INPUT,
  QUALITY_DISPUTE_INPUT,
  RESTOCK_INPUT,
  UNRESOLVED_INPUT,
  WHALE_INPUT,
} from "../fixtures/leads";

const ids = (input: Parameters<typeof computeSignals>[0]) =>
  computeSignals(input).map((s) => s.id);

describe("computeSignals", () => {
  it("PRD worked trace: escalation, upsell, MOQ headroom, deadline", () => {
    const got = ids(DEMO_INPUT);
    expect(got).toContain("escalation_fired");
    expect(got).toContain("upsell_volume");
    expect(got).toContain("quantity_vs_moq");
    expect(got).toContain("deadline");
    const upsell = computeSignals(DEMO_INPUT).find((s) => s.id === "upsell_volume")!;
    expect(upsell.evidence).toContain("400");
    expect(upsell.evidence).toContain("200");
  });

  it("unresolved lead: only missing fields, and it never throws on nulls", () => {
    expect(ids(UNRESOLVED_INPUT)).toEqual(["missing_fields"]);
  });

  it("quality dispute (chat #5): complaint escalation surfaces", () => {
    const signals = computeSignals(QUALITY_DISPUTE_INPUT);
    const esc = signals.find((s) => s.id === "escalation_fired");
    expect(esc?.evidence).toContain("Complaint");
  });

  it("whale lead (chat #10): exclusivity escalation surfaces", () => {
    const esc = computeSignals(WHALE_INPUT).find((s) => s.id === "escalation_fired");
    expect(esc?.evidence).toContain("Exclusive allocation");
  });

  it("repeat buyer (chat #1): restock language fires repeat_contact", () => {
    expect(ids(RESTOCK_INPUT)).toContain("repeat_contact");
  });

  it("language switch detected from Devanagari/Urdu script", () => {
    const input = {
      ...UNRESOLVED_INPUT,
      transcript: [{ role: "buyer" as const, text: "मुझे 100 टी-शर्ट चाहिए" }],
    };
    expect(ids(input)).toContain("language_switch");
  });
});
