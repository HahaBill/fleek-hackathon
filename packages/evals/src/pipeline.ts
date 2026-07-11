import type { AgentEvent } from "@fleek/shared";

/**
 * The harness drives anything that implements PipelineTarget (Plan 4 §2).
 * ScriptedPipeline is the standalone rig; WsPipeline (wsPipeline.ts) drives
 * the real text-mode server at Checkpoint 3.
 */
export interface PipelineTarget {
  start(): Promise<void>;
  /** Send one buyer turn; resolves once the agent's reply events are in. */
  sendTurn(text: string): Promise<void>;
  /** End the call (hangup if the script didn't end it) and flush terminal events. */
  end(): Promise<void>;
  events(): AgentEvent[];
}

/** A canned conversation: what the fake pipeline emits around each buyer turn. */
export interface Script {
  preamble: AgentEvent[];
  /** beats[i] = events emitted in response to buyer turn i (0-based). */
  beats: AgentEvent[][];
  /** Emitted on end(): end_call tool call / call.ended / summary.ready. */
  terminal: AgentEvent[];
}

export class ScriptedPipeline implements PipelineTarget {
  private log: AgentEvent[] = [];
  private turn = 0;
  private ended = false;

  constructor(private script: Script) {}

  async start(): Promise<void> {
    this.log.push(...this.script.preamble);
  }

  async sendTurn(text: string): Promise<void> {
    this.turn += 1;
    // The buyer turn is synthesized from what was actually sent, so the
    // provenance ledger is tied to the real persona turns, not the script.
    this.log.push({ type: "turn", role: "buyer", text, final: true, turnIndex: this.turn });
    this.log.push(...(this.script.beats[this.turn - 1] ?? []));
  }

  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.log.push(...this.script.terminal);
  }

  events(): AgentEvent[] {
    return [...this.log];
  }
}
