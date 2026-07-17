import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — TradersHIVE Arena" }] }),
  component: () => <ComingSoon title="Marketplace" description="Publish and discover strategies, playbooks, indicators and replay sessions from top traders." />,
});
