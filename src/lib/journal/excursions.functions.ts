/**
 * Excursion computation — server side, because it reads the historical tape.
 *
 * The refusal to use synthetic candles lives here, at the point the data is
 * requested (`allowSynthetic: false`) AND again after it returns
 * (`source.isSynthetic`). Two checks rather than one because the first is a
 * request and the second is a fact, and a fabricated MAE is the single most
 * convincing wrong number this product could display.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/server-errors";
import { findSymbol } from "@/lib/paper-trading/symbols";
import {
  HistoricalDataUnavailableError,
  resolveHistoricalRange,
} from "@/lib/market-data/historical/service.server";
import { capPath, computeExcursions, timeframeFor } from "@/lib/journal/excursions";
import type { Json } from "@/integrations/supabase/types";

export type ExcursionOutcome =
  | { ok: true; entryId: string; maeR: number | null; mfeR: number | null; points: number; timeframe: string; source: string }
  | { ok: false; entryId: string; reason: string };

export const computeEntryExcursion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ExcursionOutcome> => {
    const { supabase, userId } = context;

    const entry = unwrap(
      await supabase
        .from("journal_entries")
        .select("id, symbol, market, direction, entry_price, stop_loss, lot_size, opened_at, closed_at")
        .eq("id", data.entryId)
        .eq("user_id", userId)
        .maybeSingle(),
      "computeEntryExcursion/journal_entries",
    );
    if (!entry) return { ok: false, entryId: data.entryId, reason: "Entry not found" };

    // Every one of these is required to place the trade on a tape at all.
    if (!entry.symbol) return { ok: false, entryId: entry.id, reason: "No symbol on this entry" };
    if (!entry.opened_at || !entry.closed_at) {
      return { ok: false, entryId: entry.id, reason: "Entry has no open/close time" };
    }
    if (entry.entry_price == null || entry.lot_size == null) {
      return { ok: false, entryId: entry.id, reason: "Entry has no fill price or size" };
    }
    const sym = findSymbol(entry.symbol);
    if (!sym) return { ok: false, entryId: entry.id, reason: `Unknown symbol ${entry.symbol}` };

    const from = Date.parse(entry.opened_at);
    const to = Date.parse(entry.closed_at);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return { ok: false, entryId: entry.id, reason: "Entry has an unusable time range" };
    }

    const timeframe = timeframeFor(to - from);

    let resolved;
    try {
      resolved = await resolveHistoricalRange(supabase, {
        symbol: entry.symbol,
        timeframe,
        from,
        to,
        market: entry.market ?? undefined,
        allowBackfill: true,
        // Rule 1: never fabricate a tape to measure a real trade against.
        allowSynthetic: false,
      });
    } catch (e) {
      if (e instanceof HistoricalDataUnavailableError) {
        return { ok: false, entryId: entry.id, reason: `No historical data for ${entry.symbol} at ${timeframe}` };
      }
      throw e;
    }

    // Belt and braces: the request said no, this asserts the answer agrees.
    if (resolved.source.isSynthetic || resolved.source.kind === "synthetic") {
      return { ok: false, entryId: entry.id, reason: "Refused: only synthetic data available" };
    }
    if (resolved.candles.length === 0) {
      return { ok: false, entryId: entry.id, reason: "No candles in the trade's window" };
    }

    const result = computeExcursions({
      sym,
      direction: entry.direction === "short" ? "short" : "long",
      entryPrice: Number(entry.entry_price),
      stopLoss: entry.stop_loss == null ? null : Number(entry.stop_loss),
      lotSize: Number(entry.lot_size),
      candles: resolved.candles,
    });
    if (!result) return { ok: false, entryId: entry.id, reason: "Could not compute from this window" };

    // Built as plain Json rather than cast: the stored shape is part of the
    // contract with the panel that reads it back, and a cast would let it drift.
    const pathJson: Json = capPath(result.path).map((p) => ({ t: p.t, pnl: p.pnl }));

    const { error } = await supabase
      .from("journal_entries")
      .update({
        mae_price: result.maePrice,
        mfe_price: result.mfePrice,
        mae_r: result.maeR,
        mfe_r: result.mfeR,
        excursion_path: pathJson,
        excursion_timeframe: timeframe,
        excursion_source: resolved.source.kind,
        excursion_computed_at: new Date().toISOString(),
      })
      .eq("id", entry.id)
      .eq("user_id", userId);
    if (error) throw error;

    return {
      ok: true,
      entryId: entry.id,
      maeR: result.maeR,
      mfeR: result.mfeR,
      points: result.path.length,
      timeframe,
      source: resolved.source.kind,
    };
  });
