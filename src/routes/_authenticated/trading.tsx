import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trading")({
  head: () => ({
    meta: [
      { title: "Trading Workspace — TradersHIVE Arena" },
      { name: "description", content: "Single professional workspace for charting, paper trading, watchlists, journal and AI insights — powered by real-time Binance market data via the Market Data Engine." },
    ],
  }),
  component: () => (
    <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-none flex-col rounded-xl border border-border/60 bg-card/20 backdrop-blur">
      <Outlet />
    </div>
  ),
});
