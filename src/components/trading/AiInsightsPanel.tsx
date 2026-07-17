import { Link } from "@tanstack/react-router";
import { BrainCircuit, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveQuote } from "@/lib/market-data/hooks";
import { findSymbol } from "@/lib/paper-trading/symbols";

/**
 * Light-weight AI Insights strip. Deep analysis and streaming chat live in
 * the AI Coach module; this panel shows a quick contextual snapshot and
 * routes the user to the coach with the active symbol pre-loaded.
 */
export function AiInsightsPanel({ symbol }: { symbol?: string }) {
  const meta = symbol ? findSymbol(symbol) : null;
  const quote = useLiveQuote(symbol ?? "", meta?.market);
  const price = quote?.last ?? quote?.bid;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">AI Trading Coach</div>
        <div className="ml-auto flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Link to="/ai/chat" search={{ symbol } as any}>
              <MessageSquare className="h-3 w-3" /> Ask Coach
            </Link>
          </Button>
          <Button asChild size="sm" className="h-7 gap-1 text-xs">
            <Link to="/ai/trade-review">
              <Sparkles className="h-3 w-3" /> Review last trade
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-border/50 bg-card/40 p-3 text-xs md:grid-cols-3">
        <div>
          <div className="text-muted-foreground">Symbol</div>
          <div className="font-semibold">{symbol ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Live price</div>
          <div className="font-semibold tabular-nums">{price ? price.toFixed(meta?.decimals ?? 4) : "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Data source</div>
          <div className="font-semibold">{meta?.market === "crypto" ? "Binance (WS)" : "Market Data Engine"}</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The AI Coach reads your live paper positions, journal entries, and market context
        to help you plan, size and review every trade. Open the coach for deep analysis.
      </p>
    </div>
  );
}
