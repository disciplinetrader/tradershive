import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BATTLE_TYPES, MARKETS, WIN_CONDITIONS, findMarket } from "@/lib/battle-arena/constants";
import { createBattle } from "@/lib/battle-arena.functions";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

const STEPS = ["Basics", "Market", "Risk", "Schedule", "Review"] as const;

function isoLocal(d: Date) {
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function CreateBattleWizard({ onCancel, onCreated }: { onCancel: () => void; onCreated: (battleId: string) => void }) {
  const fn = useServerFn(createBattle);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [form, setForm] = useState({
    name: "",
    description: "",
    visibility: "public" as "public" | "private",
    battle_type: "ffa5" as (typeof BATTLE_TYPES)[number]["value"],
    market: "crypto" as (typeof MARKETS)[number]["value"],
    allowed_symbols: [...MARKETS[0].symbols] as string[],
    starting_balance: 10000,
    max_risk_pct: 2,
    max_daily_loss_pct: 5,
    max_drawdown_pct: 10,
    max_trades: "",
    win_condition: "highest_pnl" as (typeof WIN_CONDITIONS)[number]["value"],
    target_value: "",
    start_at: isoLocal(in1h),
    end_at: isoLocal(in2h),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  const marketSymbols = useMemo(() => findMarket(form.market).symbols, [form.market]);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    try {
      const battle = await fn({
        data: {
          name: form.name,
          description: form.description || undefined,
          visibility: form.visibility,
          battle_type: form.battle_type,
          market: form.market,
          allowed_symbols: form.allowed_symbols,
          starting_balance: Number(form.starting_balance),
          max_risk_pct: Number(form.max_risk_pct),
          max_daily_loss_pct: Number(form.max_daily_loss_pct),
          max_drawdown_pct: Number(form.max_drawdown_pct),
          max_trades: form.max_trades ? Number(form.max_trades) : null,
          win_condition: form.win_condition,
          target_value: form.target_value ? Number(form.target_value) : null,
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
          timezone: form.timezone,
        },
      });
      toast.success("Battle created!");
      onCreated(battle.id);
    } catch (e: any) { toast.error(e?.message ?? "Failed to create battle"); }
    finally { setLoading(false); }
  };

  const canNext = () => {
    if (step === 0) return form.name.trim().length >= 3;
    if (step === 1) return form.allowed_symbols.length > 0;
    if (step === 3) return new Date(form.start_at) < new Date(form.end_at);
    return true;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-border/60 bg-card/40 p-6">
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div><Label>Battle name</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Friday Crypto Sprint" maxLength={80} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What is this battle about?" maxLength={500} rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Format</Label>
              <Select value={form.battle_type} onValueChange={(v) => set("battle_type", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BATTLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Visibility</Label>
                <Select value={form.visibility} onValueChange={(v) => set("visibility", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private (invite code)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>Market</Label>
            <Select value={form.market} onValueChange={(v) => { set("market", v as any); set("allowed_symbols", [...findMarket(v).symbols]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Allowed symbols</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {marketSymbols.map((s) => {
                const on = form.allowed_symbols.includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => set("allowed_symbols", on ? form.allowed_symbols.filter((x) => x !== s) : [...form.allowed_symbols, s])}
                    className={`rounded-lg border px-3 py-1 text-xs font-mono transition ${on ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40"}`}>
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Only these symbols may be traded during the battle.</p>
          </div>
          <div>
            <Label>Win condition</Label>
            <Select value={form.win_condition} onValueChange={(v) => set("win_condition", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WIN_CONDITIONS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.win_condition === "first_to_target" && (
            <div><Label>Target profit ($)</Label><Input type="number" value={form.target_value} onChange={(e) => set("target_value", e.target.value)} placeholder="500" /></div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Starting balance ($)</Label><Input type="number" value={form.starting_balance} onChange={(e) => set("starting_balance", Number(e.target.value))} /></div>
          <div><Label>Max risk per trade (%)</Label><Input type="number" step="0.1" value={form.max_risk_pct} onChange={(e) => set("max_risk_pct", Number(e.target.value))} /></div>
          <div><Label>Max daily loss (%)</Label><Input type="number" step="0.1" value={form.max_daily_loss_pct} onChange={(e) => set("max_daily_loss_pct", Number(e.target.value))} /></div>
          <div><Label>Max drawdown (%)</Label><Input type="number" step="0.1" value={form.max_drawdown_pct} onChange={(e) => set("max_drawdown_pct", Number(e.target.value))} /></div>
          <div className="col-span-2"><Label>Max trades (optional)</Label><Input type="number" value={form.max_trades} onChange={(e) => set("max_trades", e.target.value)} placeholder="Leave empty for unlimited" /></div>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} /></div>
          <div><Label>End</Label><Input type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} /></div>
          <div className="col-span-2"><Label>Timezone</Label><Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} /></div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2 text-sm">
          <Review label="Name" value={form.name} />
          <Review label="Format" value={BATTLE_TYPES.find((t) => t.value === form.battle_type)?.label ?? ""} />
          <Review label="Visibility" value={form.visibility} />
          <Review label="Market" value={findMarket(form.market).label} />
          <Review label="Symbols" value={form.allowed_symbols.join(", ")} />
          <Review label="Win condition" value={WIN_CONDITIONS.find((w) => w.value === form.win_condition)?.label ?? ""} />
          <Review label="Starting balance" value={`$${form.starting_balance}`} />
          <Review label="Risk / Daily / DD" value={`${form.max_risk_pct}% · ${form.max_daily_loss_pct}% · ${form.max_drawdown_pct}%`} />
          <Review label="Start" value={new Date(form.start_at).toLocaleString()} />
          <Review label="End" value={new Date(form.end_at).toLocaleString()} />
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />{step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext()} onClick={() => setStep(step + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
        ) : (
          <Button disabled={loading} onClick={submit}>{loading ? "Creating…" : "Create battle"}</Button>
        )}
      </div>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background/40 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
