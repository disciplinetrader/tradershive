/**
 * Phase 8A · append-only Replay event log.
 *
 * The log is the audit trail of a session: every transport action and every
 * execution consequence, in sequence. It exists so a session can be proven
 * (what did the trader actually do?) and so an interrupted autosave can be
 * reconciled without guessing.
 *
 * Events are immutable and never reordered. Sequence numbers are dense and
 * start at 1.
 */

export type ReplayEventType =
  | "session_created"
  | "session_started"
  | "playback_started"
  | "playback_paused"
  | "speed_changed"
  | "observation_batch"
  | "candle_closed"
  | "order_placed"
  | "order_filled"
  | "order_cancelled"
  | "position_closed"
  | "checkpoint_saved"
  | "session_completed"
  | "session_abandoned";

export interface ReplayEvent {
  seq: number;
  type: ReplayEventType;
  /** Real wall-clock time the event was recorded. */
  at: number;
  /** Observation cursor when it happened — the replay-time coordinate. */
  cursor: number;
  /** Dataset timestamp under the cursor. */
  marketTime: number | null;
  payload?: Record<string, unknown>;
}

export interface AppendEventInput {
  type: ReplayEventType;
  at: number;
  cursor: number;
  marketTime?: number | null;
  payload?: Record<string, unknown>;
}

export class ReplayEventLog {
  private events: ReplayEvent[] = [];
  private seq = 0;
  /** Trim point: keep the tail bounded in memory, server keeps the rest. */
  private readonly maxTail: number;

  constructor(existing: ReplayEvent[] = [], maxTail = 500) {
    this.maxTail = maxTail;
    if (existing.length) {
      this.events = existing.slice().sort((a, b) => a.seq - b.seq);
      this.seq = this.events[this.events.length - 1].seq;
    }
  }

  append(input: AppendEventInput): ReplayEvent {
    const event: ReplayEvent = {
      seq: ++this.seq,
      type: input.type,
      at: input.at,
      cursor: input.cursor,
      marketTime: input.marketTime ?? null,
      payload: input.payload,
    };
    this.events.push(event);
    if (this.events.length > this.maxTail) this.events.splice(0, this.events.length - this.maxTail);
    return event;
  }

  list(): ReplayEvent[] { return this.events.slice(); }
  since(seq: number): ReplayEvent[] { return this.events.filter((e) => e.seq > seq); }
  last(): ReplayEvent | null { return this.events[this.events.length - 1] ?? null; }
  get length() { return this.events.length; }
  get nextSeq() { return this.seq + 1; }

  /** Highest cursor any event observed — the resume floor after a crash. */
  highWaterCursor(): number {
    return this.events.reduce((max, e) => Math.max(max, e.cursor), 0);
  }
}
