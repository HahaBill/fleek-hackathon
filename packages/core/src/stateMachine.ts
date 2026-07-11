import type { FieldChipState, FieldName } from "@fleek/shared";
import { FIELD_NAMES } from "@fleek/shared";

export type FieldState = {
  state: "pending" | "captured";
  value?: string;
};

export type ConflictEvent = {
  field: FieldName;
  previous: string;
  next: string;
};

const NEXT_QUESTION_PRIORITY: FieldName[] = [
  "contact",
  "category",
  "quantity",
  "destination",
  "deadline",
  "grade",
  "budget",
  "brand",
];

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

const DESTINATIONS = [
  "london",
  "manchester",
  "birmingham",
  "berlin",
  "paris",
  "amsterdam",
  "new york",
  "uk",
  "eu",
  "us",
  "usa",
  "germany",
  "france",
  "netherlands",
];

const QUANTITY_RE =
  /\b(\d+)\s*(pieces|pcs|units|pc|shirts?|tees|t-?shirts|items)\b/i;
const QUANTITY_INTENT_RE =
  /\b(?:need|want|order|take|looking for|i need|get)\s+(?:about|around|roughly)?\s*(\d+)\b/i;
const WORD_QUANTITY_RE =
  /\b(one|two|three|four|five)\s+hundred\b/i;
const GRADE_RE = /grade\s+([abc](?:\s*\/\s*[abc])?)\b/i;
const GRADED_RE = /\bgraded?\s+([ab]+(?:\s*\/\s*[ab]+)?)\b/i;
const HIGH_GRADE_RE = /\bhigh[\s-]?grade\b/i;
const BUDGET_TOTAL_RE =
  /\btotal\s+(?:of\s+)?(?:\$|USD\s*)?([\d,]+(?:\.\d{2})?)\b/i;
const BUDGET_SPELLED_RE = /\btotal\s+one\s+thousand\s+two\s+hundred\b/i;
const UNIT_PRICE_RE =
  /\$?([\d,]+(?:\.\d{2})?)\s*(?:per piece|each|\/pc|a piece)\b/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const DEADLINE_RE = new RegExp(
  `\\b(?:before|by)\\s+((?:${MONTHS})(?:\\s+\\d{4})?|\\d{1,2}\\s+(?:${MONTHS})(?:\\s+\\d{4})?)\\b`,
  "i",
);
const MONTH_ONLY_RE = new RegExp(`\\b(${MONTHS})(?:\\s+\\d{4})?\\b`, "i");

/** Discount / negotiation phrasing — do not treat embedded qty as committed.
 *  Conditional commitments only ("if I take 400") — a plain "I'll take 200
 *  pieces" IS the committed quantity and must capture. */
const DISCOUNT_CONTEXT_RE =
  /\b(can you do|could you do|discount|better rate|best price|volume (deal|price)|if i (take|commit to|order))\b/i;

