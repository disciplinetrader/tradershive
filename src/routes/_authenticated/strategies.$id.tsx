import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import * as icons from "lucide-react";
import {
  ArrowLeft, Copy, Download, Save, Share2, Star, Trash2, Sparkles, Rocket, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RuleList } from "@/components/strategy/RuleList";
import { ChecklistEditor } from "@/components/strategy/ChecklistEditor";
import { VersionTimeline } from "@/components/strategy/VersionTimeline";
import { ExamplesPanel } from "@/components/strategy/ExamplesPanel";
import { FlowEditor } from "@/components/strategy/FlowEditor";
import { StatsCard } from "@/components/strategy/StatsCard";
import {
  deleteStrategy, duplicateStrategy, getStrategy, getStrategyStats,
  setStatus, toggleFavorite, upsertStrategy,
} from "@/lib/strategy.functions";
import { STRATEGY_STATUS } from "@/lib/strategy/constants";
import { toExportJSON, toMarkdown } from "@/lib/strategy/calculations";
import { useAuth } from "@/hooks/use-auth";
import type { Strategy } from "@/lib/strategy/types";
import { cn } from "@/lib/utils";
import { routeBoundaries } from "@/lib/route-boundaries";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/strategies/$id")({
  component: StrategyDetail,
  ...routeBoundaries({
    label: "Strategy",
    boundary: "strategy_detail_route",
    backHref: "/strategies",
    backLabel: "Back to Strategies",
  }),
});

