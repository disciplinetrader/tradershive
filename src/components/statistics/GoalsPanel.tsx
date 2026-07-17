import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createGoal, deleteGoal, listGoals } from "@/lib/statistics.functions";
import { useStatistics } from "./context";
import { computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  net_profit: "Net profit",
  max_drawdown: "Max drawdown (cap)",
  min_win_rate: "Minimum win rate",
  min_rr: "Minimum avg RR",
  max_trades: "Max trades (cap)",
  trades_count: "Trades count",
};

export function GoalsPanel() {
  const listFn = useServerFn(listGoals);
  const createFn = useServerFn(createGoal);
  const deleteFn = useServerFn(deleteGoal);
  const qc = useQueryClient();
  const { filtered } = useStatistics();
  const k = useMemo(() => computeKpis(filtered), [filtered]);

  const goals = useQuery({ queryKey: ["stats", "goals"], queryFn: () => listFn() });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createFn>[0]["data"]) => createFn({ data: input }),
    onSuccess: () => { toast.success("Goal created"); qc.invalidateQueries({ queryKey: ["stats", "goals"] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stats", "goals"] }); },
  });

  const [open, setOpen] = useState(false);

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Goals</div>
          <div className="text-xs text-muted-foreground mt-0.5">Progress computed live from the filtered range.</div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New goal</Button></DialogTrigger>
          <GoalDialogContent onSubmit={(v) => { create.mutate(v); setOpen(false); }} />
        </Dialog>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(goals.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground col-span-full">
            <Target className="h-6 w-6 mx-auto text-muted-foreground/60 mb-2" />
            Define your first goal to start tracking progress.
          </div>
        ) : (goals.data ?? []).map((g: any) => {
          const { current, pct, tone, targetDisplay } = computeGoalProgress(g, k);
          return (
            <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{g.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{KIND_LABEL[g.kind]} · {g.period}</div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <span className={cn("font-bold tabular-nums", tone === "up" && "text-emerald-400", tone === "down" && "text-rose-400")}>{current}</span>
                  <span className="text-xs text-muted-foreground">of {targetDisplay}</span>
                </div>
                <Progress value={pct} className="mt-2 h-2" />
                <div className="mt-1 text-[10px] text-muted-foreground">{pct.toFixed(0)}% complete</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function computeGoalProgress(g: any, k: ReturnType<typeof computeKpis>) {
  switch (g.kind) {
    case "net_profit": {
      const cur = k.netProfit;
      return { current: fmtCurrency(cur), pct: Math.min(100, (cur / g.target_value) * 100), tone: cur >= 0 ? ("up" as const) : ("down" as const), targetDisplay: fmtCurrency(g.target_value) };
    }
    case "max_drawdown": {
      const cur = k.maxDrawdown;
      return { current: fmtCurrency(cur), pct: Math.min(100, (cur / g.target_value) * 100), tone: cur > g.target_value ? "down" as const : "up" as const, targetDisplay: `≤ ${fmtCurrency(g.target_value)}` };
    }
    case "min_win_rate": {
      const cur = k.winRate;
      return { current: fmtPercent(cur), pct: Math.min(100, (cur / g.target_value) * 100), tone: cur >= g.target_value ? "up" as const : "down" as const, targetDisplay: `≥ ${fmtPercent(g.target_value)}` };
    }
    case "min_rr": {
      const cur = k.avgRR;
      return { current: `${fmtNumber(cur)}R`, pct: Math.min(100, (cur / g.target_value) * 100), tone: cur >= g.target_value ? "up" as const : "down" as const, targetDisplay: `≥ ${fmtNumber(g.target_value)}R` };
    }
    case "max_trades": {
      const cur = k.totalTrades;
      return { current: String(cur), pct: Math.min(100, (cur / g.target_value) * 100), tone: cur > g.target_value ? "down" as const : "up" as const, targetDisplay: `≤ ${g.target_value}` };
    }
    case "trades_count":
    default: {
      const cur = k.totalTrades;
      return { current: String(cur), pct: Math.min(100, (cur / g.target_value) * 100), tone: cur >= g.target_value ? "up" as const : "down" as const, targetDisplay: String(g.target_value) };
    }
  }
}

function GoalDialogContent({ onSubmit }: { onSubmit: (v: any) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("net_profit");
  const [target, setTarget] = useState(1000);
  const [period, setPeriod] = useState("month");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New goal</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. $2,000 profit this month" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["day","week","month","quarter","year","all_time"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Target value</Label><Input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></div>
      </div>
      <DialogFooter>
        <Button disabled={!name.trim()} onClick={() => onSubmit({ name: name.trim(), kind, target_value: target, period })}>Create</Button>
      </DialogFooter>
    </DialogContent>
  );
}
