import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GOAL_META, GOAL_PERIODS, type GoalKind, type GoalPeriod, type GoalRow } from "@/lib/goals/types";

export type GoalDraft = {
  name: string;
  kind: GoalKind;
  target_value: number;
  period: GoalPeriod;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: GoalRow | null;
  onSubmit: (draft: GoalDraft) => void;
};

const CATEGORY_ORDER: Array<{ key: "discipline" | "performance" | "practice"; label: string }> = [
  { key: "performance", label: "Performance targets" },
  { key: "discipline", label: "Discipline & risk" },
  { key: "practice", label: "Practice & consistency" },
];

export function GoalDialog({ open, onOpenChange, editing, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GoalKind>("daily_r_target");
  const [target, setTarget] = useState<number>(1);
  const [period, setPeriod] = useState<GoalPeriod>("day");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setTarget(Number(editing.target_value));
      setPeriod(editing.period);
    } else {
      setName("");
      setKind("daily_r_target");
      setTarget(GOAL_META.daily_r_target.defaultTarget);
      setPeriod("day");
    }
  }, [open, editing]);

  useEffect(() => {
    if (editing) return;
    const meta = GOAL_META[kind];
    setTarget(meta.defaultTarget);
    setPeriod(meta.defaultPeriod);
    if (!name.trim()) setName(meta.label);
  }, [kind, editing, name]);

  const meta = GOAL_META[kind];
  const suffix = meta.unit === "%" ? "%" : meta.unit === "R" ? "R" : meta.unit === "hours" ? "hrs" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit goal" : "New trading goal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="goal-name">Goal name</Label>
            <Input id="goal-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stay under 2R daily loss" />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as GoalKind)} disabled={Boolean(editing)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {CATEGORY_ORDER.map((cat) => {
                  const items = (Object.entries(GOAL_META) as Array<[GoalKind, typeof GOAL_META[GoalKind]]>)
                    .filter(([k, m]) => m.category === cat.key && !["net_profit","max_drawdown","min_win_rate","min_rr","max_trades","trades_count"].includes(k));
                  if (!items.length) return null;
                  return (
                    <div key={cat.key} className="py-1">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat.label}</div>
                      {items.map(([k, m]) => (
                        <SelectItem key={k} value={k}>{m.label}</SelectItem>
                      ))}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="goal-target">Target ({suffix || meta.unit})</Label>
              <Input id="goal-target" type="number" step="any" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            </div>
            <div>
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as GoalPeriod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_PERIODS.filter((p) => p !== "custom").map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || !Number.isFinite(target)}
            onClick={() => onSubmit({ name: name.trim(), kind, target_value: target, period })}
          >{editing ? "Save changes" : "Create goal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