function StrategyDetail() {
  const { id } = useParams({ from: "/_authenticated/strategies/$id" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const get = useServerFn(getStrategy);
  const save = useServerFn(upsertStrategy);
  const dup = useServerFn(duplicateStrategy);
  const del = useServerFn(deleteStrategy);
  const fav = useServerFn(toggleFavorite);
  const setS = useServerFn(setStatus);
  const getStats = useServerFn(getStrategyStats);

  const q = useQuery({ queryKey: ["strategy", id], queryFn: () => get({ data: { id } }) });
  const stats = useQuery({ queryKey: ["strategy", id, "stats"], queryFn: () => getStats({ data: { strategy_id: id } }) });

  const strategy = q.data?.strategy as unknown as Strategy | undefined;
  const checklists = q.data?.checklists ?? [];
  const examples = q.data?.examples ?? [];
  const versions = q.data?.versions ?? [];

  const [draft, setDraft] = useState<Strategy | null>(null);
  useEffect(() => { if (strategy) setDraft(strategy); }, [strategy?.id, strategy?.updated_at]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(strategy), [draft, strategy]);

  const saveMut = useMutation({
    mutationFn: async () => save({ data: { id, ...draft } as any }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["strategy", id] }); qc.invalidateQueries({ queryKey: ["strategies"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const dupMut = useMutation({ mutationFn: async () => dup({ data: { id } }), onSuccess: () => { toast.success("Duplicated"); qc.invalidateQueries({ queryKey: ["strategies"] }); } });
  const delMut = useMutation({
    mutationFn: async () => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); window.location.href = "/strategies/library"; },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete strategy"),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const favMut = useMutation({ mutationFn: async (v: boolean) => fav({ data: { id, value: v } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["strategy", id] }) });
  const statusMut = useMutation({
    mutationFn: async (s: string) => setS({ data: { id, status: s as any } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["strategy", id] }); },
  });

  if (q.isPending) return <div className="glass rounded-3xl h-[500px] animate-pulse" />;
  if (!strategy || !draft) return <div className="text-sm text-muted-foreground">Strategy not found.</div>;

  const Icon = ((icons as any)[strategy.icon] ?? icons.Sparkles) as React.ComponentType<{ className?: string }>;

  const download = (data: string, filename: string, type: string) => {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/strategies/library"><ArrowLeft className="mr-1 h-4 w-4" />Library</Link></Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center rounded-2xl p-3" style={{ background: `${strategy.color}22`, color: strategy.color }}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{strategy.name}</h1>
            <div className="text-xs text-muted-foreground">
              v{strategy.version} · <span className="uppercase">{strategy.status}</span> · updated {new Date(strategy.updated_at).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => favMut.mutate(!strategy.is_favorite)}>
            <Star className={cn("mr-1 h-4 w-4", strategy.is_favorite && "fill-warning text-warning")} />Favorite
          </Button>
          <select value={strategy.status} onChange={(e) => statusMut.mutate(e.target.value)} className="h-8 rounded-md border border-border/60 bg-background/40 px-2 text-xs">
            {STRATEGY_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => dupMut.mutate()}><Copy className="mr-1 h-4 w-4" />Duplicate</Button>
          <Button size="sm" variant="ghost" onClick={() => download(JSON.stringify(toExportJSON(strategy), null, 2), `${strategy.name}.json`, "application/json")}>
            <Download className="mr-1 h-4 w-4" />JSON
          </Button>
          <Button size="sm" variant="ghost" onClick={() => download(toMarkdown(strategy), `${strategy.name}.md`, "text/markdown")}>
            <Download className="mr-1 h-4 w-4" />MD
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)} className="text-danger hover:text-danger">
            <Trash2 className="mr-1 h-4 w-4" />Delete
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <StatsCard stats={stats.data ?? null} />

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap gap-1 bg-background/40 border border-border/60 rounded-xl p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
          <TabsTrigger value="flow">Flow</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 md:grid-cols-2">
          <GlassCard className="p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">Name</div>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div className="text-xs font-semibold text-muted-foreground">Description</div>
            <Textarea rows={4} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="text-xs font-semibold text-muted-foreground">Notes</div>
            <Textarea rows={4} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </GlassCard>

          <GlassCard className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Metadata</div>
            <div className="text-sm">Category: <span className="text-muted-foreground">{draft.category ?? "—"}</span></div>
            <div className="text-sm">Market: <span className="text-muted-foreground">{draft.market ?? "—"}</span></div>
            <div className="text-sm">Difficulty: <span className="text-muted-foreground">{draft.difficulty}</span></div>
            <div className="text-sm">Timeframes: <span className="text-muted-foreground">{draft.timeframes.join(", ") || "—"}</span></div>
            <div className="text-sm">Tags: <span className="text-muted-foreground">{draft.tags.join(", ") || "—"}</span></div>
            <div className="text-sm">Conditions: <span className="text-muted-foreground">{draft.market_conditions.join(", ") || "—"}</span></div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="rules" className="mt-4 grid gap-4 md:grid-cols-2">
          <GlassCard className="p-4"><RuleList label="Entry rules" rules={draft.entry_rules} onChange={(r) => setDraft({ ...draft, entry_rules: r })} /></GlassCard>
          <GlassCard className="p-4"><RuleList label="Exit rules" rules={draft.exit_rules} onChange={(r) => setDraft({ ...draft, exit_rules: r })} /></GlassCard>
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <GlassCard className="p-4">
            <RiskEditor value={draft.risk_rules} onChange={(v) => setDraft({ ...draft, risk_rules: v })} />
          </GlassCard>
        </TabsContent>

        <TabsContent value="management" className="mt-4">
          <GlassCard className="p-4">
            <ManagementEditor value={draft.trade_management} onChange={(v) => setDraft({ ...draft, trade_management: v })} />
          </GlassCard>
        </TabsContent>

        <TabsContent value="checklists" className="mt-4">
          <ChecklistEditor strategyId={id} initial={checklists as any} />
        </TabsContent>

        <TabsContent value="examples" className="mt-4">
          {user?.id ? <ExamplesPanel strategyId={id} initial={examples} userId={user.id} /> : null}
        </TabsContent>

        <TabsContent value="flow" className="mt-4">
          <FlowEditor strategyId={id} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <VersionTimeline strategyId={id} versions={versions as any} />
        </TabsContent>

      </Tabs>
    </div>
  );
}

function RiskEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const upd = (patch: any) => onChange({ ...(value ?? {}), ...patch });
  const num = (k: string, label: string, suffix?: string) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}{suffix ? ` (${suffix})` : ""}</label>
      <Input type="number" step="0.1" value={value?.[k] ?? ""} onChange={(e) => upd({ [k]: e.target.value === "" ? undefined : Number(e.target.value) })} />
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {num("max_risk_pct", "Max risk per trade", "%")}
      {num("min_rr", "Minimum R:R")}
      {num("max_trades_per_day", "Max trades / day")}
      {num("max_daily_loss_pct", "Max daily loss", "%")}
      {num("max_weekly_loss_pct", "Max weekly loss", "%")}
      <div className="md:col-span-2 space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Position sizing formula</label>
        <Input value={value?.position_sizing ?? ""} onChange={(e) => upd({ position_sizing: e.target.value })} />
      </div>
    </div>
  );
}

function ManagementEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const upd = (patch: any) => onChange({ ...(value ?? {}), ...patch });
  const box = (k: string, label: string) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Textarea rows={2} value={value?.[k] ?? ""} onChange={(e) => upd({ [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {box("move_stop_rules", "Move stop rules")}
      {box("trailing_logic", "Trailing stop logic")}
      {box("scale_in", "Scale in")}
      {box("scale_out", "Scale out")}
      <div className="md:col-span-2">{box("reentry_rules", "Re-entry rules")}</div>
    </div>
  );
}
