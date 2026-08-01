/**
 * Phase 8D · Review Mode.
 *
 * Read-only post-session surface: the summary, the trade tape, original vs
 * replay, screenshots, coach review and homework. Nothing here can mutate
 * execution facts — the session is finished and its trades are immutable.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AiReviewPanel } from "@/components/replay/AiReviewPanel";
import { useReplayReview, useScoreSession } from "@/lib/replay/review/queries";
import { SessionSummaryPanel, SessionTradesTable } from "./SessionSummaryPanel";
import { ComparisonPanel } from "./ComparisonPanel";
import { ScreenshotGallery, type ScreenshotRow } from "./ScreenshotGallery";
import { HomeworkPanel, type HomeworkRowLite } from "./HomeworkPanel";

export function ReviewView({ sessionId }: { sessionId: string }) {
  const q = useReplayReview(sessionId);
  const score = useScoreSession(sessionId);

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading review…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="m-6 space-y-3 rounded-md border border-border/60 bg-card/40 p-8 text-center">
        <div className="font-medium">Review unavailable</div>
        <p className="text-sm text-muted-foreground">This session could not be loaded. It may have been deleted.</p>
        <Button asChild variant="secondary"><Link to="/replay/history">Back to history</Link></Button>
      </div>
    );
  }

  const review = q.data as never as {
    session: Record<string, unknown> | null;
    summary: Parameters<typeof SessionSummaryPanel>[0]["summary"];
    trades: Parameters<typeof SessionTradesTable>[0]["trades"] & { symbol: string }[];
    score: Parameters<typeof SessionSummaryPanel>[0]["score"];
    screenshots: ScreenshotRow[];
    homework: HomeworkRowLite[];
  };
  const session = (review.session ?? {}) as Record<string, string | number | null>;
  const suggestions = review.summary.unknowns.length
    ? ["Repeat this setup with a defined stop", "Take only A-grade entries"]
    : ["Repeat this setup with a defined stop"];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" aria-label="Back to history">
              <Link to="/replay/history"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-xl font-semibold">{String(session.title ?? "Replay review")}</h1>
            <Badge variant="outline">{String(session.status ?? "completed")}</Badge>
          </div>
          <p className="pl-10 text-xs text-muted-foreground">
            {String(session.symbol ?? "—")} · {String(session.timeframe ?? "—")} · reviewed from recorded trades
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/replay/studio" search={{ id: sessionId }}>Open in Studio</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/replay/history"><History className="mr-2 h-4 w-4" />History</Link>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="shots">Screenshots</TabsTrigger>
          <TabsTrigger value="coach">Coach</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <SessionSummaryPanel
            summary={review.summary}
            score={review.score}
            onScore={() => score.mutate(undefined)}
            scoring={score.isPending}
          />
          <HomeworkPanel
            sessionId={sessionId}
            symbol={String(session.symbol ?? "")}
            market={String(session.market ?? "forex")}
            timeframe={String(session.timeframe ?? "5m")}
            rows={review.homework}
            suggestions={suggestions}
          />
        </TabsContent>

        <TabsContent value="trades" className="mt-4">
          <SessionTradesTable summary={review.summary} trades={review.trades} />
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          <ComparisonPanel
            sessionId={sessionId}
            originalEntryId={(session.source_journal_id as string) ?? null}
            trades={review.trades as never}
            events={[]}
            startingBalance={session.initial_balance == null ? null : Number(session.initial_balance)}
          />
        </TabsContent>

        <TabsContent value="shots" className="mt-4">
          <ScreenshotGallery rows={review.screenshots} />
        </TabsContent>

        <TabsContent value="coach" className="mt-4">
          <AiReviewPanel sessionId={sessionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
