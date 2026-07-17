import { createFileRoute } from "@tanstack/react-router";
import { TradingWorkspace } from "@/components/trading/TradingWorkspace";

export const Route = createFileRoute("/_authenticated/trading/fullscreen")({
  component: () => <TradingWorkspace fullscreen />,
});
