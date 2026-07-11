import type { AgentEvent, LeadRecord, SummaryOutput, ToolName } from "@fleek/shared";
import { TOOL_NAMES } from "@fleek/shared";
import { createCore, loadSeed } from "@fleek/core";
import type { QualificationCore } from "@fleek/shared";

export type SessionRecord = {
  id: string;
  mode: "voice" | "text";
  core: QualificationCore;
  events: AgentEvent[];
  turnIndex: number;
  transcript: { role: "buyer" | "agent"; text: string }[];
};

const sessions = new Map<string, SessionRecord>();
const liveListeners = new Map<string, Set<(event: AgentEvent) => void>>();

function newSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emit(session: SessionRecord, event: AgentEvent): void {
  session.events.push(event);
  const listeners = liveListeners.get(session.id);
  if (listeners) {
    for (const listener of listeners) listener(event);
  }
}

export function subscribeSession(
  sessionId: string,
  listener: (event: AgentEvent) => void
): () => void {
  let set = liveListeners.get(sessionId);
  if (!set) {
    set = new Set();
    liveListeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) liveListeners.delete(sessionId);
  };
}

export function createSession(mode: "voice" | "text"): SessionRecord {
  const id = newSessionId();
  const session: SessionRecord = {
    id,
    mode,
    core: createCore(loadSeed()),
    events: [],
    turnIndex: 0,
    transcript: [],
  };
  emit(session, { type: "session.started", sessionId: id, mode, provider: "elevenlabs" });
  emit(session, { type: "chips", chips: session.core.chips() });
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export function getBufferedEvents(id: string): AgentEvent[] {
  return sessions.get(id)?.events ?? [];
}

function summaryStub(lead: LeadRecord): SummaryOutput {
  const name = lead.contact.name ?? "the buyer";
  const qty = lead.requirements.quantity;
  const cat = lead.requirements.categories[0] ?? "stock";
  return {
    prose: `${name} enquired about ${qty ? `${qty} pieces of ` : ""}${cat}. Status: ${lead.status.replace(/_/g, " ")}.`,
    insights: lead.escalation
      ? [`Escalation: ${lead.escalation.reason}`]
      : ["Requirements captured for supplier follow-up"],
  };
}

export function noteBuyerTurn(session: SessionRecord, text: string): AgentEvent[] {
  session.turnIndex += 1;
  const turnIndex = session.turnIndex;
  session.transcript.push({ role: "buyer", text });
  session.core.noteBuyerTurn(text);

  const out: AgentEvent[] = [
    { type: "turn", role: "buyer", text, final: true, turnIndex },
    { type: "chips", chips: session.core.chips() },
  ];

  const escalations = session.core.evaluateEscalations(text);
  for (const e of escalations) {
    out.push({
      type: "guardrail",
      kind: "escalation",
      detail: e.reason,
      ruleId: e.rule,
      turnIndex,
    });
  }

  for (const event of out) emit(session, event);
  return out;
}

export function noteAgentTurn(session: SessionRecord, text: string): AgentEvent[] {
  session.turnIndex += 1;
  const turnIndex = session.turnIndex;
  session.transcript.push({ role: "agent", text });
  session.core.noteAgentTurn(text);

  const out: AgentEvent[] = [
    { type: "turn", role: "agent", text, final: true, turnIndex },
    { type: "chips", chips: session.core.chips() },
  ];

  for (const event of out) emit(session, event);
  return out;
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export function handleToolCall(
  session: SessionRecord,
  name: string,
  args: Record<string, unknown>
): { result: unknown; events: AgentEvent[] } {
  if (!isToolName(name)) {
    return { result: { error: `Unknown tool: ${name}` }, events: [] };
  }

  const turnIndex = session.turnIndex;
  const events: AgentEvent[] = [];
  const toolCall: AgentEvent = { type: "tool.call", tool: name, args, turnIndex };
  events.push(toolCall);
  emit(session, toolCall);

  let result: unknown;
  let summary = "";

  switch (name) {
    case "search_supplier_knowledge": {
      const query = String(args.query ?? "");
      const filters = args.filters as Record<string, string> | undefined;
      const knowledge = session.core.searchKnowledge(query, filters);
      if (knowledge.kind === "facts") {
        summary = `${knowledge.facts.length} facts`;
        result = knowledge;
      } else {
        summary = "not_found";
        result = knowledge;
      }
      break;
    }
    case "create_or_update_lead": {
      const fields = args as Parameters<QualificationCore["upsertLead"]>[0];
      const upsert = session.core.upsertLead(fields);
      if (args.confirmed === true) {
        session.core.markConfirmed();
      }
      const next = session.core.nextQuestion();
      result = {
        leadId: upsert.leadId,
        missingFields: upsert.missingFields,
        nextQuestion: next,
      };
      summary = `${upsert.missingFields.length} missing`;
      const chipsEvent: AgentEvent = { type: "chips", chips: session.core.chips() };
      events.push(chipsEvent);
      emit(session, chipsEvent);
      break;
    }
    case "request_human_follow_up": {
      const reason = String(args.reason ?? "human follow-up");
      const context = String(args.context ?? "");
      const handoff = session.core.requestHandoff(reason, context);
      result = handoff;
      summary = reason;
      const guard: AgentEvent = {
        type: "guardrail",
        kind: "escalation",
        detail: `${reason} ${context}`.trim(),
        ruleId: "binding_price_request",
        turnIndex,
      };
      events.push(guard);
      emit(session, guard);
      const chipsEvent: AgentEvent = { type: "chips", chips: session.core.chips() };
      events.push(chipsEvent);
      emit(session, chipsEvent);
      break;
    }
    case "end_call": {
      const lead = session.core.finalize("end_call");
      const summaryOut = summaryStub(lead);
      const ended: AgentEvent = { type: "call.ended", endedBy: "end_call" };
      const ready: AgentEvent = {
        type: "summary.ready",
        lead,
        prose: summaryOut.prose,
        insights: summaryOut.insights,
      };
      events.push(ended, ready);
      emit(session, ended);
      emit(session, ready);
      result = { ok: true };
      summary = "ended";
      break;
    }
  }

  const toolResult: AgentEvent = {
    type: "tool.result",
    tool: name,
    summary,
    payload: result,
    turnIndex,
  };
  events.push(toolResult);
  emit(session, toolResult);

  return { result, events };
}

export function finalizeHangup(session: SessionRecord): AgentEvent[] {
  const lead = session.core.finalize("hangup");
  const summaryOut = summaryStub(lead);
  const events: AgentEvent[] = [
    { type: "call.ended", endedBy: "hangup" },
    {
      type: "summary.ready",
      lead,
      prose: summaryOut.prose,
      insights: summaryOut.insights,
    },
  ];
  for (const event of events) emit(session, event);
  return events;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}
