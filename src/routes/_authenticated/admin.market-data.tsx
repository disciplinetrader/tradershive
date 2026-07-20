import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listProviderConfigurations,
  listProviderDescriptors,
  saveProviderCredentials,
  deleteProviderCredentials,
  listMarketAssignments,
  setMarketAssignment,
  testProviderConnection,
  listProviderHealthChecks,
} from "@/lib/market-data/admin.functions";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Zap, Settings2, Trash2, PlugZap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/market-data")({
  component: AdminMarketDataPage,
});

const MARKETS = ["crypto","forex","indices","metals","commodities","futures","stocks"] as const;

function AdminMarketDataPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Market Data</h1>
        <p className="text-sm text-muted-foreground">
          Configure providers, assign them to markets, and monitor connection health.
        </p>
      </div>
      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="assignments">Market Assignments</TabsTrigger>
          <TabsTrigger value="health">Health History</TabsTrigger>
        </TabsList>
        <TabsContent value="providers"><ProvidersTab /></TabsContent>
        <TabsContent value="assignments"><AssignmentsTab /></TabsContent>
        <TabsContent value="health"><HealthTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- Providers -------------------------------- */

function ProvidersTab() {
  const qc = useQueryClient();
  const descFn = useServerFn(listProviderDescriptors);
  const cfgFn = useServerFn(listProviderConfigurations);
  const testFn = useServerFn(testProviderConnection);
  const [configuring, setConfiguring] = useState<string | null>(null);

  const { data: descriptors = [] } = useQuery({ queryKey: ["md","descriptors"], queryFn: () => descFn() });
  const { data: configs = [] } = useQuery({ queryKey: ["md","configs"], queryFn: () => cfgFn(), refetchInterval: 15_000 });

  const test = useMutation({
    mutationFn: (code: string) => testFn({ data: { providerCode: code } }),
    onSuccess: (r, code) => {
      if (r.ok) toast.success(`${code} OK (${r.latencyMs} ms)`);
      else toast.error(`${code} failed: ${r.error ?? "unknown error"}`);
      qc.invalidateQueries({ queryKey: ["md","configs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Test failed"),
  });

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {descriptors.map((d) => {
          const c = configs.find((x) => x.code === d.code);
          return (
            <GlassCard key={d.code} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{d.name}</span>
                    {d.comingSoon && <Badge variant="outline" className="text-[10px]">Coming soon</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                </div>
                <StatusPill configured={!!c?.configured} publicByDefault={d.publicByDefault} lastOk={c?.health.ok ?? null} />
              </div>
              <div className="flex flex-wrap gap-1">
                {d.markets.map((m) => <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>)}
              </div>
              {c?.health.lastAt && (
                <div className="text-[10px] text-muted-foreground">
                  Last check: {new Date(c.health.lastAt).toLocaleString()} · {c.health.latencyMs ?? "?"} ms
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={() => setConfiguring(d.code)}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" /> Configure
                </Button>
                <Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate(d.code)}>
                  <PlugZap className="mr-1 h-3.5 w-3.5" /> Test
                </Button>
              </div>
            </GlassCard>
          );
        })}
      </div>
      {configuring && (
        <ConfigureDialog
          providerCode={configuring}
          descriptor={descriptors.find((d) => d.code === configuring)!}
          onClose={() => setConfiguring(null)}
        />
      )}
    </>
  );
}

function StatusPill({ configured, publicByDefault, lastOk }: { configured: boolean; publicByDefault: boolean; lastOk: boolean | null }) {
  if (lastOk === true) return <Badge className="bg-success/15 text-success"><CheckCircle2 className="mr-1 h-3 w-3" />Connected</Badge>;
  if (lastOk === false) return <Badge className="bg-danger/15 text-danger"><AlertCircle className="mr-1 h-3 w-3" />Error</Badge>;
  if (configured || publicByDefault) return <Badge className="bg-primary/15 text-primary"><Zap className="mr-1 h-3 w-3" />Ready</Badge>;
  return <Badge variant="outline">Not configured</Badge>;
}

function ConfigureDialog({ providerCode, descriptor, onClose }: { providerCode: string; descriptor: any; onClose: () => void }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveProviderCredentials);
  const delFn = useServerFn(deleteProviderCredentials);
  const [values, setValues] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => saveFn({ data: { providerCode, values } }),
    onSuccess: () => { toast.success("Credentials saved."); qc.invalidateQueries({ queryKey: ["md","configs"] }); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });
  const clear = useMutation({
    mutationFn: () => delFn({ data: { providerCode } }),
    onSuccess: () => { toast.success("Credentials cleared."); qc.invalidateQueries({ queryKey: ["md","configs"] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Configure {descriptor.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {descriptor.credentials.length === 0 && (
            <p className="text-xs text-muted-foreground">This provider does not require any credentials.</p>
          )}
          {descriptor.credentials.map((f: any) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}{f.required && <span className="text-danger"> *</span>}</Label>
              {f.type === "select" ? (
                <Select value={values[f.key] ?? ""} onValueChange={(v) => setValues({ ...values, [f.key]: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    {f.options?.map((o: any) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "password" ? "password" : "text"}
                  placeholder={f.placeholder ?? "Leave blank to keep existing"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
              {f.help && <p className="text-[10px] text-muted-foreground">{f.help}</p>}
            </div>
          ))}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear all
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Assignments -------------------------------- */

function AssignmentsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMarketAssignments);
  const setFn = useServerFn(setMarketAssignment);
  const cfgFn = useServerFn(listProviderConfigurations);

  const { data: assignments = [] } = useQuery({ queryKey: ["md","assignments"], queryFn: () => listFn() });
  const { data: configs = [] } = useQuery({ queryKey: ["md","configs"], queryFn: () => cfgFn() });

  const providersFor = (market: string) =>
    configs.filter((c) => c.markets.includes(market as any));

  const save = useMutation({
    mutationFn: (v: { market: any; primaryCode: string | null; fallbackCode: string | null }) => setFn({ data: v }),
    onSuccess: () => { toast.success("Assignment saved. Reload for the engine to pick it up."); qc.invalidateQueries({ queryKey: ["md","assignments"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const rows = useMemo(() => {
    return MARKETS.map((m) => {
      const a = assignments.find((x) => x.market_kind === m);
      return { market: m, primary: a?.primary_code ?? null, fallback: a?.fallback_code ?? null };
    });
  }, [assignments]);

  return (
    <GlassCard className="p-4">
      <div className="mb-3 text-sm font-semibold">Provider assignments per market</div>
      <div className="grid gap-3">
        {rows.map((r) => {
          const opts = providersFor(r.market);
          return (
            <div key={r.market} className="grid items-center gap-2 rounded-lg border border-border/60 bg-card/30 p-3 md:grid-cols-[110px_1fr_1fr_auto]">
              <div className="text-sm font-semibold capitalize">{r.market}</div>
              <ProviderPicker
                label="Primary"
                value={r.primary}
                onChange={(v) => save.mutate({ market: r.market, primaryCode: v, fallbackCode: r.fallback })}
                options={opts}
              />
              <ProviderPicker
                label="Fallback"
                value={r.fallback}
                onChange={(v) => save.mutate({ market: r.market, primaryCode: r.primary, fallbackCode: v })}
                options={opts}
              />
              <div className="text-[10px] text-muted-foreground">{opts.length} available</div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function ProviderPicker({ label, value, onChange, options }:
  { label: string; value: string | null; onChange: (v: string | null) => void; options: { code: string; name: string; configured: boolean }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
        <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {options.map((p) => (
            <SelectItem key={p.code} value={p.code}>
              {p.name} {p.configured ? "" : "· not configured"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* --------------------------------- Health --------------------------------- */

function HealthTab() {
  const fn = useServerFn(listProviderHealthChecks);
  const { data = [] } = useQuery({ queryKey: ["md","health"], queryFn: () => fn({ data: { limit: 100 } }), refetchInterval: 15_000 });
  return (
    <GlassCard className="p-4">
      <div className="mb-3 text-sm font-semibold">Recent health checks</div>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No health checks yet. Run "Test" on a provider to record one.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="[&>th]:py-2 [&>th]:pr-4"><th>When</th><th>Provider</th><th>Result</th><th>Latency</th><th>Error</th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.map((h: any) => (
                <tr key={h.id} className="[&>td]:py-2 [&>td]:pr-4">
                  <td className="text-xs text-muted-foreground">{new Date(h.checked_at).toLocaleString()}</td>
                  <td className="font-semibold">{h.provider_code}</td>
                  <td>{h.ok ? <span className="text-success">OK</span> : <span className="text-danger">Failed</span>}</td>
                  <td className="text-xs">{h.latency_ms ?? "—"} ms</td>
                  <td className="text-xs text-muted-foreground">{h.error_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
