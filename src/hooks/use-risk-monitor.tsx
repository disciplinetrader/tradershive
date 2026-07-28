/**
 * Client-side risk monitor for the Trading Workspace.
 *
 * Broker semantics implemented here:
 *   • Margin call — surfaces a persistent banner when margin level
 *     drops to `margin_call_level` %. No positions are closed.
 *   • Stop-out — when margin level drops to `stop_out_level` %, close
 *     open positions worst-loss-first, one at a time, re-checking
 *     margin level after each close, until margin recovers or none
 *     remain. System-initiated closes are tagged `stop_out`.
 *   • Negative balance protection — if equity would go below zero
 *     before stop-out can drain the losers, close everything at once.
 *     The server floors the resulting balance at $0 when NBP is on.
 *
 * The engine runs on every quote tick + 3s refetch. A ref guard
 * prevents overlapping stop-out passes.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { closeTrade, listTrades } from "@/lib/paper-trading.functions";
import { useLiveQuotes } from "@/lib/paper-trading/mock-prices";
import {
  accountRiskLimits,
  computeAccountRisk,
  sortForStopOut,
  type OpenTradeInput,
} from "@/lib/paper-trading/risk";

type Account = {
  id: string; balance: number | string; leverage: number;
  margin_call_level?: number | string | null;
  stop_out_level?: number | string | null;
  negative_balance_protection?: boolean | null;
};

export function useRiskMonitor(account: Account | null) {
  const qc = useQueryClient();
  const fetchTrades = useServerFn(listTrades);
  const closeFn = useServerFn(closeTrade);
  const running = useRef(false);
  const lastToast = useRef<number>(0);

  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", account?.id, "open"],
    queryFn: () => fetchTrades({ data: { account_id: account!.id, status: "open" } }) as unknown as Promise<OpenTradeInput[]>,
    enabled: !!account?.id,
    refetchInterval: 3000,
  });

  const quotes = useLiveQuotes(openTrades?.map((t) => t.symbol));

  useEffect(() => {
    if (!account || running.current) return;
    if (!openTrades?.length) return;

    const limits = accountRiskLimits(account);
    const snapshot = computeAccountRisk(account, openTrades, (s) => quotes[s]?.price ?? null, limits);
    if (snapshot.marginLevel == null) return;

    // Rate-limit user-visible toasts to at most once every 15s to avoid spam.
    const now = Date.now();
    if (snapshot.status === "margin_call" && now - lastToast.current > 15_000) {
      lastToast.current = now;
      toast.warning(`Margin call: ${snapshot.marginLevel.toFixed(1)}% ≤ ${limits.marginCallLevel}%`);
    }

    if (snapshot.status !== "stop_out") return;

    running.current = true;
    (async () => {
      try {
        // Negative balance protection short-circuit — equity already at 0.
        if (limits.negativeBalanceProtection && snapshot.equity <= 0) {
          toast.error("Negative balance protection — closing all positions");
          for (const pos of snapshot.positions) {
            try {
              await closeFn({ data: { id: pos.trade.id, exit_price: pos.currentPrice, close_reason: "stop_out" } });
            } catch (e) { console.error("[risk] emergency close failed", e); }
          }
          qc.invalidateQueries({ queryKey: ["paper"] });
          return;
        }

        // Stop-out cascade: close worst loser, re-fetch state, repeat.
        toast.error(`Stop-out at ${snapshot.marginLevel!.toFixed(1)}% — closing losing positions`);
        let currentTrades: OpenTradeInput[] = [...openTrades];
        while (true) {
          const risk = computeAccountRisk(account, currentTrades, (s) => quotes[s]?.price ?? null, limits);
          if (risk.marginLevel == null || risk.marginLevel > limits.stopOutLevel) break;
          const worst = sortForStopOut(risk.positions)[0];
          if (!worst) break;
          try {
            await closeFn({ data: { id: worst.trade.id, exit_price: worst.currentPrice, close_reason: "stop_out" } });
          } catch (e) {
            console.error("[risk] stop-out close failed", e);
            break;
          }
          currentTrades = currentTrades.filter((t) => t.id !== worst.trade.id);
        }
        qc.invalidateQueries({ queryKey: ["paper"] });
      } finally {
        running.current = false;
      }
    })();
  }, [account, openTrades, quotes, closeFn, qc]);
}
