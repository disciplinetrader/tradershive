import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { listMyReviews } from "@/lib/community-reviews.functions";

export const Route = createFileRoute("/_authenticated/community/reviews")({
  head: () => ({
    meta: [
      { title: "Trade Reviews — Community" },
      { name: "description", content: "Structured feedback on trades, journals, replays and ideas — given and received." },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const fn = useServerFn(listMyReviews);
  const [box, setBox] = useState<"received" | "given">("received");
  const q = useQuery({ queryKey: ["community", "reviews", box], queryFn: () => fn({ data: { box } }) });

  return (
    <div className="space-y-4">
      <PageHeader title="Trade Reviews" description="Feedback across your trades, journals, replays and ideas." />
      <div className="inline-flex overflow-hidden rounded-lg border border-border/60 bg-card/60">
        {(["received", "given"] as const).map((s) => (
          <button key={s} onClick={() => setBox(s)}
            className={`px-3 py-1.5 text-xs capitalize ${box === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      {q.isLoading ? <Skeleton className="h-40" /> : (q.data?.reviews ?? []).length === 0 ? (
        <EmptyState icon={Star} title="No reviews yet" description={box === "received" ? "When mentors and members review you, they'll appear here." : "Review other traders to help them grow and earn reputation."} />
      ) : (
        <div className="space-y-3">
          {q.data!.reviews.map((r: any) => (
            <GlassCard key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={r.other?.avatar_url ?? undefined} />
                  <AvatarFallback>{(r.other?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{r.other?.display_name ?? r.other?.username}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{r.target_type}</Badge>
                    {r.is_mentor_review ? <Badge className="text-[10px]">Mentor</Badge> : null}
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                    {r.overall_score != null ? (
                      <span className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-primary font-semibold">
                        {Number(r.overall_score).toFixed(1)}/10
                      </span>
                    ) : null}
                  </div>
                  {Object.keys(r.scores ?? {}).length ? (
                    <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-6 text-[11px]">
                      {Object.entries(r.scores as Record<string, number>).map(([k, v]) => (
                        <div key={k} className="rounded-md bg-muted/40 px-2 py-1 text-center">
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                          <div className="font-semibold">{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {r.suggestions ? <div className="mt-2 text-sm">{r.suggestions}</div> : null}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
