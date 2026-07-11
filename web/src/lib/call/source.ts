import { MockCallSource } from "./mock-source";
import type { CallSource } from "./types";

/**
 * The single swap point between the mock and the real backend.
 *
 * To go live: return an implementation of `CallSource` backed by the voice
 * pipeline (OpenAI Realtime events for voice, the text pipeline for text mode)
 * instead of `MockCallSource`. Nothing else in the UI needs to change.
 */
export function createCallSource(): CallSource {
  return new MockCallSource();
}
