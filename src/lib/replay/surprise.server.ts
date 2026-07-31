/**
 * Surprise Session picker (server-only).
 *
 * A Surprise Session must be a REAL session: a registered historical symbol,
 * on a timeframe and date window that we actually have stored candles for.
 * Nothing here fabricates data — if no registered symbol has usable coverage
 * the caller renders the same actionable "no market data" state that normal
 * Replay uses.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { probeCoverage } from "@/lib/market-data/historical/service.server";
import type { CoverageTimeframe } from "@/lib/market-data/historical/coverage";

type Db = SupabaseClient<any, any, any>;

const CANDIDATE_TFS: CoverageTimeframe[] = ["5m", "15m", "1H"];
const DAY_MS = 86_400_000;

export type SurprisePick = {
  symbol: string;
  market: string;
  timeframe: CoverageTimeframe;
  from: number;
  to: number;
  replayDate: string;
  providerCode: string | null;
};

export type SurpriseFailure = {
  message: string;
  remedy: string;
  registered: boolean;
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function pickSurpriseSession(
  db: Db,
): Promise<{ pick: SurprisePick } | { failure: SurpriseFailure }> {
  const { data: symbols } = await db
    .from("historical_symbols")
    .select("symbol, market, source_code, timeframes, earliest_available, latest_imported")
    .eq("is_enabled", true)
    .limit(200);

  const registered = (symbols ?? []).filter(
    (s: any) => s.earliest_available && s.latest_imported,
  );

  if (!registered.length) {
    return {
      failure: {
        message: "No historical symbol has imported market data yet.",
        remedy:
          "Import at least one symbol in Admin → Market Data (for example EURUSD 5m for a recent month), then roll again.",
        registered: (symbols ?? []).length > 0,
      },
    };
  }

  // Try a bounded number of real candidates so the roll stays snappy.
  for (const row of shuffle(registered).slice(0, 8)) {
    const available = (Array.isArray(row.timeframes) ? row.timeframes : []) as string[];
    const tfs = CANDIDATE_TFS.filter((tf) => !available.length || available.includes(tf));
    const earliest = +new Date(row.earliest_available);
    const latest = +new Date(row.latest_imported);
    if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest - earliest < DAY_MS) continue;

    for (const timeframe of shuffle(tfs)) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const span = latest - earliest - DAY_MS;
        const start = earliest + Math.floor(Math.random() * Math.max(1, span));
        const day = new Date(start);
        day.setUTCHours(0, 0, 0, 0);
        const from = day.getTime();
        const to = from + DAY_MS;
        if (to > latest) continue;

        const probe = await probeCoverage(db, {
          symbol: row.symbol,
          timeframe,
          from,
          to,
          market: row.market,
        });
        if (probe.coverage.ok && probe.coverage.actual > 0) {
          return {
            pick: {
              symbol: row.symbol,
              market: row.market ?? "forex",
              timeframe,
              from,
              to,
              replayDate: new Date(from).toISOString().slice(0, 10),
              providerCode: probe.sourceCode ?? row.source_code ?? null,
            },
          };
        }
      }
    }
  }

  return {
    failure: {
      message: "No registered symbol has a fully covered day of stored candles right now.",
      remedy:
        "Run a historical import for one of your registered symbols (Admin → Market Data), then roll a Surprise Session again.",
      registered: true,
    },
  };
}
