import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMarketSettings, upsertMarketSettings } from "@/lib/market-data.functions";
import { toast } from "sonner";
import { marketData } from "@/lib/market-data/engine";

export const Route = createFileRoute("/_authenticated/market/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMarketSettings);
  const saveFn = useServerFn(upsertMarketSettings);
  const { data } = useQuery({ queryKey: ["market", "settings"], queryFn: () => getFn() });
  const [form, setForm] = useState({
    preferred_provider: "mock", preferred_timezone: "UTC", preferred_market: "forex" as any,
    default_symbol: "EURUSD", default_timeframe: "1H" as any, streaming_quality: "balanced" as any, auto_refresh_seconds: 5,
  });
  useEffect(() => { if (data) setForm((f) => ({ ...f, ...data as any })); }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Saved");
      marketData.setStrategy({ preferredProvider: form.preferred_provider ?? undefined });
      qc.invalidateQueries({ queryKey: ["market", "settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Market Settings" description="Your defaults follow you across Paper Trading, Charts, Replay and AI Coach." />
      <GlassCard className="p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Preferred provider">
            <Select value={form.preferred_provider ?? "mock"} onValueChange={(v) => setForm({ ...form, preferred_provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Development Mock</SelectItem>
                <SelectItem value="binance">Binance (crypto)</SelectItem>
                <SelectItem value="oanda">OANDA (forex)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Preferred market">
            <Select value={form.preferred_market} onValueChange={(v) => setForm({ ...form, preferred_market: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["forex","crypto","indices","metals","commodities","futures","stocks"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Default symbol"><Input value={form.default_symbol} onChange={(e) => setForm({ ...form, default_symbol: e.target.value.toUpperCase() })} /></Field>
          <Field label="Default timeframe">
            <Select value={form.default_timeframe} onValueChange={(v) => setForm({ ...form, default_timeframe: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["1m","3m","5m","15m","30m","1H","2H","4H","1D","1W","1M"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Preferred timezone"><Input value={form.preferred_timezone} onChange={(e) => setForm({ ...form, preferred_timezone: e.target.value })} /></Field>
          <Field label="Streaming quality">
            <Select value={form.streaming_quality} onValueChange={(v) => setForm({ ...form, streaming_quality: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="battery">Battery saver</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="realtime">Realtime</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Auto refresh (seconds)"><Input type="number" min={1} max={60} value={form.auto_refresh_seconds} onChange={(e) => setForm({ ...form, auto_refresh_seconds: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </GlassCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs uppercase text-muted-foreground">{label}</Label>{children}</div>;
}
