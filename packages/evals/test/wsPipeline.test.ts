import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { AgentEvent } from "@fleek/shared";
import { WsPipeline } from "../src/wsPipeline";

/**
 * Protocol-shape test against a mock server speaking Plan 2's wire contract.
 * Until Checkpoint 3 this is the only WsPipeline coverage; the real run is
 * EVAL_TARGET=ws EVAL_URL=... against the live server.
 */
describe("WsPipeline wire protocol", () => {
  let server: Server;
  let port: number;
  const received: unknown[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/api/session") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ sessionId: "s1", mode: "text" }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    const wss = new WebSocketServer({ server, path: "/ws/session/s1" });
    wss.on("connection", (socket) => {
      const send = (e: AgentEvent) => socket.send(JSON.stringify(e));
      send({ type: "session.started", sessionId: "s1", mode: "text" });
      socket.on("message", (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; text?: string };
        received.push(msg);
        if (msg.type === "user_text") {
          send({
            type: "turn",
            role: "agent",
            text: "You're speaking with an AI assistant. How can I help?",
            final: true,
            turnIndex: 1,
          });
        }
        if (msg.type === "hangup") {
          send({ type: "call.ended", endedBy: "hangup" });
          send({
            type: "summary.ready",
            lead: {
              leadId: "l1", contact: {}, requirements: { categories: [], brands: [] },
              questions: [], unknownFields: ["contact", "category", "quantity"],
              status: "unresolved", guardrailEvents: [],
            },
            prose: "The call ended before qualification.",
            insights: [],
          });
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    port = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("start → sendTurn → end speaks the exact wire contract", async () => {
    const pipeline = new WsPipeline(`http://127.0.0.1:${port}`, 5_000);
    await pipeline.start();
    await pipeline.sendTurn("Hello there");
    await pipeline.end();

    expect(received).toContainEqual({ type: "user_text", text: "Hello there" });
    expect(received).toContainEqual({ type: "hangup" });

    const events = pipeline.events();
    expect(events.some((e) => e.type === "session.started")).toBe(true);
    expect(events.some((e) => e.type === "turn" && e.role === "agent" && e.final)).toBe(true);
    expect(events.some((e) => e.type === "summary.ready")).toBe(true);
  });
});
