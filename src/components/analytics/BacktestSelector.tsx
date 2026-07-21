import { useAnalytics } from "./AnalyticsProvider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, Database, FlaskConical, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lets the trader swap the entire analytics dataset between live paper-trade
 * history and any saved Replay Studio backtest session.
 */
export function BacktestSelector() {
  const { source, backtests, loadingBacktests, backtestId, setBacktest, activeBacktestLabel } = useAnalytics();
  const label = source === "backtest" ? activeBacktestLabel ?? "Backtest" : "Live trades";
  const Icon = source === "backtest" ? FlaskConical : Database;

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-2 rounded-xl border-border/60 bg-background/60 text-xs font-medium",
              source === "backtest" && "border-primary/50 text-primary",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-1.5">
          <button
            onClick={() => setBacktest(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-muted",
              !backtestId && "bg-primary/10 text-primary",
            )}
          >
            <Database className="h-3.5 w-3.5" /> Live paper trades
          </button>
          <div className="my-1 border-t border-border/60" />
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saved backtests
          </div>
          {loadingBacktests ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : backtests.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              No saved backtests yet. Finish a Replay session to reuse it here.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {backtests.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBacktest(b.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted",
                    backtestId === b.id && "bg-primary/10",
                  )}
                >
                  <FlaskConical className="mt-0.5 h-3.5 w-3.5 text-primary" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{b.title || b.symbol}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {b.symbol} · {b.timeframe} · {b.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {source === "backtest" ? (
        <Button variant="ghost" size="sm" className="h-9 gap-1 rounded-xl text-xs" onClick={() => setBacktest(null)}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
