import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/battle-arena")({
  head: () => ({
    meta: [
      { title: "HIVE Arena — TradersHIVE" },
      { name: "description", content: "Competitive paper trading matches with real-time market data, live standings and HIVE Rating rewards." },
    ],
  }),
  component: () => (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
      <Outlet />
    </div>
  ),
});
