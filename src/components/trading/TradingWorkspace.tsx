import { PaperTradingProvider } from "@/components/paper-trading/context";
import { AccountSwitcher } from "@/components/paper-trading/AccountSwitcher";
import { ChartWorkspace } from "@/components/chart/ChartWorkspace";

/**
 * Trading Workspace — the single professional screen that merges the
 * advanced Chart, Paper Trading, Watchlists, Journal, AI Insights and
 * Market Data status. All market data flows through the Market Data
 * Engine (crypto → Binance REST + WS).
 */
export function TradingWorkspace({ fullscreen }: { fullscreen?: boolean }) {
  return (
    <PaperTradingProvider>
      <div className="flex h-full min-h-0 flex-col">
        {!fullscreen ? (
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/30 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Trading Workspace
            </div>
            <div className="min-w-0"><AccountSwitcher /></div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <ChartWorkspace fullscreen={fullscreen} />
        </div>
      </div>
    </PaperTradingProvider>
  );
}
