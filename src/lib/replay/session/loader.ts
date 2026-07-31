/**
 * Phase 8B · Replay Studio bootstrap.
 *
 * Turns "a session row + freshly loaded candles" into a live, canonical
 * Phase 8A engine — or into an honest refusal. There is exactly one way a
 * Replay Studio session can start, and it goes through here:
 *
 *   candles ─► buildDataset ─► validateDataset (preflight)
 *                                    │
 *                     snapshot? ─────┴─► resumeSession (checksum verified)
 *                     no snapshot ─────► fresh engine
 *
 * Execution state lives in per-session store instances so a replay can never
 * contaminate — or be contaminated by — live chart trading.
 */

import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "@/lib/chart/orders/store";
import { ClosedTradeStore } from "@/lib/chart/orders/trade-store";
import type { OrderStores } from "@/lib/chart/orders/service";
import type { Candle, Timeframe } from "../types";
import { buildDataset, type ReplayDataset } from "./dataset";
import { ReplaySessionEngine } from "./engine";
import { createSessionMeta, type SessionPurpose, type SessionSnapshot } from "./model";
import { persistSnapshot } from "./persistence";
import { resumeSession } from "./resume";
import { validateDataset } from "./validation";
import { ReplaySessionController } from "./controller";

export interface SessionRowInput {
  id: string;
  user_id: string;
  title: string;
  symbol: string;
  timeframe: string;
  market?: string | null;
  purpose?: SessionPurpose;
  starting_balance?: number | null;
  source_trade_id?: string | null;
  source_journal_id?: string | null;
}

export interface BootstrapInput {
  row: SessionRowInput;
  candles: Candle[];
  provider: string;
  timezone?: string | null;
  isSynthetic?: boolean;
  /** Freshest snapshot from `loadSnapshot`, or null for a new session. */
  snapshot?: SessionSnapshot | null;
  /** Only demo sessions may replay fabricated candles. */
  allowSynthetic?: boolean;
  /** Injected in tests; defaults to the durable server + local writer. */
  writer?: (snapshot: SessionSnapshot) => Promise<void>;
}

export type BootstrapResult =
  | {
      ok: true;
      controller: ReplaySessionController;
      stores: OrderStores;
      dataset: ReplayDataset;
      resumed: boolean;
      resumedAtCursor: number;
      warnings: string[];
      /** Set when a saved snapshot existed but could not be trusted. */
      discardedSnapshot: { reason: "version" | "dataset" | "corrupt"; message: string } | null;
    }
  | { ok: false; reason: "dataset"; errors: string[]; warnings: string[] };

/** Fresh, isolated execution stores for one replay session. */
export function createSessionStores(): OrderStores {
  return { drawings: new DrawingStore(), orders: new PositionOrderStore(), trades: new ClosedTradeStore() };
}

export function bootstrapSession(input: BootstrapInput): BootstrapResult {
  const allowSynthetic = input.allowSynthetic ?? false;

  if (input.candles.length < 2) {
    return {
      ok: false,
      reason: "dataset",
      errors: ["Dataset needs at least two bars to replay."],
      warnings: [],
    };
  }

  const dataset = buildDataset({
    provider: input.provider,
    symbol: input.row.symbol,
    timeframe: (input.row.timeframe || "5m") as Timeframe,
    timezone: input.timezone ?? "UTC",
    candles: input.candles,
    isSynthetic: input.isSynthetic ?? false,
  });

  const preflight = validateDataset(dataset.identity, { allowSynthetic });
  if (!preflight.ok) {
    return { ok: false, reason: "dataset", errors: preflight.errors, warnings: preflight.warnings };
  }

  const stores = createSessionStores();
  const writer = input.writer ?? persistSnapshot;
  const market = input.row.market ?? null;

  const meta = createSessionMeta({
    id: input.row.id,
    userId: input.row.user_id,
    title: input.row.title,
    dataset: dataset.identity,
    purpose: input.row.purpose ?? "practice",
    startingBalance: input.row.starting_balance ?? 10_000,
    sourceTradeId: input.row.source_trade_id ?? null,
    sourceJournalId: input.row.source_journal_id ?? null,
  });

  let discardedSnapshot: { reason: "version" | "dataset" | "corrupt"; message: string } | null = null;

  if (input.snapshot) {
    const resumed = resumeSession({ snapshot: input.snapshot, dataset, stores, market, writer });
    if (resumed.ok) {
      return {
        ok: true,
        controller: new ReplaySessionController(resumed.engine),
        stores,
        dataset,
        resumed: true,
        resumedAtCursor: resumed.resumedAtCursor,
        warnings: preflight.warnings,
        discardedSnapshot: null,
      };
    }
    discardedSnapshot = { reason: resumed.reason, message: resumed.message };
  }

  const engine = new ReplaySessionEngine({ meta, dataset, stores, market, writer });
  return {
    ok: true,
    controller: new ReplaySessionController(engine),
    stores,
    dataset,
    resumed: false,
    resumedAtCursor: 0,
    warnings: preflight.warnings,
    discardedSnapshot,
  };
}
