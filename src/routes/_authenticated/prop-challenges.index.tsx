import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trophy, AlertTriangle, PlayCircle, Archive } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listPropChallenges } from "@/lib/prop-challenges.functions";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";

export const Route = createFileRoute("/_authenticated/prop-challenges/")({
  component: PropChallengesIndex,
  validateSearch: (s: Record<string, unknown>) => ({ all: s.all === "1" ? "1" : undefined }),
});

function PropChallengesIndex() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const list = useServerFn(listPropChallenges);
  const q = useQuery({ queryKey: ["prop-challenges"], queryFn: () => list() });
  const rows = q.data ?? [];
  const active = rows.filter((r) => r.status === "active");
  const past = rows.filter((r) => r.status !== "active");

  // UX shortcut: if exactly one active challenge exists, open it directly.
  // `?all=1` bypasses the redirect so users can still reach the list view.
  useEffect(() => {
    if (search.all === "1") return;
    if (q.isLoading) return;
    if (active.length === 1) {
      navigate({ to: "/prop-challenges/$id", params: { id: active[0].id }, replace: true });
    }
  }, [q.isLoading, active, navigate, search.all]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prop Firm Mode"
        description="Simulate real evaluations — FTMO, Apex, Topstep and more — with live rule monitoring."
        actions={
          <Button asChild>
            <Link to="/prop-challenges/new">
              <Plus className="mr-2 h-4 w-4" /> New Challenge
            </Link>
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Active</h2>
        {active.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No active challenge"
            description="Kick off an FTMO-style evaluation to practise trading under real prop firm rules."
            action={{ label: "Start a challenge", href: "/prop-challenges/new" }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {active.map((c) => (
              <ChallengeCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">History</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {past.map((c) => <ChallengeCard key={c.id} c={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function ChallengeCard({ c }: { c: Awaited<ReturnType<typeof listPropChallenges>>[number] }) {
  const profit = Number(c.current_equity) - Number(c.starting_equity);
  const profitPct = (profit / Number(c.starting_equity)) * 100;
  const drawdown = Math.max(0, Number(c.peak_equity) - Number(c.current_equity));
  const ddPct = (drawdown / Number(c.starting_equity)) * 100;

  const statusBadge =
    c.status === "active" ? <Badge variant="secondary"><PlayCircle className="mr-1 h-3 w-3" />Active</Badge> :
    c.status === "passed" ? <Badge className="bg-emerald-500/15 text-emerald-400"><Trophy className="mr-1 h-3 w-3" />Passed</Badge> :
    c.status === "failed" ? <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Failed</Badge> :
    <Badge variant="outline"><Archive className="mr-1 h-3 w-3" />Abandoned</Badge>;

  return (
    <Link to="/prop-challenges/$id" params={{ id: c.id }} className="group">
      <GlassCard className="p-4 transition-colors group-hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{c.name}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {c.preset.replace(/_/g, " ")} · {formatCurrency(Number(c.account_size), c.currency)} · {c.leverage}:1
            </div>
          </div>
          {statusBadge}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Stat label="P/L" value={`${profit >= 0 ? "+" : ""}${profitPct.toFixed(2)}%`} tone={profit >= 0 ? "pos" : "neg"} />
          <Stat label="Target" value={`${c.profit_target_pct}%`} />
          <Stat label="Drawdown" value={`${ddPct.toFixed(2)}% / ${c.max_total_drawdown_pct}%`} tone={ddPct > c.max_total_drawdown_pct * 0.7 ? "warn" : undefined} />
        </div>
      </GlassCard>
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" }) {
  const cls = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mono-nums text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
