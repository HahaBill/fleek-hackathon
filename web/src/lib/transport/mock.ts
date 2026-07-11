import type { AgentEvent, SessionTransport } from "@/lib/contracts";
import { DEMO_CALL, UNRESOLVED_LEAD, type TimedEvent } from "./fixtures/demo-call";

/**
 * MockTransport replays a scripted AgentEvent fixture so the whole UI runs with
 * no backend. It implements the same `SessionTransport` the real voice client
 * will, so Checkpoint 2 integration is a one-line swap in `index.ts`.
 *
 * - Voice mode: `start()` auto-plays the entire fixture on its timeline.
 * - Text mode: `start()` waits; each `sendText()` echoes the typed line and
 *   plays the next scripted beat (buyer turn -> agent response).
 * - `end()` cancels playback and jumps to the terminal (hangup) events.
 */
export class MockTransport implements SessionTransport {
  private listeners = new Set<(e: AgentEvent) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private preamble: TimedEvent[] = [];
  private beats: TimedEvent[][] = [];
  private beatIndex = 0;
  private mode: "voice" | "text" = "voice";
  private done = false;

  constructor(private fixture: TimedEvent[] = DEMO_CALL) {
    this.segment();
  }

  /** Split the fixture into a preamble and one beat per buyer turn. */
  private segment() {
    let current: TimedEvent[] | null = null;
    for (const item of this.fixture) {
      const isBuyerTurn =
        item.event.type === "turn" && item.event.role === "buyer" && item.event.final;
      if (isBuyerTurn) {
        current = [item];
        this.beats.push(current);
      } else if (current) {
        current.push(item);
      } else {
        this.preamble.push(item);
      }
    }
  }

  onEvent(cb: (e: AgentEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: AgentEvent) {
    this.listeners.forEach((l) => l(e));
  }

  /** Play a list of timed events from `base` ms, tracking timers for cancel. */
  private play(items: TimedEvent[], base = 0) {
    let t = base;
    for (const { delayMs, event } of items) {
      t += delayMs;
      this.timers.push(setTimeout(() => this.emit(event), t));
    }
    return t;
  }

  /**
   * The fixture hardcodes `session.started` as voice. Rewrite it to whatever
   * mode the caller actually started in, so text mode doesn't get flipped back
   * to voice when the event is applied.
   */
  private withMode(items: TimedEvent[]): TimedEvent[] {
    return items.map((item) =>
      item.event.type === "session.started"
        ? { ...item, event: { ...item.event, mode: this.mode } }
        : item
    );
  }

  async start(mode: "voice" | "text") {
    this.mode = mode;
    this.done = false;
    this.beatIndex = 0;
    if (mode === "voice") {
      this.play(this.withMode(this.fixture));
    } else {
      // Emit the preamble (session.started) and wait for the first sendText.
      this.play(this.withMode(this.preamble));
    }
  }

  sendText(text: string) {
    if (this.mode !== "text" || this.done) return;
    const beat = this.beats[this.beatIndex];
    if (!beat) return;
    // Replace the scripted buyer line with what the user actually typed.
    const [buyerItem, ...rest] = beat;
    const buyerEvent = buyerItem.event;
    if (buyerEvent.type === "turn") {
      this.emit({ ...buyerEvent, text });
    }
    this.play(rest, 200);
    this.beatIndex += 1;
  }

  end() {
    if (this.done) return;
    this.done = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    // Buyer hung up before the call finished on its own: unresolved outcome.
    this.emit({ type: "call.ended", endedBy: "hangup" });
    setTimeout(
      () =>
        this.emit({
          type: "summary.ready",
          lead: UNRESOLVED_LEAD,
          prose:
            "The call ended before the buyer's request could be qualified. No contact or requirement was confirmed.",
          insights: [],
        }),
      500
    );
  }
}
