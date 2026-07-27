import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, BarChart3, BookOpenCheck, ClipboardCheck, Layers, ListChecks, Sparkles, TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlaybookDetailHeader } from "@/components/playbook/PlaybookDetailHeader";
import { SectionCard } from "@/components/playbook/SectionCard";
import { MistakesEditor } from "@/components/playbook/MistakesEditor";
import { ChecklistRunner } from "@/components/playbook/ChecklistRunner";
import { ExamplesPanel } from "@/components/playbook/ExamplesPanel";
import { EvolutionPanel } from "@/components/playbook/EvolutionPanel";
import { AiInsightsPlaceholder } from "@/components/playbook/AiInsightsPlaceholder";
import { getPlaybook, getPlaybookStats, getPlaybookEvolution } from "@/lib/playbook.functions";

export const Route = createFileRoute("/_authenticated/strategies/playbooks/$id")({
  component: PlaybookDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: "Playbook · TradersHIVE" },
      { name: "description", content: `Rules, checklist, mistakes and live performance for playbook ${params.id.slice(0, 8)}.` },
      { property: "og:title", content: "Playbook · TradersHIVE" },
      { property: "og:description", content: "Codify, run and refine your trading setup." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PlaybookDetailPage() {
  const { id } = Route.useParams();
  const loadPb = useServerFn(getPlaybook);
  const loadStats = useServerFn(getPlaybookStats);
  const loadEvo = useServerFn(getPlaybookEvolution);

  const [runOpen, setRunOpen] = useState(false);
  const [range, setRange] = useState(30);

  const pb = useQuery({ queryKey: ["playbook", id], queryFn: () => loadPb({ data: { id } }) });
  const stats = useQuery({ queryKey: ["playbook-stats", id], queryFn: () => loadStats({ data: { id } }), enabled: !!pb.data });
  const evo = useQuery({ queryKey: ["playbook-evo", id, range], queryFn: () => loadEvo({ data: { id, rangeDays: range } }), enabled: !!pb.data });

  const requiredIds = useMemo(() => new Set<string>(pb.data?.strategy?.checklist_required_ids ?? []), [pb.data]);
  const totalItems = useMemo(
    () => (pb.data?.checklists ?? []).reduce((s: number, c: any) => s + ((c.items ?? []).length), 0),
    [pb.data],
  );

  if (pb.isPending) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border/50 bg-card/40" />;
  }
  if (!pb.data) return <div className="p-6 text-sm text-muted-foreground">Playbook not found.</div>;

  const strategy = pb.data.strategy;
  const mistakes = (strategy.mistakes ?? []) as Array<{ id: string; text: string }>;

  return (
    <div className="space-y-5">
      <PlaybookDetailHeader strategy={strategy} onRunChecklist={() => setRunOpen(true)} />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview"><Layers className="mr-1.5 h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="rules"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Rules & Checklist</TabsTrigger>
          <TabsTrigger value="examples"><BookOpenCheck className="mr-1.5 h-3.5 w-3.5" />Examples & Stats</TabsTrigger>
          <TabsTrigger value="evolution"><TrendingUp className="mr-1.5 h-3.5 w-3.5" />Evolution</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles className="mr-1.5 h-3.5 w-3.5" />AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="p-5 lg:col-span-2">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {strategy.description || "No overview yet. Use the Edit button to add context, market conditions and when to avoid this setup."}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(strategy.tags ?? []).map((t: string) => (
                  <Badge key={t} className="bg-primary/10 text-[10px] text-primary hover:bg-primary/15">#{t}</Badge>
                ))}
              </div>
            </GlassCard>
            <div className="grid grid-cols-2 gap-3">
              <StatChip icon={<BarChart3 className="h-3.5 w-3.5" />} label="Trades" value={stats.data?.trades ?? "—"} />
              <StatChip
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Win rate"
                value={stats.data && stats.data.trades ? `${Math.round(stats.data.win_rate * 100)}%` : "—"}
                tone={stats.data && stats.data.trades ? (stats.data.win_rate >= 0.5 ? "up" : "down") : undefined}
              />
              <StatChip
                icon={<ClipboardCheck className="h-3.5 w-3.5" />}
                label="Checklist items"
                value={`${totalItems} · ${requiredIds.size} required`}
              />
              <StatChip
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Mistakes logged"
                value={String(mistakes.length)}
              />
            </div>
          </div>

          <SectionCard title="Recent trades" description="Latest journal & paper trades linked to this playbook." icon={<BookOpenCheck className="h-4 w-4" />}>
            {stats.isPending ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
            ) : (
              <ExamplesPanel stats={stats.data!} />
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <SectionCard title="Entry rules" icon={<ListChecks className="h-4 w-4" />}>
            <RuleReadOnly items={strategy.entry_rules ?? []} emptyLabel="No entry rules yet." />
          </SectionCard>
          <SectionCard title="Exit rules" icon={<ListChecks className="h-4 w-4" />}>
            <RuleReadOnly items={strategy.exit_rules ?? []} emptyLabel="No exit rules yet." />
          </SectionCard>
          <SectionCard title="Risk rules" icon={<ListChecks className="h-4 w-4" />}>
            <RuleReadOnly items={strategy.risk_rules ?? []} emptyLabel="No risk rules yet." />
          </SectionCard>
          <SectionCard title="Pre-trade checklist" icon={<ClipboardCheck className="h-4 w-4" />}>
            {pb.data.checklists.length === 0 ? (
              <p className="text-xs text-muted-foreground">No checklist yet. Add one from the Edit view.</p>
            ) : (
              <div className="space-y-4">
                {pb.data.checklists.map((cl: any) => (
                  <div key={cl.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      {cl.name}
                      <Badge variant="outline" className="text-[10px]">{(cl.items ?? []).length}</Badge>
                    </div>
                    <ul className="space-y-1">
                      {(cl.items ?? []).map((it: any) => (
                        <li key={it.id} className="flex items-center gap-2 text-sm">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
                          <span className="flex-1">{it.label}</span>
                          {(it.required || requiredIds.has(it.id)) ? (
                            <Badge variant="outline" className="text-[10px] text-warning">Required</Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard title="Common mistakes" description="Log the errors you want to catch before they cost you." icon={<AlertTriangle className="h-4 w-4" />}>
            <MistakesEditor strategyId={strategy.id} initial={mistakes} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="examples">
          {stats.isPending ? (
            <div className="h-64 animate-pulse rounded-2xl border border-border/50 bg-card/40" />
          ) : (
            <ExamplesPanel stats={stats.data!} />
          )}
        </TabsContent>

        <TabsContent value="evolution">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[7, 30, 90, 180].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRange(d)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${range === d ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
              >
                {d}d
              </button>
            ))}
          </div>
          {evo.isPending ? (
            <div className="h-64 animate-pulse rounded-2xl border border-border/50 bg-card/40" />
          ) : (
            <EvolutionPanel evo={evo.data!} rangeDays={range} />
          )}
        </TabsContent>

        <TabsContent value="ai">
          <AiInsightsPlaceholder />
        </TabsContent>
      </Tabs>

      <ChecklistRunner
        strategyId={id}
        open={runOpen}
        onOpenChange={setRunOpen}
        context="manual"
      />
    </div>
  );
}

function StatChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function RuleReadOnly({ items, emptyLabel }: { items: any[]; emptyLabel: string }) {
  if (!items || items.length === 0) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((r: any, i: number) => (
        <li key={r?.id ?? i} className="flex items-start gap-2 text-sm">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
          <span>{typeof r === "string" ? r : r?.text ?? r?.label ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}
