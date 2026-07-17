import { createFileRoute } from "@tanstack/react-router";
import { Watchlist } from "@/components/chart/Watchlist";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/charts/watchlists")({
  component: WatchlistsPage,
});

function WatchlistsPage() {
  const [sym, setSym] = useState("BTC/USDT");
  return (
    <div className="grid h-full grid-cols-[320px_1fr]">
      <div className="border-r border-border/60"><Watchlist symbol={sym} onPick={(s) => setSym(s.symbol)} /></div>
      <div className="p-6">
        <h1 className="text-xl font-semibold">Watchlists</h1>
        <p className="text-sm text-muted-foreground">
          Search, favorite and organize symbols. Every price streams from the Market Data Engine — no direct provider calls.
        </p>
        <div className="mt-6 rounded-xl border border-border/60 bg-card/40 p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Selected</div>
          <div className="mt-1 text-2xl font-semibold">{sym}</div>
        </div>
      </div>
    </div>
  );
}
