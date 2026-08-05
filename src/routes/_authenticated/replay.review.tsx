import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ReviewView } from "@/components/replay/review/ReviewView";

export const Route = createFileRoute("/_authenticated/replay/review")({
  validateSearch: (s) => z.object({ id: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Replay Review — TradersHIVE" },
      { name: "description", content: "Post-session replay review: performance summary, trade tape, original-versus-replay delta, coach notes and homework." },
      { property: "og:title", content: "Replay Review — TradersHIVE" },
      { property: "og:description", content: "Review a finished replay session and turn it into measurable improvement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Session not found.</div>,
});

function ReviewPage() {
  const { id } = useSearch({ from: "/_authenticated/replay/review" });
  if (!id) {
    return (
      <div className="m-6 space-y-3 rounded-md border border-border/60 bg-card/40 p-8 text-center">
        <div className="font-medium">No session selected</div>
        <p className="text-sm text-muted-foreground">Pick a finished session from your replay history to review it.</p>
        <Button asChild><Link to="/replay/history" search={{}}>Open history</Link></Button>
      </div>
    );
  }
  return <ReviewView sessionId={id} />;
}
