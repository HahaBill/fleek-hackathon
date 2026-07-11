import type { WebSocket } from "ws";

import type { AgentEvent } from "@fleek/shared";
import type { FastifyInstance } from "fastify";

import { getBufferedEvents, getSession, subscribeSession } from "../session/store.js";

const socketsBySession = new Map<string, Set<WebSocket>>();

export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/ws/session/:id",
    { websocket: true },
    (socket, req) => {
      const sessionId = req.params.id;
      const session = getSession(sessionId);
      if (!session) {
        socket.close(4404, "Session not found");
        return;
      }

      let sockets = socketsBySession.get(sessionId);
      if (!sockets) {
        sockets = new Set();
        socketsBySession.set(sessionId, sockets);
      }
      sockets.add(socket);

      for (const event of getBufferedEvents(sessionId)) {
        socket.send(JSON.stringify(event));
      }

      const unsubscribe = subscribeSession(sessionId, (event: AgentEvent) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      });

      socket.on("close", () => {
        unsubscribe();
        sockets?.delete(socket);
        if (sockets?.size === 0) socketsBySession.delete(sessionId);
      });
    }
  );
}
