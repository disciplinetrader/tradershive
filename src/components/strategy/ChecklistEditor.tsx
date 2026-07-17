import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { upsertChecklist, deleteChecklist } from "@/lib/strategy.functions";
import { CHECKLIST_KINDS } from "@/lib/strategy/constants";

type Item = { id?: string; label: string; required?: boolean };
type Checklist = { id?: string; kind: string; title: string; items: Item[] };

export function ChecklistEditor({ strategyId, initial }: { strategyId: string; initial: Checklist[] }) {
  const [lists, setLists] = useState<Checklist[]>(initial.length ? initial : []);
  const qc = useQueryClient();
  const save = useServerFn(upsertChecklist);
  const del = useServerFn(deleteChecklist);

  const saveMut = useMutation({
    mutationFn: async (idx: number) => {
      const c = lists[idx];
      const res = await save({ data: { id: c.id, strategy_id: strategyId, kind: c.kind, title: c.title, items: c.items } });
      return { idx, id: (res as any).id as string };
    },
    onSuccess: ({ idx, id }) => {
      setLists((prev) => prev.map((c, i) => i === idx ? { ...c, id } : c));
      toast.success("Checklist saved");
      qc.invalidateQueries({ queryKey: ["strategy", strategyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: (_: any, id) => {
      setLists((prev) => prev.filter((c) => c.id !== id));
      qc.invalidateQueries({ queryKey: ["strategy", strategyId] });
    },
  });

  const addList = () => setLists([...lists, { kind: "entry", title: "New Checklist", items: [] }]);
  const addItem = (idx: number) => setLists((p) => p.map((c, i) => i === idx ? { ...c, items: [...c.items, { label: "" }] } : c));
  const setItem = (idx: number, ii: number, patch: Partial<Item>) =>
    setLists((p) => p.map((c, i) => i === idx ? { ...c, items: c.items.map((it, j) => j === ii ? { ...it, ...patch } : it) } : c));
  const removeItem = (idx: number, ii: number) =>
    setLists((p) => p.map((c, i) => i === idx ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Checklists</div>
        <Button size="sm" variant="secondary" onClick={addList}><Plus className="mr-1 h-3.5 w-3.5" />New checklist</Button>
      </div>
      {lists.length === 0 ? (
        <GlassCard className="p-6 text-center text-xs text-muted-foreground">No checklists yet. Create routines for pre-market, entry, exit, and post-trade review.</GlassCard>
      ) : null}
      {lists.map((c, idx) => (
        <GlassCard key={c.id ?? idx} className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={c.kind} onChange={(e) => setLists((p) => p.map((x, i) => i === idx ? { ...x, kind: e.target.value } : x))}
              className="h-8 rounded-md border border-border/60 bg-background/40 px-2 text-xs">
              {CHECKLIST_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <Input value={c.title} onChange={(e) => setLists((p) => p.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))} className="h-8 flex-1" />
            <Button size="sm" onClick={() => saveMut.mutate(idx)} disabled={saveMut.isPending}><Save className="mr-1 h-3.5 w-3.5" />Save</Button>
            {c.id ? <Button size="icon" variant="ghost" onClick={() => delMut.mutate(c.id!)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
          </div>
          <div className="space-y-1.5">
            {c.items.map((it, ii) => (
              <div key={ii} className="flex items-center gap-2">
                <input type="checkbox" checked={!!it.required} onChange={(e) => setItem(idx, ii, { required: e.target.checked })} title="Required?" />
                <Input value={it.label} onChange={(e) => setItem(idx, ii, { label: e.target.value })} placeholder="Checklist item" className="h-8" />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(idx, ii)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => addItem(idx)}><Plus className="mr-1 h-3.5 w-3.5" />Add item</Button>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
