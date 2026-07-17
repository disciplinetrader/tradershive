import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { listReviewableTrades, reviewTrade, getTradeReview } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GRADE_COLORS } from "@/lib/ai/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PlaySquare, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai/trade-review")({ component: TradeReviewPage });

function TradeReviewPage() {
  const qc = useQueryClient();
  const list = useServerFn(listReviewableTrades);
  const getFn = useServerFn(getTradeReview);
  const runFn = useServerFn(reviewTrade);
  const trades = useQuery({ queryKey: ["ai", "reviewable"], queryFn: () => list() });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["ai", "trade-review", selectedId],
    queryFn: () => getFn({ data: { tradeId: selectedId! } }),
    enabled: !!selectedId,
  });

  const run = useMutation({
    mutationFn: (tradeId: string) => runFn({ data: { tradeId } }),
    onSuccess: () => {
      toast.success("Review generated");
      qc.invalidateQueries({ queryKey: ["ai", "reviewable"] });
      qc.invalidateQueries({ queryKey: ["ai", "trade-review", selectedId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><PlaySquare className="h-4 w-4" /> Closed Trades</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto space-y-1">
          {trades.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(trades.data ?? []).map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={cn(
                "w-full rounded-md border border-border/60 bg-background/40 p-2 text-left text-sm hover:border-primary/40 transition",
                selectedId === t.id && "border-primary/60 bg-primary/10",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold">{t.symbol}</span>
                {t.review?.grade ? (
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold border", GRADE_COLORS[t.review.grade])}>{t.review.grade}</span>
                ) : (
                  <Badge variant="outline">unrated</Badge>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{t.direction} · {Number(t.pnl ?? 0).toFixed(2)}</span>
                <span>{t.closed_at ? formatDistanceToNow(new Date(t.closed_at), { addSuffix: true }) : ""}</span>
              </div>
            </button>
          ))}
          {trades.data?.length === 0 && <p className="text-sm text-muted-foreground">No closed trades yet.</p>}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {!selectedId && (
          <Card className="bg-card/60 backdrop-blur-md">
            <CardContent className="p-12 text-center text-muted-foreground">
              Select a trade on the left to see (or generate) its AI review.
            </CardContent>
          </Card>
        )}
        {selectedId && detail.data && (
          <>
            <Card className="bg-card/60 backdrop-blur-md">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{detail.data.trade?.symbol} · {detail.data.trade?.direction}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">PnL {Number(detail.data.trade?.pnl ?? 0).toFixed(2)} · R:R {Number(detail.data.trade?.rr_realized ?? 0).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {detail.data.review?.grade && (
                    <span className={cn("rounded-lg px-3 py-1 text-lg font-bold border", GRADE_COLORS[detail.data.review.grade])}>
                      {detail.data.review.grade}
                    </span>
                  )}
                  <Button onClick={() => run.mutate(selectedId)} disabled={run.isPending}>
                    <Sparkles className="mr-1.5 h-4 w-4" /> {detail.data.review ? "Regenerate" : "Analyze"}
                  </Button>
                </div>
              </CardHeader>
            </Card>
            {detail.data.review ? (
              <>
                <ReviewSection title="Summary" body={detail.data.review.summary} />
                <ReviewGrid
                  strengths={detail.data.review.strengths as string[]}
                  mistakes={detail.data.review.mistakes as string[]}
                />
                <ReviewSection title="Execution review" body={detail.data.review.execution_review} />
                <ReviewSection title="Risk review" body={detail.data.review.risk_review} />
                <ReviewSection title="Psychology review" body={detail.data.review.psychology_review} />
                <ReviewLists
                  alt_entries={detail.data.review.alternative_entries as string[]}
                  alt_exits={detail.data.review.alternative_exits as string[]}
                  missed={detail.data.review.missed_opportunities as string[]}
                  better_stop={detail.data.review.better_stop}
                  suggested_tp={detail.data.review.suggested_take_profit}
                />
              </>
            ) : (
              <Card className="bg-card/60 backdrop-blur-md">
                <CardContent className="p-8 text-center text-muted-foreground">
                  No review yet. Click Analyze to generate one.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReviewSection({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent className="text-sm leading-relaxed">{body}</CardContent>
    </Card>
  );
}

function ReviewGrid({ strengths, mistakes }: { strengths: string[]; mistakes: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="bg-card/60 backdrop-blur-md border-emerald-500/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-400">Strengths</CardTitle></CardHeader>
        <CardContent><ul className="list-disc pl-5 space-y-1 text-sm">{(strengths ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul></CardContent>
      </Card>
      <Card className="bg-card/60 backdrop-blur-md border-red-500/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-red-400">Mistakes</CardTitle></CardHeader>
        <CardContent><ul className="list-disc pl-5 space-y-1 text-sm">{(mistakes ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul></CardContent>
      </Card>
    </div>
  );
}

function ReviewLists({ alt_entries, alt_exits, missed, better_stop, suggested_tp }: {
  alt_entries: string[]; alt_exits: string[]; missed: string[]; better_stop: string | null; suggested_tp: string | null;
}) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Alternatives &amp; missed opportunities</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-1">Alternative entries</p>
          <ul className="list-disc pl-5 space-y-1">{(alt_entries ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-1">Alternative exits</p>
          <ul className="list-disc pl-5 space-y-1">{(alt_exits ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-1">Better stop</p>
          <p>{better_stop ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-muted-foreground mb-1">Suggested TP</p>
          <p>{suggested_tp ?? "—"}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-xs uppercase text-muted-foreground mb-1">Missed opportunities</p>
          <ul className="list-disc pl-5 space-y-1">{(missed ?? []).map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </CardContent>
    </Card>
  );
}
