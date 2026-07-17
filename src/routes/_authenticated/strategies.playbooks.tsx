import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlaybookCard } from "@/components/strategy/PlaybookCard";
import { RuleList } from "@/components/strategy/RuleList";
import { deletePlaybook, listPlaybooks, upsertPlaybook, listStrategies } from "@/lib/strategy.functions";
import { nextRuleId } from "@/lib/strategy/calculations";
import type { Playbook, Rule, Strategy } from "@/lib/strategy/types";

export const Route = createFileRoute("/_authenticated/strategies/playbooks")({
  component: PlaybooksPage,
});

function PlaybooksPage() {
  const list = useServerFn(listPlaybooks);
  const listS = useServerFn(listStrategies);
  const save = useServerFn(upsertPlaybook);
  const del = useServerFn(deletePlaybook);
  const qc = useQueryClient();

  const pbs = useQuery({ queryKey: ["playbooks"], queryFn: () => list() });
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: () => listS() });

  const [editing, setEditing] = useState<Partial<Playbook> | null>(null);

  const saveMut = useMutation({
    mutationFn: async (p: any) => save({ data: p }),
    onSuccess: () => { toast.success("Playbook saved"); qc.invalidateQueries({ queryKey: ["playbooks"] }); setEditing(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playbooks"] }),
  });

  const startNew = () => setEditing({ name: "New Playbook", overview: "", rules: [], checklist: [], mistakes: [], examples: [], color: "#22c55e", icon: "BookMarked" });

  return (
    <div className="space-y-4">
      <PageHeader title="Playbooks" description="Deep dives into specific setups: rules, mistakes, examples." actions={
        <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" />New Playbook</Button>
      } />
      {editing ? (
        <PlaybookEditor
          initial={editing}
          strategies={(strategies.data ?? []) as unknown as Strategy[]}
          onCancel={() => setEditing(null)}
          onSave={(p) => saveMut.mutate(p)}
          saving={saveMut.isPending}
        />
      ) : null}
      {pbs.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass rounded-3xl h-32 animate-pulse" />)}
        </div>
      ) : (pbs.data ?? []).length === 0 && !editing ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">No playbooks yet. Create one to codify a repeatable setup.</GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {((pbs.data ?? []) as any[]).map((p) => (
            <div key={p.id} className="relative group">
              <PlaybookCard pb={p} />
              <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex gap-1 transition">
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setEditing(p)}>✎</Button>
                <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => delMut.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaybookEditor({ initial, strategies, onCancel, onSave, saving }: { initial: Partial<Playbook>; strategies: Strategy[]; onCancel: () => void; onSave: (p: any) => void; saving: boolean }) {
  const [name, setName] = useState(initial.name ?? "");
  const [overview, setOverview] = useState(initial.overview ?? "");
  const [strategy_id, setStrategyId] = useState<string | null>(initial.strategy_id ?? null);
  const [rules, setRules] = useState<Rule[]>((initial.rules as Rule[]) ?? []);
  const [checklist, setChecklist] = useState<Rule[]>((initial.checklist as Rule[]) ?? []);
  const [mistakes, setMistakes] = useState<Rule[]>((initial.mistakes as Rule[]) ?? []);

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" placeholder="Playbook name" />
        <select value={strategy_id ?? ""} onChange={(e) => setStrategyId(e.target.value || null)} className="h-9 rounded-md border border-border/60 bg-background/40 px-2 text-xs">
          <option value="">No linked strategy</option>
          {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave({ ...initial, name, overview, strategy_id, rules, checklist, mistakes })} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save Playbook"}
          </Button>
        </div>
      </div>
      <Textarea rows={3} value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="Overview of this setup: context, why it works, when to avoid it." />
      <div className="grid gap-4 md:grid-cols-3">
        <div><div className="text-xs font-semibold mb-2">Rules</div><RuleList rules={rules} onChange={setRules} placeholder="Add a rule…" /></div>
        <div><div className="text-xs font-semibold mb-2">Checklist</div><RuleList rules={checklist} onChange={setChecklist} placeholder="Checklist item…" /></div>
        <div><div className="text-xs font-semibold mb-2">Common Mistakes</div><RuleList rules={mistakes} onChange={setMistakes} placeholder="Mistake to avoid…" /></div>
      </div>
    </GlassCard>
  );
}
