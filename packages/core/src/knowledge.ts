import type { KnowledgeFact, KnowledgeResult } from "@fleek/shared";
import { KnowledgeFactSchema } from "@fleek/shared";

export type SeedData = {
  supplier: string;
  stock: KnowledgeFact[];
  policies: {
    shipping_regions: string[];
    lead_times: string;
    payment_language: string;
    escalation_contact: string;
  };
};

const POLICY_KEYWORDS: Record<string, string[]> = {
  shipping: ["shipping", "ship", "delivery", "deliver", "regions"],
  payment: ["payment", "pay", "deposit", "balance"],
  lead_times: ["lead time", "lead times", "leadtime", "how long", "when will"],
  escalation_contact: ["owner", "escalation", "contact person", "imran"],
};

function policiesToFacts(policies: SeedData["policies"]): KnowledgeFact[] {
  return [
    KnowledgeFactSchema.parse({
      category: "policy",
      styleTags: ["shipping", "delivery", "regions"],
      brands: [],
      availability: `Shipping regions: ${policies.shipping_regions.join(", ")}`,
      notes: "shipping_regions",
    }),
    KnowledgeFactSchema.parse({
      category: "policy",
      styleTags: ["lead time", "lead times", "delivery"],
      brands: [],
      availability: policies.lead_times,
      notes: "lead_times",
    }),
    KnowledgeFactSchema.parse({
      category: "policy",
      styleTags: ["payment", "deposit", "balance"],
      brands: [],
      availability: policies.payment_language,
      notes: "payment_language",
    }),
    KnowledgeFactSchema.parse({
      category: "policy",
      styleTags: ["escalation", "owner", "contact"],
      brands: [],
      availability: policies.escalation_contact,
      notes: "escalation_contact",
    }),
  ];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9'/]+/)
    .filter(Boolean);
}

function factTokenSet(fact: KnowledgeFact): Set<string> {
  const parts = [
    fact.category,
    ...fact.styleTags,
    ...fact.brands,
    fact.notes ?? "",
  ];
  const set = new Set<string>();
  for (const p of parts) {
    set.add(p.toLowerCase());
    for (const t of tokenize(p)) set.add(t);
  }
  return set;
}

/** Whole-token AND match — never substring-hit (e.g. "wear" ≠ "knitwear"). */
function factMatchesQuery(fact: KnowledgeFact, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const set = factTokenSet(fact);
  return tokens.every((t) => set.has(t));
}

function isPolicyQuery(query: string): boolean {
  const q = query.toLowerCase();
  return Object.values(POLICY_KEYWORDS).some((kws) =>
    kws.some((kw) => q.includes(kw)),
  );
}

function matchesPolicyKeywords(fact: KnowledgeFact, query: string): boolean {
  const q = query.toLowerCase();
  const tags = fact.styleTags.map((t) => t.toLowerCase());
  const note = (fact.notes ?? "").toLowerCase();

  for (const [key, kws] of Object.entries(POLICY_KEYWORDS)) {
    if (!kws.some((kw) => q.includes(kw))) continue;
    if (note === key || tags.some((t) => kws.includes(t) || t.includes(key))) {
      return true;
    }
  }
  return tags.some((t) => q.includes(t));
}

export function createKnowledgeService(seed: SeedData) {
  const stock = seed.stock.map((f) => KnowledgeFactSchema.parse(f));
  const policyFacts = policiesToFacts(seed.policies);
  const allFacts = [...stock, ...policyFacts];

  function searchKnowledge(
    query: string,
    filters?: Record<string, string>,
  ): KnowledgeResult {
    const q = query.trim();
    if (!q) return { kind: "not_found" };

    const tokens = tokenize(q);
    let candidates: KnowledgeFact[];

    if (isPolicyQuery(q)) {
      candidates = policyFacts.filter((f) => matchesPolicyKeywords(f, q));
    } else {
      candidates = stock.filter((f) => factMatchesQuery(f, tokens));
    }

    if (filters) {
      const grade = filters.grade?.toLowerCase();
      const category = filters.category?.toLowerCase();
      candidates = candidates.filter((f) => {
        if (category && f.category.toLowerCase() !== category) return false;
        if (grade) {
          const g = (f.grade ?? "").toLowerCase();
          if (!g.includes(grade.toLowerCase())) return false;
        }
        return true;
      });
    }

    if (candidates.length === 0) return { kind: "not_found" };
    return { kind: "facts", facts: candidates };
  }

  function categoryVocabulary(): string[] {
    const vocab = new Set<string>();
    for (const f of stock) {
      vocab.add(f.category.toLowerCase());
      for (const t of f.styleTags) vocab.add(t.toLowerCase());
    }
    return [...vocab];
  }

  return { searchKnowledge, categoryVocabulary, allFacts };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
