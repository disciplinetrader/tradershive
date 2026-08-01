import { createFileRoute } from "@tanstack/react-router";
import { ImprovementDashboard } from "@/components/replay/review/ImprovementDashboard";

export const Route = createFileRoute("/_authenticated/replay/improvement")({
  head: () => ({
    meta: [
      { title: "Replay Improvement — TradersHIVE" },
      { name: "description", content: "Track how replay practice changes your discipline, risk control and execution over time." },
      { property: "og:title", content: "Replay Improvement — TradersHIVE" },
      { property: "og:description", content: "Improvement intelligence from every scored replay session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImprovementDashboard,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nothing here.</div>,
});
