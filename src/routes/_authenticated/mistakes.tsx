import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Coins, Flame, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MistakeCard } from "@/components/mistakes/MistakeCard";
import { InsightHint, InsightList } from "@/components/mistakes/InsightList";
import { getMistakeAnalysis } from "@/lib/mistakes.functions";
import type { DetectedMistake, MistakeCategory } from "@/lib/mistakes/types";

const RANGES = [7, 30, 90] as const;
const CATEGORIES: MistakeCategory[] = ["risk", "execution", "psychology", "discipline", "consistency"];

export const Route = createFileRoute("/_authenticated/mistakes")({
  component: MistakesPage,
  head: () => ({
    meta: [
      { title: "Trading Mistakes · TradersHIVE" },
      { name: "description", content: "Rule-based detection of your most costly recurring trading habits — with example trades and one-line fixes." },
      { property: "og:title", content: "Trading Mistakes · TradersHIVE" },
      { property: "og:description", content: "Stop asking how much you made. Start asking which habit is costing you the most." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MistakesPage() {
  const fn = useServerFn(getMistakeAnalysis);
  const [range, setRange] = useState<number>(30);
  const [category, setCategory] = useState<MistakeCategory | "all">("all");

  const q = useQuery({
    queryKey: ["mistake-analysis", range],
    queryFn: () => fn({ data: { rangeDays: range } }),
    staleTime: 60_000,
  });

  const all = q.data?.detected ?? [];
  const active = useMemo(() => all.filter((d) => !d.resolved), [all]);
  const filtered = useMemo(
    () => (category === "all" ? active : active.filter((d) => d.category === category)),
    [active, category],
  );
  const mostFrequent = [...filtered].sort((a, b) => b.frequency - a.frequency).slice(0, 6);
  const costliest = [...filtered].sort((a, b) => a.impact_r - b.impact_r).slice(0, 6);
  const improving = filtered.filter((d) => d.trend === "improving");
  const resolved = all.filter((d) => d.resolved).slice(0, 12);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trading Mistakes"
        description="What habit is costing you the most money? Rule-based detection across every closed trade in your journal and paper account."
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {RANGES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRange(d)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] transition",
                  range === d
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                Last {d}d
              </button>
            ))}
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Coins className="h-4 w-4" />}
          label="Total impact"
          value={
            <span className={cn("font-mono tabular-nums", (q.data?.totals.total_impact_r ?? 0) < 0 ? "text-destructive" : "text-success")}>
              {(q.data?.totals.total_impact_r ?? 0) > 0 ? "+" : ""}
              {(q.data?.totals.total_impact_r ?? 0).toFixed(1)}R
            </span>
          }
          hint={`${q.data?.closed_trades ?? 0} closed trades analysed`}
        />
        <Kpi
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Active habits"
          value={<span className="font-mono tabular-nums">{active.length}</span>}
          hint={`${resolved.length} resolved`}
          tone={active.length > 0 ? "warn" : "positive"}
        />
        <Kpi
          icon={<Sparkles className="h-4 w-4" />}
          label="Improving"
          value={<span className="font-mono tabular-nums text-success">{improving.length}</span>}
          hint="Occurring less often lately"
        />
        <Kpi
          icon={<Flame className="h-4 w-4" />}
          label="Top habit"
          value={<span className="truncate">{q.data?.totals.top_kind ? active[0]?.title : "None"}</span>}
          hint={q.data?.totals.top_kind ? `${q.data.totals.top_kind_impact_r.toFixed(1)}R impact` : "Nothing to fix"}
          tone={q.data?.totals.top_kind ? "warn" : "positive"}
        />
      </div>

      {/* Insights */}
      <GlassCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Insights</div>
            <p className="text-xs text-muted-foreground">Plain-English observations from your last {range} days.</p>
          </div>
          <InsightHint />
        </div>
        {q.isPending ? <div className="h-24 animate-pulse rounded-lg bg-muted/30" /> : <InsightList insights={q.data?.insights ?? []} />}
      </GlassCard>

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">Filter</span>
        <FilterChip label="All" active={category === "all"} onClick={() => setCategory("all")} />
        {CATEGORIES.map((c) => (
          <FilterChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
        ))}
      </div>

      {/* Most frequent */}
      <Section
        title="Most Frequent Mistakes"
        subtitle="Where you slip up the most often"
        icon={<TrendingUp className="h-4 w-4" />}
        empty={mostFrequent.length === 0}
      >
        <Grid items={mostFrequent} />
      </Section>

      {/* Biggest costly */}
      <Section
        title="Biggest Costly Habits"
        subtitle="Ordered by R impact — fix these first"
        icon={<TrendingDown className="h-4 w-4" />}
        empty={costliest.length === 0}
      >
        <Grid items={costliest} />
      </Section>

      {/* Improving */}
      <Section
        title="Improving Habits"
        subtitle="Occurring less often than earlier in the range"
        icon={<Sparkles className="h-4 w-4" />}
        empty={improving.length === 0}
        emptyLabel="No improving habits yet — keep at it."
      >
        <Grid items={improving} />
      </Section>

      {/* Resolved */}
      <Section
        title="Resolved Habits"
        subtitle="No occurrences in this range"
        icon={<CheckCircle2 className="h-4 w-4" />}
        empty={resolved.length === 0}
        emptyLabel="No mistakes have been resolved yet."
      >
        <div className="flex flex-wrap gap-2">
          {resolved.map((d) => (
            <Badge key={d.kind} variant="outline" className="border-success/30 bg-success/5 text-success">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {d.title}
            </Badge>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  empty,
  emptyLabel = "Nothing detected in this range.",
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  empty: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {empty ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Grid({ items }: { items: DetectedMistake[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((m) => <MistakeCard key={m.kind} mistake={m} />)}
    </div>
  );
}

function Kpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone?: "warn" | "positive" }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className={cn(
          "grid h-5 w-5 place-items-center rounded-md",
          tone === "warn" && "bg-warning/15 text-warning",
          tone === "positive" && "bg-success/15 text-success",
          !tone && "bg-primary/10 text-primary",
        )}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </GlassCard>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
