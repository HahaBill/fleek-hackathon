import type { AgentEvent } from "@fleek/shared";
import type { PipelineTarget } from "./pipeline";

/**
 * Checkpoint 3 adapter: drives Plan 2's real text-mode pipeline over its wire
 * protocol — POST /api/session {mode:"text"}, then WS /ws/session/:id with
 * {type:"user_text"} frames in and AgentEvent frames out, {type:"hangup"} to
 * end. Selected with EVAL_TARGET=ws EVAL_URL=http://localhost:3000.
 *
 * Uses Node's built-in WebSocket (Node 20.10+/22).
 */
export class WsPipeline implements PipelineTarget {
  private log: AgentEvent[] = [];
  private ws: WebSocket | null = null;
  private notify: (() => void)[] = [];

  constructor(private baseUrl: string, private waitMs = 30_000) {}

  private onEvent(e: AgentEvent) {
    this.log.push(e);
    const waiters = this.notify;
    this.notify = [];
    for (const w of waiters) w();
  }

  private async waitFor(predicate: (events: AgentEvent[]) => boolean, label: string): Promise<void> {
    const deadline = Date.now() + this.waitMs;
    while (!predicate(this.log)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 250);
        this.notify.push(() => { clearTimeout(timer); resolve(); });
      });
    }
  }

  async start(): Promise<void> {
    const res = await fetch(new URL("/api/session", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "text" }),
    });
    if (!res.ok) throw new Error(`POST /api/session failed: ${res.status}`);
    const { sessionId } = (await res.json()) as { sessionId: string };

    const wsUrl = new URL(`/ws/session/${sessionId}`, this.baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error(`WS connect failed: ${wsUrl}`)), { once: true });
    });
    ws.addEventListener("message", (ev) => {
      try {
        this.onEvent(JSON.parse(String(ev.data)) as AgentEvent);
      } catch {
        // Non-JSON frames are not part of the contract; ignore.
      }
    });
  }

  async sendTurn(text: string): Promise<void> {
    if (!this.ws) throw new Error("start() first");
    const before = this.log.length;
    this.ws.send(JSON.stringify({ type: "user_text", text }));
    await this.waitFor(
      (events) => events.slice(before).some((e) => e.type === "turn" && e.role === "agent" && e.final),
      `agent reply to "${text.slice(0, 40)}"`
    );
  }

  async end(): Promise<void> {
    if (!this.ws) return;
    if (!this.log.some((e) => e.type === "summary.ready")) {
      // The agent may already have ended the call via the end_call tool; only
      // hang up if the summary hasn't landed yet.
      if (!this.log.some((e) => e.type === "call.ended")) {
        this.ws.send(JSON.stringify({ type: "hangup" }));
      }
      await this.waitFor((events) => events.some((e) => e.type === "summary.ready"), "summary.ready");
    }
    this.ws.close();
    this.ws = null;
  }

  events(): AgentEvent[] {
    return [...this.log];
  }
}
