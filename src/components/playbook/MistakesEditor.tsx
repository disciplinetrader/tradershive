import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setPlaybookMistakes } from "@/lib/playbook.functions";

type Mistake = { id: string; text: string };

export function MistakesEditor({ strategyId, initial }: { strategyId: string; initial: Mistake[] }) {
  const [items, setItems] = useState<Mistake[]>(initial);
  const qc = useQueryClient();
  const save = useServerFn(setPlaybookMistakes);
  const mut = useMutation({
    mutationFn: async () => save({ data: { id: strategyId, mistakes: items.filter((m) => m.text.trim().length) } }),
    onSuccess: () => {
      toast.success("Mistakes updated");
      qc.invalidateQueries({ queryKey: ["playbook", strategyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const add = () => setItems((p) => [...p, { id: crypto.randomUUID(), text: "" }]);
  const remove = (id: string) => setItems((p) => p.filter((m) => m.id !== id));
  const patch = (id: string, text: string) => setItems((p) => p.map((m) => (m.id === id ? { ...m, text } : m)));

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-warning" />
          No mistakes logged. Add the recurring errors you want to avoid.
        </div>
      ) : null}
      {items.map((m, i) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-destructive/10 text-xs font-semibold text-destructive">
            {i + 1}
          </span>
          <Input value={m.text} onChange={(e) => patch(m.id, e.target.value)} placeholder="e.g. Entering before liquidity sweep confirmation" />
          <Button size="icon" variant="ghost" aria-label="Remove mistake" onClick={() => remove(m.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button size="sm" variant="ghost" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Add mistake</Button>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  );
}
