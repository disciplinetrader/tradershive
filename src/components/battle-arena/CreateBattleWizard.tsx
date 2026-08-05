import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BATTLE_TYPES, MARKETS, WIN_CONDITIONS, findMarket } from "@/lib/battle-arena/constants";
import { createBattle } from "@/lib/battle-arena.functions";
import { ChevronLeft, ChevronRight, Check, Trophy, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STEPS = ["Basics", "Market", "Risk & Rules", "Schedule", "Review"] as const;

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
    ranked: false,
    battle_type: "ffa5" as (typeof BATTLE_TYPES)[number]["value"],
    market: "crypto" as (typeof MARKETS)[number]["value"],
    allowed_symbols: [...MARKETS[0].symbols] as string[],
    starting_balance: 10000,
    min_participants: 2,
    max_participants: 10,
    max_risk_pct: 2,
    max_daily_loss_pct: 5,
    max_drawdown_pct: 10,
    profit_target_pct: 10,
    max_trades: "",
    max_open_positions: 5,
    win_condition: "highest_pnl" as (typeof WIN_CONDITIONS)[number]["value"],
    target_value: "",
    start_at: isoLocal(in1h),
    end_at: isoLocal(in2h),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    allow_late_join: false,
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
          ranked: form.ranked,
          battle_type: form.battle_type,
          market: form.market,
          allowed_symbols: form.allowed_symbols,
          starting_balance: Number(form.starting_balance),
          min_participants: Number(form.min_participants),
          max_participants: Number(form.max_participants),
          max_risk_pct: Number(form.max_risk_pct),
          max_daily_loss_pct: Number(form.max_daily_loss_pct),
          max_drawdown_pct: Number(form.max_drawdown_pct),
          profit_target_pct: Number(form.profit_target_pct),
          max_trades: form.max_trades ? Number(form.max_trades) : null,
          max_open_positions: Number(form.max_open_positions),
          win_condition: form.win_condition,
          target_value: form.target_value ? Number(form.target_value) : null,
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
          timezone: form.timezone,
          allow_late_join: form.allow_late_join,
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
    <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-border/60 bg-card/40 p-8 shadow-xl shadow-background/20 animate-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between gap-4 pb-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-bold transition-all ${i <= step ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground"}`}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-xs uppercase tracking-wider hidden md:block ${i === step ? "font-black text-primary" : "font-bold text-muted-foreground/60"}`}>{label}</span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border/40 mx-2 hidden md:block" />}
          </div>
        ))}
      </div>

      <div className="min-h-[300px] py-2">
        {step === 0 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Arena Match name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Friday Crypto Sprint" className="h-11 rounded-xl bg-background/50" maxLength={80} />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Description</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What are the conditions of this arena match?" className="rounded-xl bg-background/50 min-h-[80px]" maxLength={500} rows={3} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold uppercase tracking-wide">Battle Type</Label>
                <Select value={form.battle_type} onValueChange={(v) => set("battle_type", v as any)}>
                  <SelectTrigger className="h-11 rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">{BATTLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-background/30 transition-colors hover:border-primary/50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Trophy className={`h-4 w-4 ${form.ranked ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                    <Label className="font-bold cursor-pointer">Ranked Battle</Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Affects ELO Rating</p>
                </div>
                <Switch checked={form.ranked} onCheckedChange={(v) => set("ranked", v)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold uppercase tracking-wide">Visibility</Label>
                <Select value={form.visibility} onValueChange={(v) => set("visibility", v as any)}>
                  <SelectTrigger className="h-11 rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private (Invite Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/60 bg-background/30">
                <div className="space-y-0.5">
                  <Label className="font-bold cursor-pointer">Late Join</Label>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Allow joins after start</p>
                </div>
                <Switch checked={form.allow_late_join} onCheckedChange={(v) => set("allow_late_join", v)} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Market Sector</Label>
              <Select value={form.market} onValueChange={(v) => { set("market", v as any); set("allowed_symbols", [...findMarket(v).symbols]); }}>
                <SelectTrigger className="h-11 rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">{MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Allowed Symbols</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {marketSymbols.map((s) => {
                  const on = form.allowed_symbols.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => set("allowed_symbols", on ? form.allowed_symbols.filter((x) => x !== s) : [...form.allowed_symbols, s])}
                      className={`rounded-xl border px-4 py-2 text-xs font-bold transition-all duration-200 ${on ? "border-primary bg-primary shadow-lg shadow-primary/20 text-primary-foreground" : "border-border/60 text-muted-foreground bg-background/30 hover:border-primary/40"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Win Condition</Label>
              <Select value={form.win_condition} onValueChange={(v) => set("win_condition", v as any)}>
                <SelectTrigger className="h-11 rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">{WIN_CONDITIONS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Starting balance ($)</Label>
              <Input type="number" value={form.starting_balance} onChange={(e) => set("starting_balance", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Profit Target (%)</Label>
              <Input type="number" value={form.profit_target_pct} onChange={(e) => set("profit_target_pct", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Max Risk Per Trade (%)</Label>
              <Input type="number" step="0.1" value={form.max_risk_pct} onChange={(e) => set("max_risk_pct", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Max Drawdown (%)</Label>
              <Input type="number" step="0.1" value={form.max_drawdown_pct} onChange={(e) => set("max_drawdown_pct", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Max Open Positions</Label>
              <Input type="number" value={form.max_open_positions} onChange={(e) => set("max_open_positions", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Max Trades (optional)</Label>
              <Input type="number" value={form.max_trades} onChange={(e) => set("max_trades", e.target.value)} placeholder="Unlimited" className="h-11 rounded-xl bg-background/50" />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Min Participants</Label>
              <Input type="number" value={form.min_participants} onChange={(e) => set("min_participants", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Max Participants</Label>
              <Input type="number" value={form.max_participants} onChange={(e) => set("max_participants", Number(e.target.value))} className="h-11 rounded-xl bg-background/50" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold uppercase tracking-wide">Start Date & Time</Label>
                <Input type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} className="h-11 rounded-xl bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold uppercase tracking-wide">End Date & Time</Label>
                <Input type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} className="h-11 rounded-xl bg-background/50" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold uppercase tracking-wide">Lobby Timezone</Label>
              <Input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className="h-11 rounded-xl bg-background/50" />
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider pl-1">Auto-detected based on your current location</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 animate-in fade-in duration-500">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-wider text-primary">Final Confirmation</span>
              </div>
              {form.ranked && <Badge className="bg-primary text-primary-foreground font-black tracking-tighter uppercase px-2 py-0.5 text-[9px]">RANKED</Badge>}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Review label="Name" value={form.name} />
              <Review label="Format" value={BATTLE_TYPES.find((t) => t.value === form.battle_type)?.label ?? ""} />
              <Review label="Market" value={findMarket(form.market).label} />
              <Review label="Starting Balance" value={`$${form.starting_balance.toLocaleString()}`} />
              <Review label="Profit Target" value={`${form.profit_target_pct}%`} />
              <Review label="Risk Per Trade" value={`${form.max_risk_pct}%`} />
              <Review label="Max Drawdown" value={`${form.max_drawdown_pct}%`} />
              <Review label="Max Positions" value={`${form.max_open_positions}`} />
            </div>
            
            <div className="mt-4 p-4 rounded-xl bg-card/40 border border-border/60">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 pl-1">Market Schedule</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Opens</span>
                  <span className="font-bold text-foreground">{new Date(form.start_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Closes</span>
                  <span className="font-bold text-foreground">{new Date(form.end_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-6">
        <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)} className="font-bold rounded-xl h-11 px-6">
          <ChevronLeft className="mr-2 h-4 w-4" />{step === 0 ? "Cancel" : "Previous Step"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext()} onClick={() => setStep(step + 1)} className="font-bold rounded-xl h-11 px-8 shadow-lg shadow-primary/20">
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={loading} onClick={submit} className="font-bold rounded-xl h-11 px-10 shadow-lg shadow-primary/30">
            {loading ? "Preparing Battle..." : "Launch Battle Arena"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-card/30 border border-border/40 px-4 py-2.5 hover:bg-card/50 transition-colors">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-xs font-black text-foreground">{value}</span>
    </div>
  );
}
