/**
 * Live SL / TP monitor for the paper-trading engine.
 *
 * Root cause of the "open trade past its stop" bug:
 *   The tick engine in `src/lib/trading-engine/engine.ts` correctly closes
 *   positions on SL/TP hits — but the *live paper-trading* path (which
 *   persists to Supabase via `paper_trades`) never ran that engine.
 *   `useRiskMonitor` only enforced margin-call / stop-out. There was no
 *   client-side (or server-side) watcher that closed a live trade the
 *   moment quotes crossed its configured stop_loss / take_profit, so a
 *   position could sit open indefinitely even after price moved through
 *   the SL — exactly the reported symptom.
 *
 * Fix: this hook subscribes to `useLiveQuotes()` (same feed the risk
 * monitor, watchlist, and chart use) and evaluates every open trade on
 * every tick. Order semantics match a real broker:
 *
 *   LONG  → SL fires when price <= stop_loss
 *           TP fires when price >= take_profit
 *   SHORT → SL fires when price >= stop_loss
 *           TP fires when price <= take_profit
 *
 * Execution is immediate — no wait for candle close, no batching.
 * SL is checked *before* TP so a bar that gapped through both is
 * conservatively resolved as a stop (matches MT4/MT5 behaviour). Each
 * trade is guarded by a ref-set so we never fire a duplicate close if
 * the query cache lags one refetch behind the mutation.
 *
 * Runs BEFORE `useRiskMonitor` — SL/TP must be evaluated before
 * margin/UI updates, per the audit requirement.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { closeTrade, listTrades } from "@/lib/paper-trading.functions";
import { useLiveQuotes } from "@/lib/paper-trading/live-quotes";
import { evaluateSlTpOnTick } from "@/lib/paper-trading/sl-tp";

type MonitoredTrade = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entry_price: number | string;
  stop_loss: number | string | null;
  take_profit: number | string | null;
  status: string;
};

type Account = { id: string } | null;

export function useSlTpMonitor(account: Account) {
  const qc = useQueryClient();
  const fetchTrades = useServerFn(listTrades);
  const closeFn = useServerFn(closeTrade);
  const firing = useRef<Set<string>>(new Set());

  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", account?.id, "open"],
    queryFn: () =>
      fetchTrades({ data: { account_id: account!.id, status: "open" } }) as unknown as Promise<MonitoredTrade[]>,
    enabled: !!account?.id,
    refetchInterval: 3000,
  });

  const quotes = useLiveQuotes(openTrades?.map((t) => t.symbol));

  useEffect(() => {
    if (!account || !openTrades?.length) return;

    for (const t of openTrades) {
      if (t.status !== "open") continue;
      if (firing.current.has(t.id)) continue;

      const price = quotes[t.symbol]?.price;
      if (!(price != null && price > 0)) continue;

      const sl = t.stop_loss != null ? Number(t.stop_loss) : null;
      const tp = t.take_profit != null ? Number(t.take_profit) : null;
      const hit = evaluateSlTpOnTick(t.direction, price, sl, tp);
      if (!hit) continue;


      firing.current.add(t.id);
      const label = hit.reason === "stop_loss" ? "Stop Loss" : "Take Profit";
      (async () => {
        try {
          await closeFn({ data: { id: t.id, exit_price: hit!.price, close_reason: hit!.reason } });
          toast[hit!.reason === "stop_loss" ? "error" : "success"](
            `${label} hit on ${t.symbol} @ ${hit!.price}`,
          );
          qc.invalidateQueries({ queryKey: ["paper"] });
        } catch (e) {
          console.error("[sl-tp] close failed", e);
          // Allow retry on the next tick if the server refused.
          firing.current.delete(t.id);
        }
      })();
    }
  }, [account, openTrades, quotes, closeFn, qc]);
}
