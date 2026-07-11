import { describe, expect, it } from "vitest";

import { createSession, handleToolCall, noteBuyerTurn } from "../src/session/store.js";

describe("session tool routing", () => {
  it("captures category and quantity from buyer turn chips", () => {
    const session = createSession("voice");
    noteBuyerTurn(session, "I need 200 pieces of Grade A 90s denim for London");

    const { result, events } = handleToolCall(session, "create_or_update_lead", {
      categories: ["90s denim"],
      quantity: 200,
      grade: "Grade A",
      destination: "London",
    });

    expect(result).toMatchObject({ missingFields: expect.any(Array) });
    const chipEvents = events.filter((e) => e.type === "chips");
    expect(chipEvents.length).toBeGreaterThan(0);
    const chips = chipEvents.at(-1);
    if (chips?.type === "chips") {
      const captured = chips.chips.filter((c) => c.state === "captured").map((c) => c.field);
      expect(captured).toContain("category");
      expect(captured).toContain("quantity");
    }
  });

  it("escalates discount asks via request_human_follow_up", () => {
    const session = createSession("voice");
    noteBuyerTurn(session, "can you do $1.80 if I take 400?");

    const { events } = handleToolCall(session, "request_human_follow_up", {
      reason: "volume discount request",
      context: "400pc @ $1.80",
    });

    expect(events.some((e) => e.type === "guardrail" && e.kind === "escalation")).toBe(true);
  });

  it("returns knowledge facts for shipping query", () => {
    const session = createSession("voice");
    const { result } = handleToolCall(session, "search_supplier_knowledge", {
      query: "shipping lead times",
    });
    expect(result).toMatchObject({ kind: "facts" });
  });
});