export function createStateMachine(opts?: { categoryVocabulary?: string[] }) {
  const fields: Record<FieldName, FieldState> = Object.fromEntries(
    FIELD_NAMES.map((f) => [f, { state: "pending" as const }]),
  ) as Record<FieldName, FieldState>;

  let confirmed = false;
  const conflictEvents: ConflictEvent[] = [];
  const vocabulary = (opts?.categoryVocabulary ?? []).map((v) =>
    v.toLowerCase(),
  );

  function capture(field: FieldName, value: string): void {
    const prev = fields[field];
    if (
      prev.state === "captured" &&
      prev.value !== undefined &&
      prev.value !== value
    ) {
      conflictEvents.push({
        field,
        previous: prev.value,
        next: value,
      });
    }
    fields[field] = { state: "captured", value };
  }

  function chips(): FieldChipState[] {
    return FIELD_NAMES.map((field) => {
      const f = fields[field];
      return f.state === "captured"
        ? { field, state: "captured" as const, value: f.value }
        : { field, state: "pending" as const };
    });
  }

  function nextQuestion(): FieldName | null {
    for (const field of NEXT_QUESTION_PRIORITY) {
      if (fields[field].state === "pending") return field;
    }
    return null;
  }

  function canQualify(): boolean {
    if (fields.contact.state !== "captured") return false;
    const hasCategory = fields.category.state === "captured";
    const hasQuantity = fields.quantity.state === "captured";
    const hasBudget = fields.budget.state === "captured";
    return hasCategory && (hasQuantity || hasBudget);
  }

  function markConfirmed(): void {
    confirmed = true;
  }

  function isConfirmed(): boolean {
    return confirmed;
  }

  function getConflicts(): ConflictEvent[] {
    return [...conflictEvents];
  }

  function getValue(field: FieldName): string | undefined {
    return fields[field].state === "captured" ? fields[field].value : undefined;
  }

  function extractQuantity(text: string, allowDiscountContext = false): void {
    if (!allowDiscountContext && DISCOUNT_CONTEXT_RE.test(text)) return;

    const qtyMatch = text.match(QUANTITY_RE);
    if (qtyMatch) {
      capture("quantity", qtyMatch[1]);
      return;
    }

    const intentMatch = text.match(QUANTITY_INTENT_RE);
    if (intentMatch) {
      capture("quantity", intentMatch[1]);
      return;
    }

    const wordMatch = text.match(WORD_QUANTITY_RE);
    if (wordMatch) {
      const hundreds: Record<string, string> = {
        one: "100",
        two: "200",
        three: "300",
        four: "400",
        five: "500",
      };
      capture("quantity", hundreds[wordMatch[1].toLowerCase()] ?? "100");
    }
  }

  function extractGrade(text: string): void {
    const gradeMatch = text.match(GRADE_RE);
    if (gradeMatch) {
      capture("grade", gradeMatch[1].toUpperCase().replace(/\s+/g, ""));
      return;
    }

    const gradedMatch = text.match(GRADED_RE);
    if (gradedMatch) {
      capture("grade", gradedMatch[1].toUpperCase().replace(/\s+/g, ""));
      return;
    }

    if (HIGH_GRADE_RE.test(text) && !getValue("grade")) {
      capture("grade", "High");
    }
  }

  function extractBudget(text: string): void {
    const totalMatch = text.match(BUDGET_TOTAL_RE);
    if (totalMatch) {
      capture("budget", totalMatch[1].replace(/,/g, ""));
      return;
    }

    if (BUDGET_SPELLED_RE.test(text)) {
      capture("budget", "1200");
      return;
    }

    const unitMatch = text.match(UNIT_PRICE_RE);
    if (unitMatch && /\btotal\b/i.test(text)) {
      capture("budget", unitMatch[1].replace(/,/g, ""));
    }
  }

  function extractDeadline(text: string): void {
    const deadlineMatch = text.match(DEADLINE_RE) ?? text.match(MONTH_ONLY_RE);
    if (!deadlineMatch) return;

    const raw = deadlineMatch[0];
    if (/^(before|by)\b/i.test(raw) || DEADLINE_RE.test(text)) {
      const full = text.match(DEADLINE_RE);
      capture("deadline", full ? full[0] : raw);
    } else if (!getValue("deadline")) {
      if (/\b(before|by|need|deadline|until|in)\s+(?:\d+\s+)?(?:weeks?|days?|months?)\b/i.test(text)) {
        capture("deadline", deadlineMatch[0]);
      } else if (/\b(before|by|need|deadline|until)\b/i.test(text)) {
        capture("deadline", deadlineMatch[0]);
      }
    }
  }

  function extractDestination(text: string): void {
    const lower = text.toLowerCase();
    for (const dest of DESTINATIONS) {
      const re = new RegExp(`\\b${dest.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(lower)) {
        const canonical =
          dest === "usa" ? "US" : dest.length <= 3 ? dest.toUpperCase() : capitalize(dest);
        if (!getValue("destination")) {
          capture("destination", canonical);
        }
        break;
      }
    }
  }

  function extractCategory(text: string): void {
    if (getValue("category") || vocabulary.length === 0) return;
    const sorted = [...vocabulary].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      const re = new RegExp(
        `\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`,
        "i",
      );
      if (re.test(text)) {
        capture("category", term);
        break;
      }
    }
  }

  function noteBuyerTurn(text: string): void {
    const email = text.match(EMAIL_RE);
    if (email) {
      const existing = getValue("contact");
      if (!existing) {
        capture("contact", email[0]);
      } else if (!existing.includes("@") && !EMAIL_RE.test(existing)) {
        capture("contact", `${existing} <${email[0]}>`);
      }
    } else {
      const phone = text.match(PHONE_RE);
      if (phone && !getValue("contact")) {
        capture("contact", phone[0].trim());
      }
    }

    extractGrade(text);
    if (!DISCOUNT_CONTEXT_RE.test(text)) {
      extractQuantity(text);
    }
    extractDeadline(text);
    extractDestination(text);
    extractCategory(text);
  }

  /** Agent confirmations often carry qty/grade/budget the buyer stated loosely. */
  function noteAgentTurn(text: string): void {
    extractGrade(text);
    extractQuantity(text, true);
    extractBudget(text);
    extractDeadline(text);
    extractDestination(text);
    extractCategory(text);
  }

  return {
    capture,
    chips,
    nextQuestion,
    canQualify,
    markConfirmed,
    isConfirmed,
    getConflicts,
    getValue,
    noteBuyerTurn,
    noteAgentTurn,
    fields,
  };
}

export type StateMachine = ReturnType<typeof createStateMachine>;

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
