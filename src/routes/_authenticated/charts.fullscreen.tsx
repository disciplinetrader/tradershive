import { createFileRoute } from "@tanstack/react-router";
import { ChartWorkspace } from "@/components/chart/ChartWorkspace";

export const Route = createFileRoute("/_authenticated/charts/fullscreen")({
  component: () => <ChartWorkspace fullscreen />,
});
