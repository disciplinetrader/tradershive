import { useMemo, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, X, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upsertStrategy } from "@/lib/strategy.functions";
import { WIZARD_STEPS, STRATEGY_CATEGORIES, STRATEGY_MARKETS, STRATEGY_TIMEFRAMES, MARKET_CONDITIONS, STRATEGY_STATUS, STRATEGY_DIFFICULTIES, STRATEGY_COLORS, STRATEGY_ICONS, COMMON_TAGS } from "@/lib/strategy/constants";
import { nextRuleId } from "@/lib/strategy/calculations";
import { RuleList } from "./RuleList";
import type { Rule, StrategyStatus, StrategyDifficulty } from "@/lib/strategy/types";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  description: string;
  category: string;
  market: string;
  markets: string[];
  timeframes: string[];
  tags: string[];
  market_conditions: string[];
  color: string;
  icon: string;
  entry_rules: Rule[];
  exit_rules: Rule[];
  risk_rules: {
    max_risk_pct?: number; min_rr?: number; max_trades_per_day?: number;
    max_daily_loss_pct?: number; max_weekly_loss_pct?: number; position_sizing?: string;
  };
  trade_management: { move_stop_rules?: string; scale_in?: string; scale_out?: string; trailing_logic?: string; reentry_rules?: string };
  notes: string;
  status: StrategyStatus;
  difficulty: StrategyDifficulty;
  estimated_timeframe: string;
};

const DEFAULT: FormState = {
  name: "", description: "", category: "trend", market: "forex",
  markets: [], timeframes: [], tags: [], market_conditions: [],
  color: STRATEGY_COLORS[0], icon: "Sparkles",
  entry_rules: [{ id: nextRuleId(), text: "" }],
  exit_rules: [{ id: nextRuleId(), text: "" }],
  risk_rules: { max_risk_pct: 1, min_rr: 2 },
  trade_management: {},
  notes: "", status: "draft", difficulty: "intermediate", estimated_timeframe: "",
};

