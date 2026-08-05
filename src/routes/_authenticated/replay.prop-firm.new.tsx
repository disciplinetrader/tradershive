import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createPropChallenge } from "@/lib/prop-challenges.functions";
import { listAccounts } from "@/lib/paper-trading.functions";
import { PROP_PRESETS, listPropPresets, type PropPresetId } from "@/lib/prop-challenges/presets";

export const Route = createFileRoute("/_authenticated/prop-challenges/new")({
  component: NewChallengePage,
});

function NewChallengePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createPropChallenge);
  const listAcc = useServerFn(listAccounts);
  const accounts = useQuery({ queryKey: ["paper-accounts"], queryFn: () => listAcc() });

  const [presetId, setPresetId] = useState<PropPresetId>("ftmo");
  const preset = PROP_PRESETS[presetId];
  const [form, setForm] = useState(() => ({
    name: `${preset.label} Attempt`,
    paper_account_id: "" as string,
    account_size: preset.account_size,
    currency: preset.currency,
    profit_target_pct: preset.profit_target_pct,
    max_daily_loss_pct: preset.max_daily_loss_pct,
    max_total_drawdown_pct: preset.max_total_drawdown_pct,
    min_trading_days: preset.min_trading_days,
    leverage: preset.leverage,
    duration_days: preset.duration_days,
    commission_per_lot: preset.commission_per_lot,
    spread_profile: preset.spread_profile,
    slippage_profile: preset.slippage_profile,
    weekend_hold_allowed: preset.weekend_hold_allowed,
    news_trading_allowed: preset.news_trading_allowed,
  }));

  function applyPreset(id: PropPresetId) {
    const p = PROP_PRESETS[id];
    setPresetId(id);
    setForm((f) => ({
      ...f,
      name: `${p.label} Attempt`,
      account_size: p.account_size,
      currency: p.currency,
      profit_target_pct: p.profit_target_pct,
      max_daily_loss_pct: p.max_daily_loss_pct,
      max_total_drawdown_pct: p.max_total_drawdown_pct,
      min_trading_days: p.min_trading_days,
      leverage: p.leverage,
      duration_days: p.duration_days,
      commission_per_lot: p.commission_per_lot,
      spread_profile: p.spread_profile,
      slippage_profile: p.slippage_profile,
      weekend_hold_allowed: p.weekend_hold_allowed,
      news_trading_allowed: p.news_trading_allowed,
    }));
  }

  const m = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      (create as unknown as (o: { data: unknown }) => Promise<{ id: string }>)({ data: payload }),
    onSuccess: (row) => {
      toast.success("Challenge created");
      qc.invalidateQueries({ queryKey: ["prop-challenges"] });
      navigate({ to: "/prop-challenges/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create challenge"),
  });

  const presets = useMemo(() => listPropPresets(), []);

  return (
    <div className="space-y-6">
      <PageHeader title="New prop firm challenge" description="Pick a preset or design a fully custom evaluation." />

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-medium">1 · Choose a preset</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => {
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border/40 bg-background/40 hover:border-primary/40"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{p.label}</div>
                  {active && <Badge variant="secondary">Selected</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.blurb}</div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h2 className="mb-3 text-sm font-medium">2 · Fine-tune the rules</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Challenge name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Linked paper account">
            <Select
              value={form.paper_account_id || "__none"}
              onValueChange={(v) => setForm({ ...form, paper_account_id: v === "__none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="None — track manually" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None — track manually</SelectItem>
                {(accounts.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <NumField label="Account size" value={form.account_size} step={1000} min={100}
            onChange={(v) => setForm({ ...form, account_size: v })} />
          <Field label="Currency">
            <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          </Field>
          <NumField label="Profit target %" value={form.profit_target_pct} step={0.5} min={0.1}
            onChange={(v) => setForm({ ...form, profit_target_pct: v })} />
          <NumField label="Max daily loss %" value={form.max_daily_loss_pct} step={0.5} min={0.1}
            onChange={(v) => setForm({ ...form, max_daily_loss_pct: v })} />
          <NumField label="Max overall drawdown %" value={form.max_total_drawdown_pct} step={0.5} min={0.1}
            onChange={(v) => setForm({ ...form, max_total_drawdown_pct: v })} />
          <NumField label="Min trading days" value={form.min_trading_days} step={1} min={0}
            onChange={(v) => setForm({ ...form, min_trading_days: v })} />
          <NumField label="Duration (days)" value={form.duration_days} step={1} min={1}
            onChange={(v) => setForm({ ...form, duration_days: v })} />
          <NumField label="Leverage" value={form.leverage} step={1} min={1}
            onChange={(v) => setForm({ ...form, leverage: v })} />
          <NumField label="Commission / lot" value={form.commission_per_lot} step={0.5} min={0}
            onChange={(v) => setForm({ ...form, commission_per_lot: v })} />
          <Field label="Spread profile">
            <Select value={form.spread_profile} onValueChange={(v) => setForm({ ...form, spread_profile: v as typeof form.spread_profile })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tight">Tight</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Slippage profile">
            <Select value={form.slippage_profile} onValueChange={(v) => setForm({ ...form, slippage_profile: v as typeof form.slippage_profile })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ToggleField label="Weekend hold allowed" value={form.weekend_hold_allowed}
            onChange={(v) => setForm({ ...form, weekend_hold_allowed: v })} />
          <ToggleField label="News trading allowed" value={form.news_trading_allowed}
            onChange={(v) => setForm({ ...form, news_trading_allowed: v })} />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate({ to: "/prop-challenges" })}>Cancel</Button>
          <Button
            disabled={m.isPending || !form.name.trim()}
            onClick={() => m.mutate({
              ...form,
              preset: presetId,
              paper_account_id: form.paper_account_id || null,
            })}
          >
            {m.isPending ? "Creating…" : "Start challenge"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, min = 0 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number" inputMode="decimal" step={step} min={min}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </Field>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 p-3">
      <Label className="text-xs">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
