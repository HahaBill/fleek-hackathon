import type { SessionTransport } from "@/lib/contracts";
import { MockTransport } from "./mock";
import { DEMO_CALL, UNRESOLVED_CALL } from "./fixtures/demo-call";

export type FixtureName = "demo" | "unresolved";

/**
 * The single swap point between the mock and the real backend (Checkpoint 2).
 *
 * To go live, return the real transport from `@fleek/voice-client` here, gated
 * on a `TRANSPORT=mock|real` env flag so the mock stays available as the demo
 * fallback ladder. Every component upstream only ever sees `SessionTransport`.
 */
export function createTransport(fixture: FixtureName = "demo"): SessionTransport {
  return new MockTransport(fixture === "unresolved" ? UNRESOLVED_CALL : DEMO_CALL);
}
