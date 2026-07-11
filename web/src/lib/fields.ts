import type { FieldName, LeadRecord, LeadStatus } from "@/lib/contracts";

export const FIELD_LABELS: Record<FieldName, string> = {
  contact: "Contact",
  category: "Category",
  quantity: "Quantity",
  brand: "Brand",
  grade: "Grade",
  budget: "Budget",
  destination: "Destination",
  deadline: "Deadline",
};

/** Order the chips appear in during the call (most telling first). */
export const CHIP_ORDER: FieldName[] = [
  "category",
  "quantity",
  "grade",
  "destination",
  "deadline",
  "contact",
  "budget",
  "brand",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  in_progress: "In progress",
  qualified_follow_up: "Qualified follow-up",
  human_handoff_requested: "Human handoff",
  unresolved: "Unresolved",
};

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Flatten the deterministic lead record into the display grid rendered on the
 * summary card. Values come from `lead` ONLY, never from the prose. A missing
 * field renders as an em-dash-free placeholder.
 */
export function leadGrid(lead: LeadRecord): { label: string; value: string }[] {
  const r = lead.requirements;
  const price =
    r.budget !== undefined
      ? `${r.currency === "USD" ? "$" : `${r.currency ?? ""} `}${r.budget.toFixed(2)}/pc`
      : "";
  const contact = [lead.contact.name, lead.contact.method].filter(Boolean).join(", ");
  return [
    { label: "Category", value: r.categories.join(", ") },
    { label: "Grade", value: r.grade ?? "" },
    { label: "Quantity", value: r.quantity !== undefined ? `${r.quantity} pieces` : "" },
    { label: "Budget", value: price },
    { label: "Destination", value: r.destination ?? "" },
    { label: "Deadline", value: r.timeframe ?? "" },
    { label: "Contact", value: contact },
    { label: "Brand", value: r.brands.join(", ") },
  ].map((f) => ({ ...f, value: f.value || "Not captured" }));
}
