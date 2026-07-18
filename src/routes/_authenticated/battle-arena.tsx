import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/battle-arena")({
  head: () => ({
    meta: [
      { title: "Battle Arena — TradersHIVE Arena" },
      { name: "description", content: "Head-to-head paper trading battles with real-time market data, live leaderboards and XP rewards." },
    ],
  }),
  component: () => <Outlet />,
});
