import {
  FIELD_NAMES,
  LeadRecordSchema,
  type FieldName,
  type LeadRecord,
  type LeadStatus,
} from "@fleek/shared";
import type { ConflictEvent, StateMachine } from "./stateMachine";

export class LeadValidationError extends Error {
  readonly name = "LeadValidationError";
  readonly issues: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.issues = issues;
  }
}

export type GuardrailEvent = LeadRecord["guardrailEvents"][number];

export type HandoffState = {
  handoffId: string;
  reason: string;
  context: string;
} | null;

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function buildRequirements(
  sm: StateMachine,
): LeadRecord["requirements"] {
  const category = sm.getValue("category");
  const brand = sm.getValue("brand");
  const quantity = parseOptionalNumber(sm.getValue("quantity"));
  const budget = parseOptionalNumber(sm.getValue("budget"));
  const grade = sm.getValue("grade");
  const destination = sm.getValue("destination");
  const deadline = sm.getValue("deadline");

  return {
    categories: category ? [category] : [],
    brands: brand ? [brand] : [],
    ...(grade !== undefined ? { grade } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(destination !== undefined ? { destination } : {}),
    ...(deadline !== undefined ? { timeframe: deadline } : {}),
  };
}

export function buildContact(sm: StateMachine): LeadRecord["contact"] {
  const raw = sm.getValue("contact");
  if (!raw) return {};

  // Formats: "Maya <maya@x.com>", "maya@x.com", "+44...", "Maya"
  const emailInBrackets = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (emailInBrackets) {
    return { name: emailInBrackets[1].trim(), method: emailInBrackets[2].trim() };
  }
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(raw) || /\d{7,}/.test(raw)) {
    // method only, or "Name method" if we stored "Maya — maya@..."
    const dashSplit = raw.split(/\s+[—–-]\s+/);
    if (dashSplit.length === 2) {
      return { name: dashSplit[0].trim(), method: dashSplit[1].trim() };
    }
    const nameMethod = raw.match(/^([A-Za-z][A-Za-z\s'-]+)\s+([^\s@]+@[^\s@]+\.[^\s@]+)$/);
    if (nameMethod) {
      return { name: nameMethod[1].trim(), method: nameMethod[2].trim() };
    }
    return { method: raw };
  }
  return { name: raw };
}

export function computeStatus(opts: {
  handoff: HandoffState;
  canQualify: boolean;
  confirmed: boolean;
}): LeadStatus {
  if (opts.handoff) return "human_handoff_requested";
  if (opts.canQualify && opts.confirmed) return "qualified_follow_up";
  return "unresolved";
}

export function recommendedNextAction(opts: {
  contact: LeadRecord["contact"];
  handoff: HandoffState;
  deadline?: string;
  status: LeadStatus;
}): string {
  const name = opts.contact.name ?? opts.contact.method ?? "buyer";
  if (opts.handoff) {
    return `Call ${name} today — ${opts.handoff.reason}`;
  }
  if (opts.deadline) {
    return `Call ${name} today — deadline-driven`;
  }
  if (opts.status === "qualified_follow_up") {
    return `Call ${name} today — new qualified lead`;
  }
  return `Follow up with ${name}`;
}

export function missingFieldsFromMachine(sm: StateMachine): FieldName[] {
  // Surfaces fields still needed for a commercial follow-up path
  const missing: FieldName[] = [];
  for (const f of FIELD_NAMES) {
    if (sm.chips().find((c) => c.field === f)?.state === "pending") {
      // Only report commercially important gaps for upsert response
      if (
        f === "contact" ||
        f === "category" ||
        f === "quantity" ||
        f === "destination" ||
        f === "deadline"
      ) {
        missing.push(f);
      }
    }
  }
  // Refine: if canQualify, drop quantity/budget alternatives appropriately
  if (sm.canQualify()) {
    return missing.filter((f) => f !== "quantity" || !sm.getValue("budget"));
  }
  return missing;
}

export function assembleLead(opts: {
  leadId: string;
  sm: StateMachine;
  handoff: HandoffState;
  guardrailEvents: GuardrailEvent[];
  questions?: string[];
  unknownFields?: FieldName[];
  terminal: boolean;
  conflicts?: ConflictEvent[];
}): LeadRecord {
  const contact = buildContact(opts.sm);
  const requirements = buildRequirements(opts.sm);
  const status: LeadStatus = opts.terminal
    ? computeStatus({
        handoff: opts.handoff,
        canQualify: opts.sm.canQualify(),
        confirmed: opts.sm.isConfirmed(),
      })
    : "in_progress";

  const record: LeadRecord = {
    leadId: opts.leadId,
    contact,
    requirements,
    questions: opts.questions ?? [],
    unknownFields: opts.unknownFields ?? [],
    status,
    guardrailEvents: opts.guardrailEvents,
    ...(opts.handoff
      ? {
          escalation: {
            reason: opts.handoff.reason,
            context: opts.handoff.context,
          },
        }
      : {}),
    recommendedNextAction: recommendedNextAction({
      contact,
      handoff: opts.handoff,
      deadline: requirements.timeframe,
      status,
    }),
  };

  try {
    return LeadRecordSchema.parse(record);
  } catch (err) {
    throw new LeadValidationError("Assembled lead failed schema validation", err);
  }
}

/** Validate partial upsert args from the model; throw typed error on malformation. */
export function validateUpsertArgs(
  fields: Partial<LeadRecord["requirements"]> & {
    contact?: LeadRecord["contact"];
  },
): Partial<LeadRecord["requirements"]> & { contact?: LeadRecord["contact"] } {
  const UpsertSchema = LeadRecordSchema.shape.requirements.partial().extend({
    contact: LeadRecordSchema.shape.contact.optional(),
  });
  const result = UpsertSchema.safeParse(fields);
  if (!result.success) {
    throw new LeadValidationError("Malformed upsertLead arguments", result.error);
  }
  return result.data;
}
