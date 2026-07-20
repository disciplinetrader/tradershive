import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity, Bell, Database, LayoutGrid, ListChecks, Play, RefreshCw,
  ShieldCheck, TriangleAlert, X, Pause, RotateCw, Settings2, Sparkles,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  listHistoricalSources, listHistoricalSymbols, listHistoricalJobs,
  getHistoricalHealth, runHistoricalImport, toggleHistoricalSymbol,
  runIncrementalSync, getImportQueue, getCoverageMatrix,
  bulkHistoricalImport, cancelImportJob, pauseImportJob, resumeImportJob,
  retryImportJob, updateSymbolMetadata, listAdminNotifications,
  markNotificationRead, bulkToggleSymbols,
} from "@/lib/market-data/historical.functions";

export const Route = createFileRoute("/_authenticated/admin/historical")({
  component: HistoricalAdminPage,
});

const TFS = ["1m","5m","15m","30m","1H","4H","1D","1W","1M"] as const;

function HistoricalAdminPage() {
  const qc = useQueryClient();
  const symbolsFn = useServerFn(listHistoricalSymbols);
  const sourcesFn = useServerFn(listHistoricalSources);
  const jobsFn = useServerFn(listHistoricalJobs);
  const healthFn = useServerFn(getHistoricalHealth);
  const importFn = useServerFn(runHistoricalImport);
  const toggleFn = useServerFn(toggleHistoricalSymbol);
  const syncFn = useServerFn(runIncrementalSync);
  const queueFn = useServerFn(getImportQueue);
  const coverageFn = useServerFn(getCoverageMatrix);
  const bulkFn = useServerFn(bulkHistoricalImport);
  const bulkToggleFn = useServerFn(bulkToggleSymbols);
  const cancelFn = useServerFn(cancelImportJob);
  const pauseFn = useServerFn(pauseImportJob);
  const resumeFn = useServerFn(resumeImportJob);
  const retryFn = useServerFn(retryImportJob);
  const notifFn = useServerFn(listAdminNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const updateMetaFn = useServerFn(updateSymbolMetadata);

  const symbols = useQuery({ queryKey: ["hist","symbols"], queryFn: () => symbolsFn() });
  const sources = useQuery({ queryKey: ["hist","sources"], queryFn: () => sourcesFn() });
  const jobs = useQuery({ queryKey: ["hist","jobs"], queryFn: () => jobsFn(), refetchInterval: 4000 });
  const health = useQuery({ queryKey: ["hist","health"], queryFn: () => healthFn(), refetchInterval: 10000 });
  const queue = useQuery({ queryKey: ["hist","queue"], queryFn: () => queueFn(), refetchInterval: 2000 });
  const coverage = useQuery({ queryKey: ["hist","coverage"], queryFn: () => coverageFn(), refetchInterval: 15000 });
  const notifs = useQuery({ queryKey: ["hist","notifs"], queryFn: () => notifFn(), refetchInterval: 15000 });

  const [tf, setTf] = useState<(typeof TFS)[number]>("1D");
  const [days, setDays] = useState<number>(365);
  const [bulkMarket, setBulkMarket] = useState<string>("all");
  const [editSymbol, setEditSymbol] = useState<any | null>(null);

  const importMut = useMutation({
    mutationFn: (symbolId: string) => importFn({
      data: { symbolId, timeframe: tf, from: Date.now() - days * 86400_000, to: Date.now(), aggregate: true },
    }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r?.inserted ?? 0} candles (${r?.aggregated ?? 0} aggregated)`);
      qc.invalidateQueries({ queryKey: ["hist"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
  });

  const bulkMut = useMutation({
    mutationFn: () => bulkFn({
      data: {
        market: bulkMarket === "all" ? undefined : bulkMarket,
        timeframe: tf, days, aggregate: true,
      },
    }),
    onSuccess: (r: any) => {
      toast.success(`Bulk import complete: ${r?.ok ?? 0} ok, ${r?.failed ?? 0} failed`);
      qc.invalidateQueries({ queryKey: ["hist"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk import failed"),
  });

  const bulkToggleMut = useMutation({
    mutationFn: (enable: boolean) => bulkToggleFn({
      data: { market: bulkMarket === "all" ? undefined : bulkMarket, enable },
    }),
    onSuccess: (r: any, enable) => {
      toast.success(`${enable ? "Enabled" : "Disabled"} ${r?.affected ?? 0} symbols`);
      qc.invalidateQueries({ queryKey: ["hist","symbols"] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hist","symbols"] }),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Incremental sync queued");
      qc.invalidateQueries({ queryKey: ["hist"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const jobMut = (fn: (id: string) => Promise<unknown>, label: string) =>
    useMutation({
      mutationFn: (id: string) => fn(id),
      onSuccess: () => { toast.success(label); qc.invalidateQueries({ queryKey: ["hist"] }); },
      onError: (e: any) => toast.error(e?.message ?? `${label} failed`),
    });

  const cancelMut = jobMut((id) => cancelFn({ data: { jobId: id } }), "Job cancelled");
  const pauseMut = jobMut((id) => pauseFn({ data: { jobId: id } }), "Job paused");
  const resumeMut = jobMut((id) => resumeFn({ data: { jobId: id } }), "Job resumed");
  const retryMut = jobMut((id) => retryFn({ data: { jobId: id } }), "Job retrying");

  const markReadMut = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hist","notifs"] }),
  });

  const rows = (symbols.data ?? []) as any[];
  const h = health.data;
  const markets = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.market));
    return ["all", ...Array.from(set)];
  }, [rows]);
  const unreadNotifs = (notifs.data ?? []).filter((n: any) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database className="h-5 w-5" /> Historical Market Data
          </h1>
          <p className="text-sm text-muted-foreground">
            Enterprise-grade OHLCV storage · powers Replay Studio, backtests, and AI analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={h && h.healthScore >= 90 ? "default" : h && h.healthScore >= 70 ? "secondary" : "destructive"}>
            Health {h?.healthScore ?? "…"}%
          </Badge>
          {unreadNotifs > 0 ? (
            <Badge variant="destructive"><Bell className="mr-1 h-3 w-3" /> {unreadNotifs}</Badge>
          ) : null}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <KPI label="Tracked Symbols" value={h?.symbols ?? "…"} icon={ShieldCheck} />
        <KPI label="Stored Candles" value={(h?.candles ?? 0).toLocaleString()} icon={Database} />
        <KPI label="Open Gaps" value={h?.openGaps ?? "…"} icon={TriangleAlert} />
        <KPI label="Warnings" value={h?.warnings ?? 0} icon={Sparkles} />
        <KPI label="Success Rate" value={`${h?.successRate ?? 0}%`} icon={Activity} />
        <KPI label="Avg Provider" value={`${h?.avgProviderMs ?? 0}ms`} icon={Activity} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><LayoutGrid className="mr-1 h-3 w-3" />Overview</TabsTrigger>
          <TabsTrigger value="queue"><ListChecks className="mr-1 h-3 w-3" />Queue {queue.data?.active?.length ? `(${queue.data.active.length})` : ""}</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="symbols">Symbols</TabsTrigger>
          <TabsTrigger value="notifications">
            Alerts {unreadNotifs ? `(${unreadNotifs})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* -------- OVERVIEW -------- */}
        <TabsContent value="overview" className="space-y-3">
          <GlassCard className="p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bulk / Download Manager
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Market">
                <Select value={bulkMarket} onValueChange={setBulkMarket}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {markets.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Timeframe">
                <Select value={tf} onValueChange={(v) => setTf(v as any)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{TFS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Range (days)">
                <Input type="number" className="w-28" value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} />
              </Field>
              <Button onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}>
                <Play className="mr-1 h-3 w-3" /> Bulk Import
              </Button>
              <Button variant="outline" onClick={() => bulkToggleMut.mutate(true)}>Enable All</Button>
              <Button variant="outline" onClick={() => bulkToggleMut.mutate(false)}>Disable All</Button>
            </div>
          </GlassCard>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Jobs</h2>
            <JobsTable
              jobs={(jobs.data ?? []).slice(0, 30)}
              onCancel={(id) => cancelMut.mutate(id)}
              onPause={(id) => pauseMut.mutate(id)}
              onResume={(id) => resumeMut.mutate(id)}
              onRetry={(id) => retryMut.mutate(id)}
            />
          </div>
        </TabsContent>

        {/* -------- QUEUE -------- */}
        <TabsContent value="queue" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPI label="Active" value={queue.data?.active?.length ?? 0} icon={Activity} />
            <KPI label="Completed (24h)" value={queue.data?.completedToday ?? 0} icon={ShieldCheck} />
            <KPI label="Failed (24h)" value={queue.data?.failedToday ?? 0} icon={TriangleAlert} />
            <KPI label="Last Sync" value={h?.lastSuccessfulSync ? new Date(h.lastSuccessfulSync).toLocaleTimeString() : "—"} icon={RefreshCw} />
          </div>
          <GlassCard className="p-0 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">TF</th>
                  <th className="px-3 py-2 text-left">Phase</th>
                  <th className="px-3 py-2 text-left w-[200px]">Progress</th>
                  <th className="px-3 py-2 text-right">Retries</th>
                  <th className="px-3 py-2 text-right">Priority</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(queue.data?.active ?? []).map((j: any) => (
                  <tr key={j.id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-medium">{j.symbol}</td>
                    <td className="px-3 py-2">{j.timeframe}</td>
                    <td className="px-3 py-2"><PhaseBadge phase={j.phase} /></td>
                    <td className="px-3 py-2"><Progress value={j.progress ?? 0} className="h-2" /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{j.retry_count ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{j.priority ?? 100}</td>
                    <td className="px-3 py-2 text-right space-x-1">
                      {j.phase === "paused" ? (
                        <Button size="sm" variant="outline" onClick={() => resumeMut.mutate(j.id)}>
                          <Play className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => pauseMut.mutate(j.id)}>
                          <Pause className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(j.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(queue.data?.active ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No active jobs.</td></tr>
                ) : null}
              </tbody>
            </table>
          </GlassCard>
        </TabsContent>

        {/* -------- COVERAGE -------- */}
        <TabsContent value="coverage">
          <GlassCard className="p-0 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">TF</th>
                  <th className="px-3 py-2 text-right">Candles</th>
                  <th className="px-3 py-2 text-left">Earliest</th>
                  <th className="px-3 py-2 text-left">Latest</th>
                  <th className="px-3 py-2 text-right">Open Gaps</th>
                  <th className="px-3 py-2 text-left">Providers</th>
                </tr>
              </thead>
              <tbody>
                {(coverage.data ?? []).map((row: any, i: number) => (
                  <tr key={`${row.symbol}-${row.timeframe}-${i}`} className="border-t border-border/40">
                    <td className="px-3 py-2 font-medium">{row.symbol}</td>
                    <td className="px-3 py-2">{row.timeframe}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(row.candle_count ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.earliest_ts ? new Date(row.earliest_ts).toISOString().slice(0,10) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.latest_ts ? new Date(row.latest_ts).toISOString().slice(0,10) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.open_gaps ? <Badge variant="destructive">{row.open_gaps}</Badge> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-3 py-2 uppercase text-muted-foreground">
                      {(row.providers ?? []).join(", ")}
                    </td>
                  </tr>
                ))}
                {(coverage.data ?? []).length === 0 && !coverage.isPending ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No coverage data yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </GlassCard>
        </TabsContent>

        {/* -------- SYMBOLS -------- */}
        <TabsContent value="symbols">
          <GlassCard className="p-0 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Market</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Coverage</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-medium">{s.symbol}</td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{s.market}</td>
                    <td className="px-3 py-2 uppercase text-muted-foreground">{s.source_code}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.earliest_available ? new Date(s.earliest_available).toISOString().slice(0,10) : "—"}
                      {" → "}
                      {s.latest_imported ? new Date(s.latest_imported).toISOString().slice(0,10) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={s.is_enabled ? "default" : "secondary"}>
                        {s.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <Button size="sm" variant="outline"
                        disabled={importMut.isPending}
                        onClick={() => importMut.mutate(s.id)}>
                        <Play className="mr-1 h-3 w-3" /> Import
                      </Button>
                      <Button size="sm" variant="ghost"
                        disabled={syncMut.isPending}
                        onClick={() => syncMut.mutate(s.id)}>
                        <RefreshCw className="mr-1 h-3 w-3" /> Sync
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditSymbol(s)}>
                        <Settings2 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => toggleMut.mutate({ id: s.id, is_enabled: !s.is_enabled })}>
                        {s.is_enabled ? "Disable" : "Enable"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !symbols.isPending ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No symbols configured.</td></tr>
                ) : null}
              </tbody>
            </table>
          </GlassCard>
        </TabsContent>

        {/* -------- NOTIFICATIONS -------- */}
        <TabsContent value="notifications">
          <GlassCard className="p-0 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Severity</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Message</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(notifs.data ?? []).map((n: any) => (
                  <tr key={n.id} className={`border-t border-border/40 ${n.read_at ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(n.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <Badge variant={n.severity === "error" ? "destructive" : n.severity === "warn" ? "secondary" : "default"}>
                        {n.severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">{n.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{n.message}</td>
                    <td className="px-3 py-2 text-right">
                      {!n.read_at ? (
                        <Button size="sm" variant="ghost" onClick={() => markReadMut.mutate(n.id)}>Mark read</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {(notifs.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No notifications.</td></tr>
                ) : null}
              </tbody>
            </table>
          </GlassCard>
        </TabsContent>
      </Tabs>

      <SymbolMetadataDialog
        symbol={editSymbol}
        onClose={() => setEditSymbol(null)}
        onSave={async (patch) => {
          if (!editSymbol) return;
          await updateMetaFn({ data: { id: editSymbol.id, patch } });
          toast.success("Symbol updated");
          setEditSymbol(null);
          qc.invalidateQueries({ queryKey: ["hist","symbols"] });
        }}
      />
    </div>
  );
}

function JobsTable({
  jobs, onCancel, onPause, onResume, onRetry,
}: {
  jobs: any[];
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <GlassCard className="p-0 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Symbol</th>
            <th className="px-3 py-2 text-left">TF</th>
            <th className="px-3 py-2 text-left">Phase</th>
            <th className="px-3 py-2 text-right">Fetched</th>
            <th className="px-3 py-2 text-right">Inserted</th>
            <th className="px-3 py-2 text-right">Gaps</th>
            <th className="px-3 py-2 text-right">Duration</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j: any) => (
            <tr key={j.id} className="border-t border-border/40">
              <td className="px-3 py-2 text-muted-foreground">{new Date(j.created_at).toLocaleTimeString()}</td>
              <td className="px-3 py-2">{j.symbol}</td>
              <td className="px-3 py-2">{j.timeframe}</td>
              <td className="px-3 py-2"><PhaseBadge phase={j.phase ?? j.status} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{j.candles_fetched ?? 0}</td>
              <td className="px-3 py-2 text-right tabular-nums">{j.candles_inserted ?? 0}</td>
              <td className="px-3 py-2 text-right tabular-nums">{j.gaps_detected ?? 0}</td>
              <td className="px-3 py-2 text-right tabular-nums">{j.duration_ms ? `${Math.round(j.duration_ms / 100) / 10}s` : "—"}</td>
              <td className="px-3 py-2 text-right space-x-1">
                {["queued","preparing","downloading","validating","aggregating","saving"].includes(j.phase) ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => onPause(j.id)}><Pause className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => onCancel(j.id)}><X className="h-3 w-3" /></Button>
                  </>
                ) : null}
                {j.phase === "paused" ? (
                  <Button size="sm" variant="outline" onClick={() => onResume(j.id)}><Play className="h-3 w-3" /></Button>
                ) : null}
                {(j.phase === "failed" || j.status === "failed") ? (
                  <Button size="sm" variant="outline" onClick={() => onRetry(j.id)}><RotateCw className="mr-1 h-3 w-3" />Retry</Button>
                ) : null}
              </td>
            </tr>
          ))}
          {jobs.length === 0 ? (
            <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No jobs yet.</td></tr>
          ) : null}
        </tbody>
      </table>
    </GlassCard>
  );
}

function PhaseBadge({ phase }: { phase?: string }) {
  const p = phase ?? "queued";
  const variant: "default" | "secondary" | "destructive" =
    p === "completed" || p === "success" ? "default"
    : p === "failed" || p === "cancelled" ? "destructive"
    : "secondary";
  return <Badge variant={variant} className="capitalize">{p}</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function KPI({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums">{value}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function SymbolMetadataDialog({
  symbol, onClose, onSave,
}: {
  symbol: any | null;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [tickSize, setTickSize] = useState<string>("");
  const [pipValue, setPipValue] = useState<string>("");
  const [lotSize, setLotSize] = useState<string>("");
  const [precision, setPrecision] = useState<string>("");
  const [exchange, setExchange] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");
  const [instrumentType, setInstrumentType] = useState<string>("");

  // Sync when a different symbol is opened
  useEffect(() => {
    if (!symbol) return;
    setTickSize(symbol.tick_size?.toString() ?? "");
    setPipValue(symbol.pip_value?.toString() ?? "");
    setLotSize(symbol.lot_size?.toString() ?? "");
    setPrecision(symbol.price_precision?.toString() ?? "");
    setExchange(symbol.exchange ?? "");
    setTimezone(symbol.timezone ?? "");
    setInstrumentType(symbol.instrument_type ?? "");
  }, [symbol?.id, symbol]);

  return (
    <Dialog open={!!symbol} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit metadata · {symbol?.symbol}</DialogTitle>
          <DialogDescription>
            Update instrument specifications used by charts, position sizing and session logic.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Tick Size</Label><Input value={tickSize} onChange={(e) => setTickSize(e.target.value)} placeholder="0.01" /></div>
          <div className="space-y-1"><Label>Pip Value</Label><Input value={pipValue} onChange={(e) => setPipValue(e.target.value)} placeholder="10" /></div>
          <div className="space-y-1"><Label>Lot Size</Label><Input value={lotSize} onChange={(e) => setLotSize(e.target.value)} placeholder="100000" /></div>
          <div className="space-y-1"><Label>Price Precision</Label><Input value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="5" /></div>
          <div className="space-y-1"><Label>Exchange</Label><Input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="BINANCE" /></div>
          <div className="space-y-1"><Label>Timezone</Label><Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" /></div>
          <div className="space-y-1 col-span-2"><Label>Instrument Type</Label><Input value={instrumentType} onChange={(e) => setInstrumentType(e.target.value)} placeholder="crypto / forex / cfd / stock" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({
            tick_size: tickSize ? Number(tickSize) : null,
            pip_value: pipValue ? Number(pipValue) : null,
            lot_size: lotSize ? Number(lotSize) : null,
            price_precision: precision ? Number(precision) : null,
            exchange: exchange || null,
            timezone: timezone || null,
            instrument_type: instrumentType || null,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
