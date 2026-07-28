import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listChallenges, joinChallenge, leaveChallenge } from "@/lib/community-challenges.functions";

export const Route = createFileRoute("/_authenticated/community/challenges")({
  head: () => ({
    meta: [
      { title: "Community Challenges" },
      { name: "description", content: "Weekly and monthly trading challenges: best risk, profit factor, replay hours, journaling and more." },
    ],
  }),
  component: ChallengesPage,
});

const SCOPES = ["active", "upcoming", "ended", "all"] as const;

function ChallengesPage() {
  const fn = useServerFn(listChallenges);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("active");
  const q = useQuery({ queryKey: ["community", "challenges", scope], queryFn: () => fn({ data: { scope } }) });

  return (
    <div className="space-y-4">
      <PageHeader title="Community Challenges" description="Compete on real platform metrics — rankings recompute automatically." />
      <div className="inline-flex overflow-hidden rounded-lg border border-border/60 bg-card/60">
        {SCOPES.map((s) => (
          <button key={s} onClick={() => setScope(s)}
            className={`px-3 py-1.5 text-xs capitalize ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      {q.isLoading ? <Skeleton className="h-40" /> : (q.data?.challenges ?? []).length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No community challenges right now"
          description="Community challenges launch weekly. Meanwhile, jump into a live Battle or Championship."
          action={{ label: "Battle Arena", href: "/battle-arena" }}
          secondaryAction={{ label: "Championships", href: "/championship" }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data!.challenges.map((c: any) => <ChallengeCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

function ChallengeCard({ c }: { c: any }) {
  const qc = useQueryClient();
  const joinFn = useServerFn(joinChallenge);
  const leaveFn = useServerFn(leaveChallenge);
  const joined = !!c.myEntry;
  const mut = useMutation({
    mutationFn: () => (joined ? leaveFn : joinFn)({ data: { challenge_id: c.id } }),
    onSuccess: () => { toast.success(joined ? "Left" : "Joined"); qc.invalidateQueries({ queryKey: ["community", "challenges"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{c.title}</div>
          <Badge variant="outline" className="mt-1 text-[10px] capitalize">{c.kind.replace(/_/g, " ")}</Badge>
        </div>
        <Badge className={c.status === "active" ? "bg-success/15 text-success" : ""} variant="outline">{c.status}</Badge>
      </div>
      {c.description ? <div className="mt-2 line-clamp-3 text-xs text-muted-foreground">{c.description}</div> : null}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <Stat label="Joined" value={c.participant_count ?? 0} />
        <Stat label="Ends" value={c.end_at ? formatDistanceToNow(new Date(c.end_at)) : "—"} />
        <Stat label="Your rank" value={joined ? (c.myEntry.rank ? `#${c.myEntry.rank}` : "—") : "—"} />
      </div>
      <Button size="sm" className="mt-3 w-full" variant={joined ? "outline" : "default"} disabled={mut.isPending}
        onClick={() => mut.mutate()}>
        {joined ? "Leave challenge" : "Join challenge"}
      </Button>
    </GlassCard>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
