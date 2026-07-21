import { createFileRoute } from "@tanstack/react-router";
import { ChampionshipAnalyticsView } from "@/components/analytics/ChampionshipAnalyticsView";

export const Route = createFileRoute("/_authenticated/analytics/championships")({
  component: () => <ChampionshipAnalyticsView />,
});
