import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { listIdeas } from "@/lib/community-ideas.functions";

export const Route = createFileRoute("/_authenticated/community/ideas")({
  head: () => ({
    meta: [
      { title: "Trade Ideas — Community" },
      { name: "description", content: "Structured trade ideas with entry, stop loss, take profit, R:R and linked replays." },
    ],
  }),
  component: IdeasPage,
});

const STATUSES = ["all", "open", "win", "loss", "closed", "cancelled"] as const;

function IdeasPage() {
  const fn = useServerFn(listIdeas);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [symbol, setSymbol] = useState("");

  const q = useInfiniteQuery({
    queryKey: ["community", "ideas", status, symbol],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fn({ data: { status, symbol: symbol || null, cursor: pageParam, limit: 24 } }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const ideas = q.data?.pages.flatMap((p) => p.ideas) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trade Ideas"
        description="Structured setups from the community — entry, stop, target, R:R and linked context."
        actions={<Button asChild size="sm" variant="outline" className="opacity-50 cursor-not-allowed"><Link to="#" onClick={(e) => { e.preventDefault(); toast.info("Publishing ideas is coming soon."); }}>Publish idea (Coming soon)</Link></Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border/60 bg-card/60">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs capitalize ${status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {s}
            </button>
          ))}
        </div>
        <Input placeholder="Filter by symbol (e.g. EURUSD)" value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="max-w-xs" />
      </div>

      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : ideas.length === 0 ? (
        <EmptyState title="No ideas available" description="Structured trade ideas from the community will appear here soon." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map((i: any) => <IdeaCard key={i.id} idea={i} />)}
        </div>
      )}

      {q.hasNextPage ? (
        <div className="flex justify-center py-3">
          <Button size="sm" variant="outline" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function IdeaCard({ idea }: { idea: any }) {
  const statusColor: Record<string, string> = {
    open: "bg-primary/15 text-primary", win: "bg-success/15 text-success",
    loss: "bg-danger/15 text-danger", closed: "bg-muted text-muted-foreground",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-base font-bold">{idea.symbol}</div>
            <Badge className={idea.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}>
              {idea.direction.toUpperCase()}
            </Badge>
            {idea.timeframe ? <Badge variant="outline" className="text-[10px]">{idea.timeframe}</Badge> : null}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            by {idea.author?.display_name ?? idea.author?.username ?? "trader"}
          </div>
        </div>
        <Badge className={statusColor[idea.status] ?? "bg-muted"}>{idea.status}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <MiniStat label="Entry" value={idea.entry} />
        <MiniStat label="SL" value={idea.stop_loss} tone="danger" />
        <MiniStat label="TP" value={idea.take_profit} tone="success" />
      </div>

      {idea.rr ? (
        <div className="mt-2 text-xs">
          <span className="text-muted-foreground">R:R </span>
          <span className="font-semibold text-primary">{Number(idea.rr).toFixed(2)}</span>
          {idea.pnl_pct != null ? <span className={`ml-3 font-semibold ${idea.pnl_pct >= 0 ? "text-success" : "text-danger"}`}>{idea.pnl_pct >= 0 ? "+" : ""}{Number(idea.pnl_pct).toFixed(2)}%</span> : null}
        </div>
      ) : null}

      {idea.notes ? <div className="mt-2 line-clamp-3 text-sm text-muted-foreground">{idea.notes}</div> : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(idea.tags ?? []).slice(0, 5).map((t: string) => (
          <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">#{t}</span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-5 w-5">
            <AvatarImage src={idea.author?.avatar_url ?? undefined} />
            <AvatarFallback>{(idea.author?.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-muted-foreground">{new Date(idea.created_at).toLocaleDateString()}</span>
        </div>
        {idea.post_id ? (
          <Link to="/community/post/$id" params={{ id: idea.post_id }} className="text-[11px] font-medium text-primary hover:underline">
            Discuss →
          </Link>
        ) : null}
      </div>
    </GlassCard>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: any; tone?: "success" | "danger" }) {
  const cls = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-md bg-muted/40 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value != null ? Number(value).toLocaleString() : "—"}</div>
    </div>
  );
}
