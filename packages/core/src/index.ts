export { createCore } from "./core.js";
export type { SeedData } from "./knowledge.js";
export { LeadValidationError } from "./leadBuilder.js";
export { evaluateEscalations, ESCALATION_RULES } from "./escalations.js";

import type { SeedData } from "./knowledge.js";
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
