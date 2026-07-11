export { createCore } from "./core";
export type { SeedData } from "./knowledge";
export { LeadValidationError } from "./leadBuilder";
export { evaluateEscalations, ESCALATION_RULES } from "./escalations";

import type { SeedData } from "./knowledge";
import seedJson from "./seed/karachi-vintage-co.json";

export function loadSeed(): SeedData {
  return seedJson as SeedData;
}

export type {
  FieldChipState,
  FieldName,
  KnowledgeFact,
  KnowledgeResult,
  LeadRecord,
  QualificationCore,
  RuleId,
} from "@fleek/shared";
