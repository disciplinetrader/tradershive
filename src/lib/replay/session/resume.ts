/**
 * Phase 8A · resume — rebuild a live session from a persisted snapshot.
 *
 * Cross-device resume is only honest when the bars are provably the same, so
 * the dataset is re-checksummed first. When it changed, we refuse rather than
 * silently continue a session that can no longer be reproduced.
 */

import type { OrderStores } from "@/lib/chart/orders/service";
import { ReplaySessionEngine, type EngineOptions } from "./engine";
import type { ReplayDataset } from "./dataset";
import { ReplayEventLog } from "./events";
import type { SessionSnapshot } from "./model";
import { validateSnapshot } from "./validation";

export type ResumeResult =
  | { ok: true; engine: ReplaySessionEngine; resumedAtCursor: number }
  | { ok: false; reason: "version" | "dataset" | "corrupt"; message: string };

export interface ResumeOptions extends Omit<EngineOptions, "meta" | "clock" | "events" | "revision"> {
  snapshot: unknown;
  dataset: ReplayDataset;
  stores: OrderStores;
}

export function resumeSession(opts: ResumeOptions): ResumeResult {
  const verdict = validateSnapshot(opts.snapshot, opts.dataset.identity);
  if (!verdict.ok) return verdict;
  const snapshot: SessionSnapshot = verdict.snapshot;

  // Execution state first: the engine must never emit an observation before
  // the orders it belongs to are back in the store.
  for (const order of snapshot.orders) {
    if (opts.stores.orders.byId(order.id)) opts.stores.orders.replace(order);
    else opts.stores.orders.add(order);
  }


  const log = new ReplayEventLog(snapshot.events);
  // A crash between "orders written" and "clock written" can leave the log
  // ahead of the clock. Trust the log: never re-run an observation twice.
  const cursor = Math.max(snapshot.clock.cursor, log.highWaterCursor());

  const engine = new ReplaySessionEngine({
    ...opts,
    meta: { ...snapshot.meta, lifecycle: snapshot.meta.lifecycle === "running" ? "paused" : snapshot.meta.lifecycle },
    clock: { ...snapshot.clock, cursor, status: "paused" },
    viewport: snapshot.viewport,
    events: log,
    revision: snapshot.revision,
  });

  return { ok: true, engine, resumedAtCursor: cursor };
}

/** Last-write-wins between a local and a remote snapshot of one session. */
export function pickFreshestSnapshot(a: SessionSnapshot | null, b: SessionSnapshot | null): SessionSnapshot | null {
  if (!a) return b;
  if (!b) return a;
  if (a.revision !== b.revision) return a.revision > b.revision ? a : b;
  if (a.savedAt !== b.savedAt) return a.savedAt > b.savedAt ? a : b;
  return a.clock.cursor >= b.clock.cursor ? a : b;
}
