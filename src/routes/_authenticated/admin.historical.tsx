import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, Database, Play, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  listHistoricalSources, listHistoricalSymbols, listHistoricalJobs,
  getHistoricalHealth, runHistoricalImport, toggleHistoricalSymbol,
  runIncrementalSync,
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

  const symbols = useQuery({ queryKey: ["hist","symbols"], queryFn: () => symbolsFn() });
  const sources = useQuery({ queryKey: ["hist","sources"], queryFn: () => sourcesFn() });
  const jobs = useQuery({ queryKey: ["hist","jobs"], queryFn: () => jobsFn(), refetchInterval: 5000 });
  const health = useQuery({ queryKey: ["hist","health"], queryFn: () => healthFn(), refetchInterval: 10000 });

  const [tf, setTf] = useState<(typeof TFS)[number]>("1D");
  const [days, setDays] = useState<number>(365);

  const importMut = useMutation({
    mutationFn: (symbolId: string) => importFn({
      data: { symbolId, timeframe: tf, from: Date.now() - days * 86400_000, to: Date.now(), aggregate: true }
    }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r?.inserted ?? 0} candles (${r?.aggregated ?? 0} aggregated)`);
      qc.invalidateQueries({ queryKey: ["hist"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
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

  const rows = (symbols.data ?? []) as any[];
  const h = health.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Database className="h-5 w-5" /> Historical Market Data
        </h1>
        <p className="text-sm text-muted-foreground">
          Download, validate, and serve historical OHLCV. Powers Replay Studio and backtesting.
        </p>
      </div>

      {/* Health */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Tracked Symbols" value={h?.symbols ?? "…"} icon={ShieldCheck} />
        <KPI label="Stored Candles" value={(h?.candles ?? 0).toLocaleString()} icon={Database} />
        <KPI label="Open Gaps" value={h?.openGaps ?? "…"} icon={TriangleAlert} />
        <KPI label="Success Rate" value={`${h?.successRate ?? 0}%`} icon={Activity} />
      </div>

      {/* Import controls */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Timeframe</label>
            <Select value={tf} onValueChange={(v) => setTf(v as any)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{TFS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Range (days back)</label>
            <Input type="number" className="w-28" value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} />
          </div>
        </div>
      </GlassCard>

      {/* Symbols */}
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

      {/* Jobs */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Jobs</h2>
        <GlassCard className="p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">TF</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-right">Fetched</th>
                <th className="px-3 py-2 text-right">Inserted</th>
                <th className="px-3 py-2 text-right">Gaps</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(jobs.data ?? []).slice(0, 25).map((j: any) => (
                <tr key={j.id} className="border-t border-border/40">
                  <td className="px-3 py-2 text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{j.symbol}</td>
                  <td className="px-3 py-2">{j.timeframe}</td>
                  <td className="px-3 py-2 uppercase text-muted-foreground">{j.source_code}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.candles_fetched}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.candles_inserted}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{j.gaps_detected}</td>
                  <td className="px-3 py-2">
                    <Badge variant={j.status === "success" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>
                      {j.status}
                    </Badge>
                    {j.error_message ? <div className="text-[10px] text-danger mt-0.5 truncate max-w-[220px]" title={j.error_message}>{j.error_message}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </div>
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
