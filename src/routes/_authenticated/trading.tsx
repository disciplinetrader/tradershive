import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trading")({
  head: () => ({
    meta: [
      { title: "Trading Workspace — TradersHIVE Arena" },
      { name: "description", content: "Single professional workspace for charting, paper trading, watchlists, journal and AI insights — powered by real-time Binance market data via the Market Data Engine." },
    ],
  }),
  component: () => (
    <div className="flex min-h-[calc(100dvh-0px)] w-full flex-col">
      <Outlet />
    </div>
  ),
});
