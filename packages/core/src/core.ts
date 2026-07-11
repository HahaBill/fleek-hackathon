import type {
  FieldChipState,
  FieldName,
  KnowledgeResult,
  LeadRecord,
  QualificationCore,
  RuleId,
} from "@fleek/shared";
import { evaluateEscalations as runEscalationRules } from "./escalations";
import {
  createKnowledgeService,
  type SeedData,
} from "./knowledge";
import {
  assembleLead,
  missingFieldsFromMachine,
  validateUpsertArgs,
  type GuardrailEvent,
  type HandoffState,
} from "./leadBuilder";
import { createStateMachine } from "./stateMachine";

let leadCounter = 0;
let handoffCounter = 0;

function nextLeadId(): string {
  leadCounter += 1;
  return `lead_${leadCounter}`;
}

function nextHandoffId(): string {
  handoffCounter += 1;
  return `handoff_${handoffCounter}`;
}

export function createCore(seed: SeedData): QualificationCore {
  const knowledge = createKnowledgeService(seed);
  const sm = createStateMachine({
    categoryVocabulary: knowledge.categoryVocabulary(),
  });

  let leadId = nextLeadId();
  let handoff: HandoffState = null;
  const guardrailEvents: GuardrailEvent[] = [];
  let turnIndex = 0;
  const questions: string[] = [];

  function recordEscalationGuardrail(
    rule: RuleId,
    detail: string,
    turn: number,
  ): void {
    guardrailEvents.push({
      kind: "escalation",
      detail: `${rule}: ${detail}`,
      turnIndex: turn,
    });
  }

  const core: QualificationCore = {
    noteBuyerTurn(text: string): void {
      turnIndex += 1;
      sm.noteBuyerTurn(text);
    },

    noteAgentTurn(text: string): void {
      sm.noteAgentTurn(text);
    },

    searchKnowledge(query: string, filters?: Record<string, string>): KnowledgeResult {
      const result = knowledge.searchKnowledge(query, filters);
      if (result.kind === "not_found") {
        recordEscalationGuardrail(
          "item_not_in_knowledge",
          `No knowledge match for query: ${query}`,
          turnIndex,
        );
      }
      return result;
    },

    upsertLead(fields): { leadId: string; missingFields: FieldName[] } {
      const validated = validateUpsertArgs(fields);

      if (validated.categories?.[0]) {
        sm.capture("category", validated.categories[0]);
      }
      if (validated.brands?.[0]) {
        sm.capture("brand", validated.brands[0]);
      }
      if (validated.quantity !== undefined) {
        sm.capture("quantity", String(validated.quantity));
      }
      if (validated.budget !== undefined) {
        sm.capture("budget", String(validated.budget));
      }
      if (validated.grade !== undefined) {
        sm.capture("grade", validated.grade);
      }
      if (validated.destination !== undefined) {
        sm.capture("destination", validated.destination);
      }
      if (validated.timeframe !== undefined) {
        sm.capture("deadline", validated.timeframe);
      }
      if (validated.contact) {
        const { name, method } = validated.contact;
        if (name && method) {
          sm.capture("contact", `${name} — ${method}`);
        } else if (method) {
          sm.capture("contact", method);
        } else if (name) {
          sm.capture("contact", name);
        }
      }

      return {
        leadId,
        missingFields: missingFieldsFromMachine(sm),
      };
    },

    requestHandoff(reason: string, context: string): { handoffId: string } {
      const handoffId = nextHandoffId();
      handoff = { handoffId, reason, context };
      recordEscalationGuardrail("human_requested", reason, turnIndex);
      return { handoffId };
    },

    evaluateEscalations(buyerText: string): { rule: RuleId; reason: string }[] {
      const fired = runEscalationRules(buyerText);
      for (const f of fired) {
        recordEscalationGuardrail(f.rule, f.reason, turnIndex);
      }
      return fired;
    },

    chips(): FieldChipState[] {
      return sm.chips();
    },

    nextQuestion(): FieldName | null {
      return sm.nextQuestion();
    },

    markConfirmed(): void {
      sm.markConfirmed();
    },

    recordGuardrailEvent(detail: string, turnIdx: number): void {
      guardrailEvents.push({
        kind: "unprovenanced_number",
        detail,
        turnIndex: turnIdx,
      });
    },

    finalize(_endedBy: "end_call" | "hangup"): LeadRecord {
      return assembleLead({
        leadId,
        sm,
        handoff,
        guardrailEvents: [...guardrailEvents],
        questions: [...questions],
        terminal: true,
        conflicts: sm.getConflicts(),
      });
    },

    snapshot(): LeadRecord {
      return assembleLead({
        leadId,
        sm,
        handoff,
        guardrailEvents: [...guardrailEvents],
        questions: [...questions],
        terminal: false,
        conflicts: sm.getConflicts(),
      });
    },
  };

  return core;
}

export type { SeedData };
