import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/education")({
  head: () => ({ meta: [{ title: "Education — TradersHIVE Arena" }] }),
  component: () => <ComingSoon title="Education" description="Structured trading courses, guided drills and mentor sessions curated for every skill tier." />,
});
