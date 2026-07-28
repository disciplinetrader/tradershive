import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { MessageSquarePlus } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/admin/StatusPill";
import { listMyFeedback } from "@/lib/feedback.functions";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "My feedback — TradersHIVE" },
      { name: "description", content: "Track your bug reports and feature requests." },
      { property: "og:title", content: "My feedback — TradersHIVE" },
      { property: "og:description", content: "Track your bug reports and feature requests." },
    ],
  }),
  component: MyFeedbackPage,
});

function MyFeedbackPage() {
  const listFn = useServerFn(listMyFeedback);
  const { open } = useFeedback();
  const q = useQuery({ queryKey: ["my-feedback"], queryFn: () => listFn() });
  const bugs = (q.data as any)?.bugs ?? [];
  const features = (q.data as any)?.features ?? [];

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My feedback</h1>
          <p className="text-sm text-muted-foreground">
            Bug reports, feature requests, and messages you've sent us.
          </p>
        </div>
        <Button onClick={() => open()}>
          <MessageSquarePlus className="h-4 w-4 mr-1" /> Send feedback
        </Button>
      </div>

      <GlassCard className="p-4">
        <h2 className="text-sm font-medium mb-3">Bug reports & messages ({bugs.length})</h2>
        {bugs.length === 0 ? (
          <EmptyState label="You haven't sent any bug reports yet." />
        ) : (
          <ul className="space-y-2">
            {bugs.map((b: any) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground">{b.reference_code}</code>
                    <Badge variant="secondary" className="text-[10px] uppercase">{b.type}</Badge>
                    {b.category && <Badge variant="outline" className="text-[10px]">{b.category}</Badge>}
                  </div>
                  <p className="text-sm truncate">{b.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                  </p>
                </div>
                <StatusPill value={b.status} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="text-sm font-medium mb-3">Feature requests ({features.length})</h2>
        {features.length === 0 ? (
          <EmptyState label="You haven't sent any feature requests yet." />
        ) : (
          <ul className="space-y-2">
            {features.map((f: any) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground">{f.reference_code}</code>
                    {f.user_priority && <Badge variant="outline" className="text-[10px]">{f.user_priority}</Badge>}
                  </div>
                  <p className="text-sm truncate">{f.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })} · {f.vote_count} votes
                  </p>
                </div>
                <StatusPill value={f.status} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{label}</p>;
}
