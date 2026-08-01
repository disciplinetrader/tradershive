/**
 * Practice launcher (Phase 9).
 *
 * Thin adapter: it lists assignments and recommendations from server
 * functions and links into the canonical Replay Studio. It computes no
 * scores, no P/L and no challenge status.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dumbbell, Play, Shuffle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createPracticeAssignment,
  getPracticeRecommendations,
  listPracticeAssignments,
} from "@/lib/practice.functions";
import { DRILLS } from "@/lib/practice/drills";
import { PRACTICE_TYPE_LABEL, type PracticeType } from "@/lib/practice/types";

export const Route = createFileRoute("/_authenticated/practice/")({
  head: () => ({
    meta: [
      { title: "Practice launcher — TradersHIVE" },
      {
        name: "description",
        content: "Pick a drill, run a surprise session or free practice — every session uses the canonical replay engine.",
      },
      { property: "og:title", content: "Practice launcher — TradersHIVE" },
      { property: "og:description", content: "Structured trading practice with objective drill scoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PracticeLauncher,
});

function statusTone(status: string) {
  if (status === "completed") return "default" as const;
  if (status === "failed") return "destructive" as const;
  return "secondary" as const;
}

function PracticeLauncher() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listPracticeAssignments);
  const recs = useServerFn(getPracticeRecommendations);
  const create = useServerFn(createPracticeAssignment);

  const assignments = useQuery({
    queryKey: ["practice", "assignments"],
    queryFn: () => list({ data: { limit: 50 } }),
  });
  const recommendations = useQuery({
    queryKey: ["practice", "recommendations"],
    queryFn: () => recs({}),
  });

  const startPractice = useMutation({
    mutationFn: (input: { title: string; practice_type: PracticeType; drill_id?: string }) =>
      create({
        data: {
          title: input.title,
          practice_type: input.practice_type,
          drill_id: input.drill_id ?? null,
          symbol: "EURUSD",
          market: "forex",
          timeframe: "5m",
          starting_balance: 10_000,
          created_source: input.drill_id ? "recommendation" : "user",
        },
      }),
    onSuccess: (row: any) => {
      queryClient.invalidateQueries({ queryKey: ["practice"] });
      toast.success("Practice session created");
      if (row?.replay_session_id) {
        navigate({ to: "/replay/studio", search: { id: row.replay_session_id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (assignments.data ?? []).filter((a: any) => a.status === "pending" || a.status === "in_progress");
  const done = (assignments.data ?? []).filter((a: any) => a.status === "completed" || a.status === "failed");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Play className="h-4 w-4" /> Free practice</CardTitle>
            <CardDescription>Pick your own market and trade it bar by bar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              disabled={startPractice.isPending}
              onClick={() => startPractice.mutate({ title: "Free practice", practice_type: "free" })}
            >
              Start free practice
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Shuffle className="h-4 w-4" /> Surprise session</CardTitle>
            <CardDescription>A real historical window with the date and outcome hidden until you finish.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              disabled={startPractice.isPending}
              onClick={() => startPractice.mutate({ title: "Surprise session", practice_type: "surprise" })}
            >
              Roll a session
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Dumbbell className="h-4 w-4" /> Drills</CardTitle>
            <CardDescription>{DRILLS.length} versioned drills with objective scoring.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/practice/drills">Browse drills</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Recommended for you</CardTitle>
          <CardDescription>Rule-based suggestions. Every one shows its evidence and sample size.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            (recommendations.data ?? []).map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="font-medium">{r.title}</div>
                  <p className="text-sm text-muted-foreground">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Evidence: {r.evidence.source} · sample {r.evidence.sampleSize} · {r.evidenceLevel} confidence · {r.origin === "ai" ? "AI-generated" : "rule-based"}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={startPractice.isPending}
                  onClick={() => startPractice.mutate({ title: r.title, practice_type: "guided_drill", drill_id: r.drillId })}
                >
                  Start drill
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Continue practice</CardTitle>
          <CardDescription>Sessions you started and have not finished.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {assignments.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : open.length === 0 ? (
            <EmptyState
              compact
              icon={Play}
              title="Nothing in progress"
              description="Start a drill or a free session and it will wait for you here."
            />
          ) : (
            open.map((a: any) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {a.title}
                    <Badge variant="outline">{PRACTICE_TYPE_LABEL[a.practice_type as PracticeType] ?? a.practice_type}</Badge>
                    {a.blind ? <Badge variant="secondary">Blind</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.blind ? "Date and dataset hidden until you finish." : `${a.symbol_rules?.symbol ?? "—"} · ${a.timeframe_rules?.timeframe ?? "—"}`}
                  </p>
                </div>
                {a.replay_session_id ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/replay/studio" search={{ id: a.replay_session_id }}>Resume</Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently completed</CardTitle>
          <CardDescription>Open a session in Review Mode to see the full breakdown.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {done.length === 0 ? (
            <EmptyState compact icon={Dumbbell} title="No completed practice yet" description="Finish a session to build your skill history." />
          ) : (
            done.slice(0, 10).map((a: any) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {a.title}
                    <Badge variant={statusTone(a.status)}>{a.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Score {a.result?.score ?? "—"} · {a.result?.sampleSize ?? 0} trade(s)
                  </p>
                </div>
                {a.review_session_id ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/replay/review" search={{ id: a.review_session_id }}>Review</Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
