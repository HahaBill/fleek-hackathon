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

const QUANTITY_RE = /\b(\d+)\s*(pieces|pcs|units|pc)\b/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const GRADE_RE = /grade\s+([abc])\b/i;
const DEADLINE_RE = new RegExp(
  `\\b(?:before|by)\\s+((?:${MONTHS})(?:\\s+\\d{4})?|\\d{1,2}\\s+(?:${MONTHS})(?:\\s+\\d{4})?)\\b`,
  "i",
);
const MONTH_ONLY_RE = new RegExp(`\\b(${MONTHS})(?:\\s+\\d{4})?\\b`, "i");

/** Discount / negotiation phrasing — do not treat embedded qty as committed. */
const DISCOUNT_CONTEXT_RE =
  /\b(can you do|discount|better rate|best price|if i take|take \d+)\b/i;

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

  function noteBuyerTurn(text: string): void {
    // Email / phone → contact.method (only if contact not yet set, or method missing)
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

    // Grade
    const gradeMatch = text.match(GRADE_RE);
    if (gradeMatch) {
      capture("grade", gradeMatch[1].toUpperCase());
    }

    // Quantity — skip when discount/negotiation context (don't overwrite with "400")
    const qtyMatch = text.match(QUANTITY_RE);
    if (qtyMatch && !DISCOUNT_CONTEXT_RE.test(text)) {
      capture("quantity", qtyMatch[1]);
    }

    // Deadline
    const deadlineMatch = text.match(DEADLINE_RE) ?? text.match(MONTH_ONLY_RE);
    if (deadlineMatch) {
      const raw = deadlineMatch[0];
      // Prefer "before X" / "by X" full match when present
      if (/^(before|by)\b/i.test(raw) || DEADLINE_RE.test(text)) {
        const full = text.match(DEADLINE_RE);
        capture("deadline", full ? full[0] : raw);
      } else if (!getValue("deadline")) {
        // bare month only if nothing else captured — still conservative
        if (/\b(before|by|need|deadline|until)\b/i.test(text)) {
          capture("deadline", deadlineMatch[0]);
        }
      }
    }

    // Destination
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

    // Category from seed vocabulary — longest match first
    if (!getValue("category") && vocabulary.length > 0) {
      const sorted = [...vocabulary].sort((a, b) => b.length - a.length);
      for (const term of sorted) {
        const re = new RegExp(
          `\\b${escapeRegExp(term).replace(/\s+/g, "\\s+")}\\b`,
          "i",
        );
        if (re.test(text)) {
          // Prefer stock category names over style tags when both match;
          // vocabulary includes both — use the matched term as value.
          capture("category", term);
          break;
        }
      }
    }
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
