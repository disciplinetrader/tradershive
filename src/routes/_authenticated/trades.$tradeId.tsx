import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bookmark, ExternalLink, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { z } from "zod";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { AiTradeReviewPanel, type AiTradeReview } from "@/components/ai/AiTradeReviewPanel";
import { getTradeDetails, type TradeSource } from "@/lib/trade-details.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";

import { routeBoundaries } from "@/lib/route-boundaries";

const searchSchema = z.object({
  source: z.enum(["paper", "replay"]).catch("paper").default("paper"),
});

export const Route = createFileRoute("/_authenticated/trades/$tradeId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: TradeDetailsPage,
  ...routeBoundaries({
    label: "Trade",
    boundary: "trade_details_route",
    backHref: "/journal",
    backLabel: "Back to Journal",
  }),
});

function TradeDetailsPage() {
  const { tradeId } = Route.useParams();
  const { source } = Route.useSearch();
  const navigate = useNavigate();
  const fn = useServerFn(getTradeDetails);
  const { data } = useSuspenseQuery({
    queryKey: ["trade-details", source, tradeId],
    queryFn: () => fn({ data: { id: tradeId, source } }),
  });

  const trade = data.trade as any;
  const sym = findSymbol(trade.symbol);
  const pnl = Number(trade.pnl ?? 0);
  const isOpen = trade.status === "open";
  const isWin = pnl > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: ".." as any })}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
        </Button>
      </div>

      <PageHeader
        title={`${trade.symbol} · ${String(trade.direction).toUpperCase()}`}
        description={`${data.source === "replay" ? "Replay" : "Paper"} trade · ${trade.status}`}
        actions={
          <div className="flex items-center gap-2">
            <ShareToCommunityButton
              sourceType={data.source === "replay" ? "replay" : "trading_workspace"}
              sourceId={data.source === "replay" ? (trade.session_id as string) : (trade.id as string)}
              variant="outline"
              size="sm"
            />
          </div>
        }
      />

      {/* Overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="P&L" value={isOpen ? "—" : `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)}`} tone={isOpen ? "muted" : isWin ? "success" : "danger"} icon={isWin ? TrendingUp : TrendingDown} />
        <StatCard label="RR (realized)" value={trade.rr_realized != null ? `${Number(trade.rr_realized).toFixed(2)}R` : "—"} />
        <StatCard label="Entry / Exit" value={`${formatNumber(Number(trade.entry_price), sym?.decimals ?? 2)} → ${trade.exit_price != null ? formatNumber(Number(trade.exit_price), sym?.decimals ?? 2) : "—"}`} />
        <StatCard label="Lot Size" value={String(trade.lot_size)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaRow label="Stop Loss" value={trade.stop_loss != null ? formatNumber(Number(trade.stop_loss), sym?.decimals ?? 2) : "—"} />
        <MetaRow label="Take Profit" value={trade.take_profit != null ? formatNumber(Number(trade.take_profit), sym?.decimals ?? 2) : "—"} />
        <MetaRow label="Opened" value={new Date(trade.opened_at).toLocaleString()} />
        <MetaRow label="Closed" value={trade.closed_at ? new Date(trade.closed_at).toLocaleString() : "—"} />
      </div>

      <Tabs defaultValue="timeline">
        <TabsList className="flex-wrap">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="ai">AI Review</TabsTrigger>
          {data.source === "replay" ? <TabsTrigger value="replay">Replay</TabsTrigger> : null}
          {data.source === "paper" ? <TabsTrigger value="attachments">Attachments</TabsTrigger> : null}
          <TabsTrigger value="related">Related</TabsTrigger>
          
        </TabsList>

        <TabsContent value="timeline" className="mt-3">
          {data.source === "paper" ? (
            <TimelineList events={data.events} />
          ) : (
            <ReplayEventsList bookmarks={data.bookmarks} notes={data.notes} />
          )}
        </TabsContent>

        <TabsContent value="journal" className="mt-3">
          {data.source === "paper" && data.journal ? (
            <JournalPanel entry={data.journal} />
          ) : (
            <EmptyState
              title="No journal entry"
              description={data.source === "paper" ? "Add reflection and lessons to build your edge." : "Journal entries are created from paper trades."}
              action={data.source === "paper" ? { label: "Open Journal", href: "/journal" } : undefined}
            />
          )}
        </TabsContent>

        <TabsContent value="ai" className="mt-3">
          {data.source === "paper" && data.ai_review ? (
            <AiReviewPanel review={data.ai_review} />
          ) : (
            <EmptyState
              icon={Brain}
              title="No AI review yet"
              description="Generate an AI review to see execution, risk and psychology analysis."
              action={{ label: "Generate Review", href: `/ai/trade-review?tradeId=${tradeId}` }}
            />
          )}
        </TabsContent>

        {data.source === "replay" ? (
          <TabsContent value="replay" className="mt-3">
            <GlassCard className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Replay Session</div>
              {data.session ? (
                <>
                  <div className="font-semibold">{(data.session as any).title}</div>
                  <div className="text-xs text-muted-foreground">
                    {(data.session as any).symbol} · {(data.session as any).timeframe} · {(data.session as any).mode ?? "practice"}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/replay/session" search={{ id: trade.session_id } as any}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open Session
                    </Link>
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Session unavailable.</div>
              )}
            </GlassCard>
          </TabsContent>
        ) : null}

        {data.source === "paper" ? (
          <TabsContent value="attachments" className="mt-3">
            <AttachmentsPanel items={data.attachments} />
          </TabsContent>
        ) : null}

        <TabsContent value="related" className="mt-3">
          <RelatedTradesList items={data.related as any[]} source={data.source} />
        </TabsContent>

      </Tabs>

      {trade.notes ? (
        <GlassCard className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
          <p className="text-sm whitespace-pre-wrap">{trade.notes}</p>
        </GlassCard>
      ) : null}

      <input type="hidden" data-source={source as TradeSource} />
    </div>
  );
}

function StatCard({ label, value, tone = "default", icon: Icon }: { label: string; value: string; tone?: "default" | "success" | "danger" | "muted"; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <GlassCard className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-xl font-bold tabular-nums flex items-center gap-1.5",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        tone === "muted" && "text-muted-foreground",
      )}>
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {value}
      </div>
    </GlassCard>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums truncate">{value}</div>
    </GlassCard>
  );
}

function TimelineList({ events }: { events: any[] }) {
  if (!events.length) {
    return <EmptyState title="No events" description="Timeline events will appear here as the trade progresses." />;
  }
  return (
    <GlassCard className="p-0 overflow-hidden">
      <ul className="divide-y divide-border/50">
        {events.map((e) => (
          <li key={e.id} className="p-3 flex items-start gap-3">
            <div className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-semibold capitalize">{String(e.event).replace(/_/g, " ")}</div>
                <div className="text-[11px] text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleString()}</div>
              </div>
              {e.payload ? (
                <pre className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap font-mono">{JSON.stringify(e.payload, null, 2)}</pre>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function ReplayEventsList({ bookmarks, notes }: { bookmarks: any[]; notes: any[] }) {
  const combined = [
    ...bookmarks.map((b) => ({ kind: "bookmark" as const, ts: b.bookmark_ts, label: b.label, id: b.id })),
    ...notes.map((n) => ({ kind: "note" as const, ts: n.note_ts, label: n.body, id: n.id })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (!combined.length) return <EmptyState title="No timeline events" description="Add bookmarks or notes during a replay session." />;

  return (
    <GlassCard className="p-0 overflow-hidden">
      <ul className="divide-y divide-border/50">
        {combined.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="p-3 flex items-start gap-3">
            <Bookmark className={cn("mt-0.5 h-4 w-4 shrink-0", e.kind === "bookmark" ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">{e.label ?? (e.kind === "bookmark" ? "Bookmark" : "Note")}</div>
              <div className="text-[11px] text-muted-foreground">{new Date(e.ts).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function JournalPanel({ entry }: { entry: any }) {
  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Journal Entry</div>
        <Button asChild size="sm" variant="outline">
          <Link to="/journal">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Open in Journal
          </Link>
        </Button>
      </div>
      {entry.setup ? <div className="text-sm"><span className="text-muted-foreground">Setup: </span>{entry.setup}</div> : null}
      {entry.strategy ? <div className="text-sm"><span className="text-muted-foreground">Strategy: </span>{entry.strategy}</div> : null}
      {entry.grade ? <div className="text-sm"><span className="text-muted-foreground">Grade: </span>{entry.grade}</div> : null}
      {entry.notes ? <p className="text-sm whitespace-pre-wrap">{entry.notes}</p> : null}
    </GlassCard>
  );
}

function AiReviewPanel({ review }: { review: any }) {
  const sections: [string, any][] = [
    ["Summary", review.summary],
    ["Execution", review.execution_review],
    ["Risk", review.risk_review],
    ["Psychology", review.psychology_review],
    ["Better Stop", review.better_stop],
    ["Suggested TP", review.suggested_take_profit],
  ];
  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">AI Trade Review</div>
        {review.grade ? (
          <div className="text-sm font-bold text-primary">Grade: {review.grade}</div>
        ) : null}
      </div>
      {sections.map(([label, body]) =>
        body ? (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{String(body)}</p>
          </div>
        ) : null,
      )}
      {Array.isArray(review.mistakes) && review.mistakes.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mistakes</div>
          <ul className="list-disc pl-4 text-sm text-danger space-y-0.5">
            {review.mistakes.map((m: any, i: number) => <li key={i}>{typeof m === "string" ? m : (m.title ?? JSON.stringify(m))}</li>)}
          </ul>
        </div>
      ) : null}
    </GlassCard>
  );
}

function AttachmentsPanel({ items }: { items: any[] }) {
  if (!items.length) return <EmptyState title="No attachments" description="Screenshots and files attached to the journal entry will show up here." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <GlassCard key={a.id} className="p-3">
          <div className="text-sm font-semibold truncate">{a.name}</div>
          <div className="text-[11px] text-muted-foreground">{a.kind} · {a.content_type}</div>
        </GlassCard>
      ))}
    </div>
  );
}

function RelatedTradesList({ items, source }: { items: any[]; source: TradeSource }) {
  if (!items.length) return <EmptyState title="No related trades" description="Trades on the same symbol will appear here." />;
  return (
    <GlassCard className="p-0 overflow-hidden">
      <ul className="divide-y divide-border/50">
        {items.map((t) => {
          const pnl = Number(t.pnl ?? 0);
          return (
            <li key={t.id}>
              <Link
                to="/trades/$tradeId"
                params={{ tradeId: t.id }}
                search={{ source } as any}
                className="flex items-center justify-between px-3 py-2 hover:bg-background/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    t.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                    {t.direction}
                  </span>
                  <span className="font-semibold">{t.symbol}</span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {t.closed_at ? new Date(t.closed_at).toLocaleString() : t.status}
                  </span>
                </div>
                <div className={cn("text-sm font-mono font-semibold tabular-nums",
                  pnl >= 0 ? "text-success" : "text-danger")}>
                  {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
