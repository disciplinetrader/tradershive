import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/battle-arena")({
  head: () => ({ meta: [{ title: "Battle Arena — TradersHIVE Arena" }] }),
  component: () => <ComingSoon title="Battle Arena" description="Head-to-head trading duels, weekly tournaments and live prize pools. Launching in the next season." />,
});
