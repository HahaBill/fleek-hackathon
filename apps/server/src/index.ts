import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";

import { registerSessionRoutes } from "./routes/session.js";
import { registerWebSocketRoutes } from "./routes/websocket.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);
  await registerSessionRoutes(app);
  await registerWebSocketRoutes(app);

  app.get("/health", async () => ({ ok: true }));

  await app.listen({ port: PORT, host: HOST });
  console.log(`@fleek/server listening on http://${HOST}:${PORT}`);
}

void main();
