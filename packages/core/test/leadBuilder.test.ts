import { describe, expect, it } from "vitest";
import {
  LeadValidationError,
  assembleLead,
  computeStatus,
  recommendedNextAction,
  validateUpsertArgs,
} from "../src/leadBuilder.js";
import { createStateMachine } from "../src/stateMachine.js";

function qualifiedSm(confirmed = false) {
  const sm = createStateMachine();
  sm.capture("contact", "Maya — maya@shopmail.com");
  sm.capture("category", "denim");
  sm.capture("quantity", "200");
  if (confirmed) sm.markConfirmed();
  return sm;
}

describe("leadBuilder status matrix", () => {
  it.each([
    {
      name: "handoff + qualify + confirmed → human_handoff_requested",
      handoff: true,
      canQualify: true,
      confirmed: true,
      expected: "human_handoff_requested",
    },
    {
      name: "handoff alone → human_handoff_requested",
      handoff: true,
      canQualify: false,
      confirmed: false,
      expected: "human_handoff_requested",
    },
    {
      name: "qualify + confirmed → qualified_follow_up",
      handoff: false,
      canQualify: true,
      confirmed: true,
      expected: "qualified_follow_up",
    },
    {
      name: "qualify without confirm → unresolved",
      handoff: false,
      canQualify: true,
      confirmed: false,
      expected: "unresolved",
    },
    {
      name: "neither → unresolved",
      handoff: false,
      canQualify: false,
      confirmed: false,
      expected: "unresolved",
    },
  ] as const)("$name", ({ handoff, canQualify, confirmed, expected }) => {
    expect(
      computeStatus({
        handoff: handoff
          ? { handoffId: "h1", reason: "test", context: "ctx" }
          : null,
        canQualify,
        confirmed,
      }),
    ).toBe(expected);
  });
});

describe("recommendedNextAction", () => {
  it("uses escalation reason when handoff present", () => {
    expect(
      recommendedNextAction({
        contact: { name: "Maya" },
        handoff: {
          handoffId: "h1",
          reason: "volume discount request",
          context: "400pc",
        },
        status: "human_handoff_requested",
      }),
    ).toBe("Call Maya today — volume discount request");
  });

  it("uses deadline-driven when deadline set", () => {
    expect(
      recommendedNextAction({
        contact: { name: "Maya" },
        handoff: null,
        deadline: "before August",
        status: "qualified_follow_up",
      }),
    ).toBe("Call Maya today — deadline-driven");
  });

  it("uses new qualified lead template", () => {
    expect(
      recommendedNextAction({
        contact: { name: "Maya" },
        handoff: null,
        status: "qualified_follow_up",
      }),
    ).toBe("Call Maya today — new qualified lead");
  });
});

describe("validateUpsertArgs", () => {
  it("accepts well-formed args", () => {
    const v = validateUpsertArgs({
      categories: ["denim"],
      quantity: 200,
      contact: { name: "Maya", method: "maya@shopmail.com" },
    });
    expect(v.quantity).toBe(200);
  });

  it("rejects malformed args with typed error", () => {
    expect(() =>
      validateUpsertArgs({ quantity: "two hundred" as unknown as number }),
    ).toThrow(LeadValidationError);
  });
});

describe("assembleLead", () => {
  it("maps state machine fields onto LeadRecord requirements", () => {
    const sm = qualifiedSm(true);
    sm.capture("grade", "A");
    sm.capture("destination", "London");
    sm.capture("deadline", "before August");
    const lead = assembleLead({
      leadId: "lead_1",
      sm,
      handoff: null,
      guardrailEvents: [],
      terminal: true,
    });
    expect(lead.status).toBe("qualified_follow_up");
    expect(lead.requirements.categories).toEqual(["denim"]);
    expect(lead.requirements.quantity).toBe(200);
    expect(lead.requirements.grade).toBe("A");
    expect(lead.contact.name).toBe("Maya");
    expect(lead.contact.method).toBe("maya@shopmail.com");
  });

  it("handoff on finalize yields human_handoff_requested", () => {
    const sm = qualifiedSm(true);
    const lead = assembleLead({
      leadId: "lead_1",
      sm,
      handoff: {
        handoffId: "h1",
        reason: "volume discount request",
        context: "400pc @ $1.80",
      },
      guardrailEvents: [],
      terminal: true,
    });
    expect(lead.status).toBe("human_handoff_requested");
    expect(lead.escalation?.reason).toBe("volume discount request");
  });

  it("snapshot stays in_progress", () => {
    const sm = qualifiedSm(true);
    const snap = assembleLead({
      leadId: "lead_1",
      sm,
      handoff: null,
      guardrailEvents: [],
      terminal: false,
    });
    expect(snap.status).toBe("in_progress");
  });
});
