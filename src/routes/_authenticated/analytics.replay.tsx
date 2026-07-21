import { createFileRoute } from "@tanstack/react-router";
import { ReplayAnalyticsView } from "@/components/analytics/ReplayAnalyticsView";

export const Route = createFileRoute("/_authenticated/analytics/replay")({
  component: () => <ReplayAnalyticsView />,
});
