import type { FastifyInstance } from "fastify";

import {
  createSession,
  finalizeHangup,
  getBufferedEvents,
  getSession,
  handleToolCall,
  noteAgentTurn,
  noteBuyerTurn,
} from "../session/store.js";

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { mode?: "voice" | "text" } }>("/api/session", async (req) => {
    const mode = req.body?.mode ?? "voice";
    const session = createSession(mode);
    return { sessionId: session.id, mode: session.mode };
  });

  app.get<{ Params: { id: string } }>("/api/session/:id/events", async (req, reply) => {
    const session = getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return { events: getBufferedEvents(req.params.id) };
  });

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/api/session/:id/buyer-turn",
    async (req, reply) => {
      const session = getSession(req.params.id);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const events = noteBuyerTurn(session, req.body.text);
      return { events };
    }
  );

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/api/session/:id/agent-turn",
    async (req, reply) => {
      const session = getSession(req.params.id);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const events = noteAgentTurn(session, req.body.text);
      return { events };
    }
  );

  app.post<{
    Params: { id: string };
    Body: { name: string; args?: Record<string, unknown> };
  }>("/api/session/:id/tool", async (req, reply) => {
    const session = getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    const { result, events } = handleToolCall(
      session,
      req.body.name,
      req.body.args ?? {}
    );
    return { result, events };
  });

  app.post<{ Params: { id: string } }>("/api/session/:id/end", async (req, reply) => {
    const session = getSession(req.params.id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    const events = finalizeHangup(session);
    return { events };
  });
}
