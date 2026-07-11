import type { AgentEvent, SessionTransport } from "@fleek/shared";

const DEFAULT_SERVER = "http://localhost:3001";

/** HTTP base — empty string uses same-origin (Next.js rewrite to @fleek/server). */
export function apiBase(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL;
  }
  if (typeof window !== "undefined") {
    return "";
  }
  return DEFAULT_SERVER;
}

/** WebSocket base — direct to server; Next.js rewrites do not proxy WS. */
export function wsBase(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SERVER_URL) {
    return process.env.NEXT_PUBLIC_SERVER_URL.replace(/^http/, "ws");
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.hostname}:3001`;
  }
  return "ws://localhost:3001";
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

type ToolResponse = { result: unknown; events: AgentEvent[] };

/**
 * Browser transport that connects to @fleek/server over HTTP + WebSocket.
 * Voice audio is handled separately (ElevenLabs React SDK); this transport
 * owns session state, tool routing, chips, and the event stream.
 */
export class ServerEventTransport implements SessionTransport {
  private sessionId: string | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private ws: WebSocket | null = null;

  onEvent(cb: (e: AgentEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(event: AgentEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  private emitAll(events: AgentEvent[]): void {
    for (const event of events) this.emit(event);
  }

  private connectWs(): void {
    if (!this.sessionId || typeof WebSocket === "undefined") return;
    const url = `${wsBase()}/ws/session/${this.sessionId}`;
    this.ws?.close();
    this.ws = new WebSocket(url);
    this.ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(String(msg.data)) as AgentEvent;
        this.emit(event);
      } catch {
        // ignore malformed frames
      }
    };
  }

  async start(mode: "voice" | "text"): Promise<void> {
    const { sessionId } = await postJson<{ sessionId: string }>("/api/session", { mode });
    this.sessionId = sessionId;
    this.connectWs();
    const { events } = await getJson<{ events: AgentEvent[] }>(
      `/api/session/${sessionId}/events`
    ).catch(() => ({ events: [] as AgentEvent[] }));
    if (Array.isArray(events)) {
      this.emitAll(events);
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async noteBuyerTurn(text: string): Promise<AgentEvent[]> {
    if (!this.sessionId) return [];
    const { events } = await postJson<{ events: AgentEvent[] }>(
      `/api/session/${this.sessionId}/buyer-turn`,
      { text }
    );
    this.emitAll(events);
    return events;
  }

  async noteAgentTurn(text: string): Promise<AgentEvent[]> {
    if (!this.sessionId) return [];
    const { events } = await postJson<{ events: AgentEvent[] }>(
      `/api/session/${this.sessionId}/agent-turn`,
      { text }
    );
    this.emitAll(events);
    return events;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
    if (!this.sessionId) throw new Error("No active session");
    const response = await postJson<ToolResponse>(
      `/api/session/${this.sessionId}/tool`,
      { name, args }
    );
    this.emitAll(response.events);
    return response;
  }

  sendText(text: string): void {
    void this.noteBuyerTurn(text);
  }

  end(): void {
    if (!this.sessionId) return;
    void postJson(`/api/session/${this.sessionId}/end`);
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }
}
