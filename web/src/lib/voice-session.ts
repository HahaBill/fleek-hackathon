import type {
  AgentEvent,
  FieldChipState,
  LeadRecord,
} from "@/lib/contracts";

export type VoicePhase = "in_call" | "summary";

export interface VoiceSessionState {
  phase: VoicePhase;
  chips: FieldChipState[];
  lead: LeadRecord | null;
  prose: string;
  insights: string[];
}

export const INITIAL_VOICE_SESSION: VoiceSessionState = {
  phase: "in_call",
  chips: [],
  lead: null,
  prose: "",
  insights: [],
};

let toolSeq = 0;
let guardSeq = 0;

export type ServerFeedAppend =
  | { kind: "tool"; key: string; tool: string; summary: string }
  | { kind: "guardrail"; key: string; variant: "escalation" | "unprovenanced_number"; detail: string };

export function reduceAgentEvent(
  state: VoiceSessionState,
  event: AgentEvent
): { state: VoiceSessionState; feedAppends: ServerFeedAppend[] } {
  const feedAppends: ServerFeedAppend[] = [];

  switch (event.type) {
    case "chips":
      return { state: { ...state, chips: event.chips }, feedAppends };

    case "tool.result":
      feedAppends.push({
        kind: "tool",
        key: `tool-${++toolSeq}`,
        tool: event.tool,
        summary: event.summary,
      });
      return { state, feedAppends };

    case "guardrail":
      feedAppends.push({
        kind: "guardrail",
        key: `guard-${++guardSeq}`,
        variant: event.kind,
        detail: event.detail,
      });
      return { state, feedAppends };

    case "summary.ready":
      return {
        state: {
          ...state,
          phase: "summary",
          lead: event.lead,
          prose: event.prose,
          insights: event.insights ?? [],
          chips: state.chips,
        },
        feedAppends,
      };

    default:
      return { state, feedAppends };
  }
}

export function resetVoiceSessionCounters(): void {
  toolSeq = 0;
  guardSeq = 0;
}
