/**
 * Analytics data sources.
 *
 * Reads canonical records — nothing here derives a metric. Two reads:
 *   · `chart_closed_trades` — Position Tool ClosedTrades (all symbols)
 *   · `journal_entries`     — metadata that ENRICHES a trade, never alters it
 *
 * Legacy paper/journal rows arrive separately through the existing
 * `getAnalyticsDataset` server function and are normalized alongside these.
 */

import { supabase } from "@/integrations/supabase/client";
import { closedTradeFromRow } from "@/lib/chart/orders/trade-sync";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { JournalEntry } from "@/lib/journal/api";

export interface CanonicalSources {
  closedTrades: ClosedTrade[];
  journalEntries: JournalEntry[];
}

export const analyticsSourceKey = ["analytics", "canonical-sources"] as const;

export async function fetchCanonicalSources(): Promise<CanonicalSources> {
  const [tradesRes, journalRes] = await Promise.all([
    supabase
      .from("chart_closed_trades")
      .select("*")
      .order("closed_at", { ascending: false })
      .limit(5000),
    supabase
      .from("journal_entries")
      .select("*")
      .is("deleted_at", null)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .limit(5000),
  ]);

  return {
    closedTrades: ((tradesRes.data ?? []) as Record<string, unknown>[]).map(closedTradeFromRow),
    journalEntries: (journalRes.data ?? []) as JournalEntry[],
  };
}
