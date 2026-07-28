import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  ArrowLeft, Bookmark, Download, ExternalLink, FileText,
  PlaySquare, ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { z } from "zod";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { AiTradeReviewPanel, type AiTradeReview } from "@/components/ai/AiTradeReviewPanel";
import { getTradeDetails, type TradeSource } from "@/lib/trade-details.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { MISTAKE_TAGS, RULE_CHECKLIST, computeTradeScore, useTradeReviewLocal } from "@/lib/trade-review/local-store";
import { cn } from "@/lib/utils";

import { routeBoundaries } from "@/lib/route-boundaries";

const searchSchema = z.object({
  source: z.enum(["paper", "replay"]).catch("paper").default("paper"),
});

export const Route = createFileRoute("/_authenticated/trades/$tradeId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: TradeDetailsPage,
  ...routeBoundaries({
    label: "Trade Review",
    boundary: "trade_details_route",
    backHref: "/journal",
    backLabel: "Back to Journal",
  }),
});

function fmtDuration(open: string | null, close: string | null): string {
  if (!open) return "—";
  const start = new Date(open).getTime();
  const end = close ? new Date(close).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86_400).toFixed(1)}d`;
}

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
  const decimals = sym?.decimals ?? 2;
  const pnl = Number(trade.pnl ?? 0);
  const isOpen = trade.status === "open";
  const isWin = pnl > 0;

  const local = useTradeReviewLocal(tradeId);
  const score = useMemo(() => computeTradeScore({
    pnl,
    rr_realized: trade.rr_realized != null ? Number(trade.rr_realized) : null,
    risk_pct: trade.risk_pct != null ? Number(trade.risk_pct) : null,
    rules_checked_pct: local.compliance,
    mistake_count: local.state.mistakes.length,
    has_sl: trade.stop_loss != null,
    has_tp: trade.take_profit != null,
  }), [pnl, trade, local.compliance, local.state.mistakes.length]);

  const exportJson = () => {
    const payload = {
      trade,
      review: local.state,
      score,
      exported_at: new Date().toISOString(),
      source: data.source,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-${trade.symbol}-${trade.id}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const header = ["field","value"];
    const rows: [string, unknown][] = [
      ["symbol", trade.symbol], ["direction", trade.direction], ["status", trade.status],
      ["entry_price", trade.entry_price], ["exit_price", trade.exit_price],
      ["stop_loss", trade.stop_loss], ["take_profit", trade.take_profit],
      ["lot_size", trade.lot_size], ["risk_pct", trade.risk_pct],
      ["rr_realized", trade.rr_realized], ["pnl", trade.pnl],
      ["opened_at", trade.opened_at], ["closed_at", trade.closed_at],
      ["duration", fmtDuration(trade.opened_at, trade.closed_at)],
      ["grade", score.grade], ["overall_score", score.overall],
      ["mistakes", local.state.mistakes.join("|")],
      ["rules_checked_pct", `${local.compliance}%`],
    ];
    const csv = [header.join(","), ...rows.map(([k, v]) => `${k},"${String(v ?? "").replace(/"/g, '""')}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-${trade.symbol}-${trade.id}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: ".." as any })}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
        </Button>
      </div>

      <PageHeader
        title={`${trade.symbol} · ${String(trade.direction).toUpperCase()}`}
        description={`${data.source === "replay" ? "Replay" : "Paper"} trade · ${trade.status} · ${fmtDuration(trade.opened_at, trade.closed_at)}`}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            {data.source === "replay" ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/replay/session" search={{ id: trade.session_id, focus: trade.id } as never}>
                  <PlaySquare className="mr-1.5 h-3.5 w-3.5" /> Replay from entry
                </Link>
              </Button>
            ) : null}
            <ShareToCommunityButton
              sourceType={data.source === "replay" ? "replay" : "trading_workspace"}
              sourceId={data.source === "replay" ? (trade.session_id as string) : (trade.id as string)}
              variant="outline"
              size="sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline"><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportJson}>Export JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>Printable report</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Trade Score */}
      <ScoreCard score={score} rulesPct={local.compliance} mistakes={local.state.mistakes.length} />

      {/* Overview */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="P&L" value={isOpen ? "—" : `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)}`} tone={isOpen ? "muted" : isWin ? "success" : "danger"} icon={isWin ? TrendingUp : TrendingDown} />
        <StatCard label="RR (realized)" value={trade.rr_realized != null ? `${Number(trade.rr_realized).toFixed(2)}R` : "—"} />
        <StatCard label="Entry / Exit" value={`${formatNumber(Number(trade.entry_price), decimals)} → ${trade.exit_price != null ? formatNumber(Number(trade.exit_price), decimals) : "—"}`} />
        <StatCard label="Lot Size" value={String(trade.lot_size)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaRow label="Stop Loss" value={trade.stop_loss != null ? formatNumber(Number(trade.stop_loss), decimals) : "—"} />
        <MetaRow label="Take Profit" value={trade.take_profit != null ? formatNumber(Number(trade.take_profit), decimals) : "—"} />
        <MetaRow label="Opened" value={new Date(trade.opened_at).toLocaleString()} />
        <MetaRow label="Closed" value={trade.closed_at ? new Date(trade.closed_at).toLocaleString() : "—"} />
      </div>

      <Tabs defaultValue="overview" className="print:hidden">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="mistakes">Mistakes</TabsTrigger>
          <TabsTrigger value="ai">AI Review</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          {data.source === "replay" ? <TabsTrigger value="replay">Replay</TabsTrigger> : null}
          {data.source === "paper" ? <TabsTrigger value="attachments">Files</TabsTrigger> : null}
          <TabsTrigger value="related">Related</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3">
          <GlassCard className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Trade Summary</div>
            <p className="text-sm leading-relaxed">
              {trade.direction === "long" ? "Long" : "Short"} {trade.lot_size} lots of{" "}
              <span className="font-mono font-semibold">{trade.symbol}</span> entered at{" "}
              <span className="tabular-nums">{formatNumber(Number(trade.entry_price), decimals)}</span>
              {trade.exit_price != null && (<> and exited at <span className="tabular-nums">{formatNumber(Number(trade.exit_price), decimals)}</span></>)}.
              {trade.stop_loss != null && (<> Stop at <span className="tabular-nums">{formatNumber(Number(trade.stop_loss), decimals)}</span>.</>)}
              {trade.take_profit != null && (<> Target at <span className="tabular-nums">{formatNumber(Number(trade.take_profit), decimals)}</span>.</>)}
              {trade.rr_realized != null && (<> Realized <span className="font-semibold">{Number(trade.rr_realized).toFixed(2)}R</span>.</>)}
            </p>
          </GlassCard>
          {data.source === "paper" && data.journal ? (
            <JournalPanel entry={data.journal} />
          ) : null}
        </TabsContent>

        <TabsContent value="rules" className="mt-3">
          <GlassCard className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Rule Checklist</div>
                <div className="text-xs text-muted-foreground">Score your execution against your trading plan.</div>
              </div>
              <ComplianceBadge pct={local.compliance} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {RULE_CHECKLIST.map((r) => (
                <label key={r.id} className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 p-2.5 cursor-pointer hover:border-primary/40 transition">
                  <Checkbox checked={!!local.state.rules[r.id]} onCheckedChange={() => local.toggleRule(r.id)} />
                  <span className={cn("text-sm", local.state.rules[r.id] && "text-foreground")}>{r.label}</span>
                </label>
              ))}
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="mistakes" className="mt-3">
          <GlassCard className="p-4 space-y-3">
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5"><Target className="h-4 w-4 text-danger" /> Tag Mistakes</div>
              <div className="text-xs text-muted-foreground">Multiple tags allowed — patterns feed the Mistake Analytics engine.</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MISTAKE_TAGS.map((m) => {
                const active = local.state.mistakes.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => local.toggleMistake(m.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      active
                        ? m.tone === "danger"
                          ? "border-danger/60 bg-danger/15 text-danger"
                          : "border-warning/60 bg-warning/15 text-warning"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {local.state.mistakes.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {local.state.mistakes.length} mistake{local.state.mistakes.length === 1 ? "" : "s"} tagged.
              </div>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="ai" className="mt-3">
          <AiTradeReviewPanel review={data.source === "paper" ? mapAiReview(data.ai_review) : null} />
        </TabsContent>

        <TabsContent value="notes" className="mt-3">
          <GlassCard className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4" /> Trade Notes</div>
              {local.state.updated_at && (
                <span className="text-[11px] text-muted-foreground">Saved · {new Date(local.state.updated_at).toLocaleTimeString()}</span>
              )}
            </div>
            <Textarea
              value={local.state.notes}
              onChange={(e) => local.setNotes(e.target.value)}
              placeholder="What worked, what didn't, and what will you do differently next time? Supports Markdown."
              className="min-h-[180px] text-sm"
            />
            {trade.notes ? (
              <div className="rounded-md border border-border/50 bg-background/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Original trade notes</div>
                <p className="text-sm whitespace-pre-wrap">{trade.notes}</p>
              </div>
            ) : null}
          </GlassCard>
        </TabsContent>

        <TabsContent value="timeline" className="mt-3">
          {data.source === "paper" ? (
            <TimelineList events={data.events} />
          ) : (
            <ReplayEventsList bookmarks={data.bookmarks} notes={data.notes} />
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
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link to="/replay/session" search={{ id: trade.session_id, focus: trade.id } as never}>
                        <PlaySquare className="mr-1.5 h-3.5 w-3.5" /> Replay from entry
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/replay/session" search={{ id: trade.session_id } as never}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open Session
                      </Link>
                    </Button>
                  </div>
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

      <input type="hidden" data-source={source as TradeSource} />
    </div>
  );
}

/* ---------------- primitives ---------------- */

function ScoreCard({ score, rulesPct, mistakes }: { score: ReturnType<typeof computeTradeScore>; rulesPct: number; mistakes: number }) {
  const gradeTone =
    score.grade === "A+" || score.grade === "A" ? "text-success border-success/40 bg-success/10" :
    score.grade === "B" ? "text-primary border-primary/40 bg-primary/10" :
    score.grade === "C" ? "text-warning border-warning/40 bg-warning/10" :
    "text-danger border-danger/40 bg-danger/10";
  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className={cn("flex h-16 w-16 items-center justify-center rounded-2xl border text-2xl font-black", gradeTone)}>
          {score.grade}
        </div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Trade Score
            <Badge variant="outline" className="ml-1">{score.overall}/100</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {rulesPct}% rules checked · {mistakes} mistake{mistakes === 1 ? "" : "s"} tagged
          </div>
        </div>
        <div className="grid flex-1 min-w-[260px] grid-cols-2 gap-2 sm:grid-cols-4">
          <ScoreBar label="Execution" value={score.execution} />
          <ScoreBar label="Risk" value={score.risk} />
          <ScoreBar label="Discipline" value={score.discipline} />
          <ScoreBar label="Setup" value={score.setup} />
        </div>
      </div>
    </GlassCard>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 80 ? "bg-success" : value >= 60 ? "bg-primary" : value >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
        <div className={cn("h-full transition-all", tone)} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
    </div>
  );
}

function ComplianceBadge({ pct }: { pct: number }) {
  const tone = pct >= 80 ? "text-success border-success/40 bg-success/10" : pct >= 50 ? "text-warning border-warning/40 bg-warning/10" : "text-danger border-danger/40 bg-danger/10";
  return <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums", tone)}>{pct}% compliance</span>;
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
  if (!events.length) return <EmptyState title="No events" description="Timeline events will appear here as the trade progresses." />;
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

function mapAiReview(review: any): AiTradeReview | null {
  if (!review) return null;
  const gradeToScore: Record<string, number> = { "A+": 95, A: 88, B: 78, C: 65, D: 50, F: 30 };
  const score =
    typeof review.overall_score === "number"
      ? review.overall_score
      : typeof review.confidence === "number"
        ? Math.round(review.confidence * 100)
        : review.grade
          ? gradeToScore[String(review.grade)] ?? null
          : null;
  const toBullets = (arr: any): string[] => (Array.isArray(arr) ? arr.map((x) => (typeof x === "string" ? x : x?.title ?? JSON.stringify(x))) : []);
  return {
    overall_score: score,
    grade: review.grade ?? null,
    summary: review.summary ?? null,
    strengths: toBullets(review.strengths),
    improvements: [...toBullets(review.mistakes), ...toBullets(review.alternative_exits)],
    risk_management: review.risk_review ?? null,
    psychology: review.psychology_review ?? null,
    execution: review.execution_review ?? null,
    next_practice_goal: review.next_practice_goal ?? (toBullets(review.alternative_entries)[0] ?? null),
    generated_at: review.created_at ?? review.updated_at ?? null,
    model: review.model ?? null,
  };
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