export function CreatorWizard({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: Partial<FormState> }) {
  const navigate = useNavigate();
  const upsert = useServerFn(upsertStrategy);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<FormState>({ ...DEFAULT, ...initial });
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const mut = useMutation({
    mutationFn: async () => upsert({ data: { ...state } as any }),
    onSuccess: (row: any) => {
      toast.success("Strategy created");
      onOpenChange(false);
      setStep(1); setState(DEFAULT);
      navigate({ to: "/strategies/$id", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create strategy"),
  });

  const canNext = useMemo(() => {
    if (step === 1) return state.name.trim().length > 0;
    return true;
  }, [step, state.name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Step {step} of {WIZARD_STEPS.length}</div>
            <div className="text-base font-semibold">{WIZARD_STEPS[step - 1].title}</div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-9 gap-1 px-5 pt-3">
          {WIZARD_STEPS.map((s) => (
            <div key={s.id} className={cn("h-1 rounded-full", s.id <= step ? "bg-primary" : "bg-border/40")} />
          ))}
        </div>
        <div className="p-5 max-h-[65vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              {step === 1 ? <StepBasics state={state} set={set} /> :
               step === 2 ? <StepMarket state={state} set={set} /> :
               step === 3 ? <StepEntry state={state} set={set} /> :
               step === 4 ? <StepExit state={state} set={set} /> :
               step === 5 ? <StepRisk state={state} set={set} /> :
               step === 6 ? <StepManagement state={state} set={set} /> :
               step === 7 ? <StepChecklists state={state} set={set} /> :
               step === 8 ? <StepExamples /> :
                            <StepPublish state={state} set={set} />}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="border-t border-border/60 px-5 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            <ChevronLeft className="mr-1 h-4 w-4" />Back
          </Button>
          {step < WIZARD_STEPS.length ? (
            <Button onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length, s + 1))} disabled={!canNext}>
              Next<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
              <Rocket className="mr-1 h-4 w-4" />{mut.isPending ? "Creating…" : "Create Strategy"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Steps -------- */

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint ? <div className="text-[10px] text-muted-foreground/70">{hint}</div> : null}
    </div>
  );
}

function ChipList({ options, value, onChange }: { options: readonly string[] | readonly { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const opts = options.map((o) => typeof o === "string" ? { id: o, label: o } : o);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} type="button" onClick={() => toggle(o.id)}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition",
              on ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StepBasics({ state, set }: { state: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Strategy name"><Input value={state.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Gold London Open Breakout" /></Field>
      <Field label="Category">
        <select value={state.category} onChange={(e) => set("category", e.target.value)} className="h-9 w-full rounded-md border border-border/60 bg-background/40 px-2 text-sm">
          {STRATEGY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Description">
          <Textarea value={state.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What is the edge? When does it work?" />
        </Field>
      </div>
      <Field label="Primary market">
        <select value={state.market} onChange={(e) => set("market", e.target.value)} className="h-9 w-full rounded-md border border-border/60 bg-background/40 px-2 text-sm">
          {STRATEGY_MARKETS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Difficulty">
        <select value={state.difficulty} onChange={(e) => set("difficulty", e.target.value as any)} className="h-9 w-full rounded-md border border-border/60 bg-background/40 px-2 text-sm">
          {STRATEGY_DIFFICULTIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Timeframes"><ChipList options={STRATEGY_TIMEFRAMES} value={state.timeframes} onChange={(v) => set("timeframes", v)} /></Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Tags"><ChipList options={COMMON_TAGS} value={state.tags} onChange={(v) => set("tags", v)} /></Field>
      </div>
      <Field label="Color">
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => set("color", c)}
              className={cn("h-7 w-7 rounded-full border-2", state.color === c ? "border-foreground" : "border-transparent")}
              style={{ background: c }} aria-label={c} />
          ))}
        </div>
      </Field>
      <Field label="Icon">
        <select value={state.icon} onChange={(e) => set("icon", e.target.value)} className="h-9 w-full rounded-md border border-border/60 bg-background/40 px-2 text-sm">
          {STRATEGY_ICONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
    </div>
  );
}

function StepMarket({ state, set }: { state: FormState; set: any }) {
  return (
    <div className="space-y-4">
      <Field label="Additional markets"><ChipList options={STRATEGY_MARKETS} value={state.markets} onChange={(v) => set("markets", v)} /></Field>
      <Field label="When does this strategy work best?">
        <ChipList options={MARKET_CONDITIONS} value={state.market_conditions} onChange={(v) => set("market_conditions", v)} />
      </Field>
      <Field label="Estimated hold time">
        <Input value={state.estimated_timeframe} onChange={(e) => set("estimated_timeframe", e.target.value)} placeholder="e.g. 15m – 2h" />
      </Field>
    </div>
  );
}

function StepEntry({ state, set }: { state: FormState; set: any }) {
  return <RuleList label="Entry conditions" rules={state.entry_rules} onChange={(r) => set("entry_rules", r)} placeholder="e.g. Price closes above VWAP with rising volume" />;
}
function StepExit({ state, set }: { state: FormState; set: any }) {
  return <RuleList label="Exit conditions (TP, SL, trailing, time exit…)" rules={state.exit_rules} onChange={(r) => set("exit_rules", r)} placeholder="e.g. TP at 2R or prior swing high; SL below trigger candle" />;
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: number | undefined; onChange: (n: number | undefined) => void; suffix?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}{suffix ? <span className="text-muted-foreground/60"> ({suffix})</span> : null}</label>
      <Input type="number" step="0.1" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
    </div>
  );
}

function StepRisk({ state, set }: { state: FormState; set: any }) {
  const r = state.risk_rules;
  const upd = (patch: Partial<typeof r>) => set("risk_rules", { ...r, ...patch });
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <NumberField label="Max risk per trade" suffix="%" value={r.max_risk_pct} onChange={(v) => upd({ max_risk_pct: v })} />
      <NumberField label="Minimum R:R" value={r.min_rr} onChange={(v) => upd({ min_rr: v })} />
      <NumberField label="Max trades per day" value={r.max_trades_per_day} onChange={(v) => upd({ max_trades_per_day: v })} />
      <NumberField label="Max daily loss" suffix="%" value={r.max_daily_loss_pct} onChange={(v) => upd({ max_daily_loss_pct: v })} />
      <NumberField label="Max weekly loss" suffix="%" value={r.max_weekly_loss_pct} onChange={(v) => upd({ max_weekly_loss_pct: v })} />
      <div className="md:col-span-2">
        <Field label="Position sizing formula">
          <Input value={r.position_sizing ?? ""} onChange={(e) => upd({ position_sizing: e.target.value })} placeholder="e.g. (Balance × Risk%) ÷ (Stop pips × Pip value)" />
        </Field>
      </div>
    </div>
  );
}

function StepManagement({ state, set }: { state: FormState; set: any }) {
  const m = state.trade_management;
  const upd = (patch: Partial<typeof m>) => set("trade_management", { ...m, ...patch });
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Move stop rules"><Textarea rows={2} value={m.move_stop_rules ?? ""} onChange={(e) => upd({ move_stop_rules: e.target.value })} /></Field>
      <Field label="Trailing stop logic"><Textarea rows={2} value={m.trailing_logic ?? ""} onChange={(e) => upd({ trailing_logic: e.target.value })} /></Field>
      <Field label="Scale in"><Textarea rows={2} value={m.scale_in ?? ""} onChange={(e) => upd({ scale_in: e.target.value })} /></Field>
      <Field label="Scale out"><Textarea rows={2} value={m.scale_out ?? ""} onChange={(e) => upd({ scale_out: e.target.value })} /></Field>
      <div className="md:col-span-2">
        <Field label="Re-entry rules"><Textarea rows={2} value={m.reentry_rules ?? ""} onChange={(e) => upd({ reentry_rules: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function StepChecklists({ state, set }: { state: FormState; set: any }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Notes and quick checklist. You can create full checklists (pre-market, entry, exit, review) from the strategy detail page after saving.</p>
      <Field label="Notes"><Textarea rows={6} value={state.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else you want to remember about this strategy…" /></Field>
    </div>
  );
}

function StepExamples() {
  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>Attach reference trades, journal entries, replay sessions and screenshots after the strategy is created.</p>
      <p>The strategy detail page has a full <strong>Examples</strong> tab where you can link everything together.</p>
    </div>
  );
}

function StepPublish({ state, set }: { state: FormState; set: any }) {
  return (
    <div className="space-y-3">
      <Field label="Status">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STRATEGY_STATUS.map((s) => (
            <button key={s.id} type="button" onClick={() => set("status", s.id as StrategyStatus)}
              className={cn("rounded-lg border p-3 text-left transition",
                state.status === s.id ? "border-primary bg-primary/10" : "border-border/60 hover:border-border")}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{s.label}</span>
                {state.status === s.id ? <Check className="h-4 w-4 text-primary" /> : null}
              </div>
            </button>
          ))}
        </div>
      </Field>
      <p className="text-xs text-muted-foreground">
        <strong>Public</strong> strategies are visible on the community shared feed. You can change status any time.
      </p>
    </div>
  );
}
