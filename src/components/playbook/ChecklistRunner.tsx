import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlaybook, logChecklistRun } from "@/lib/playbook.functions";

type Ctx = "paper" | "replay" | "journal" | "manual";

export function ChecklistRunner({
  strategyId,
  open,
  onOpenChange,
  context = "manual",
  contextRefId,
  onCompleted,
}: {
  strategyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context?: Ctx;
  contextRefId?: string | null;
  onCompleted?: (result: { allRequiredPassed: boolean; runId: string }) => void;
}) {
  const load = useServerFn(getPlaybook);
  const submit = useServerFn(logChecklistRun);
  const pb = useQuery({
    queryKey: ["playbook", strategyId, "runner"],
    queryFn: () => load({ data: { id: strategyId } }),
    enabled: open,
  });

  const items = useMemo(() => {
    if (!pb.data) return [] as Array<{ id: string; label: string; required: boolean; checked: boolean }>;
    const required = new Set<string>(pb.data.strategy.checklist_required_ids ?? []);
    const flat: Array<{ id: string; label: string; required: boolean; checked: boolean }> = [];
    for (const cl of pb.data.checklists) {
      for (const it of (cl as any).items ?? []) {
        flat.push({ id: it.id, label: it.label, required: !!it.required || required.has(it.id), checked: false });
      }
    }
    return flat;
  }, [pb.data]);

  const [state, setState] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");

  const merged = items.map((it) => ({ ...it, checked: state[it.id] ?? it.checked }));
  const requiredTotal = merged.filter((i) => i.required).length;
  const requiredPassed = merged.filter((i) => i.required && i.checked).length;
  const allRequiredPassed = requiredTotal === 0 || requiredPassed === requiredTotal;
  const completion = merged.length ? Math.round((merged.filter((i) => i.checked).length / merged.length) * 100) : 0;

  const mut = useMutation({
    mutationFn: async () => submit({
      data: {
        strategy_id: strategyId,
        context,
        context_ref_id: contextRefId ?? null,
        items: merged.map((i) => ({ id: i.id, label: i.label, required: i.required, checked: i.checked })),
        notes: notes.trim() || null,
      },
    }),
    onSuccess: (row: any) => {
      toast.success(allRequiredPassed ? "Setup followed ✓" : "Run logged");
      onCompleted?.({ allRequiredPassed, runId: row.id });
      onOpenChange(false);
      setState({});
      setNotes("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to log run"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pb.data?.strategy?.name ?? "Setup checklist"}
            <Badge variant="secondary" className="text-[10px] uppercase">{context}</Badge>
          </DialogTitle>
          <DialogDescription>
            Verify each rule before entry. Required items must be checked to mark the setup as followed.
          </DialogDescription>
        </DialogHeader>

        {pb.isPending ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading checklist…</div>
        ) : merged.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            This playbook has no checklist yet.
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className={cn("font-mono tabular-nums", allRequiredPassed ? "text-success" : "text-warning")}>
                {completion}% · {requiredPassed}/{requiredTotal} required
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
              <div
                className={cn("h-full transition-all", allRequiredPassed ? "bg-success" : "bg-warning")}
                style={{ width: `${completion}%` }}
              />
            </div>
            <ul className="mt-3 max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {merged.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setState((p) => ({ ...p, [it.id]: !it.checked }))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition",
                      it.checked
                        ? "border-success/40 bg-success/5"
                        : "border-border/60 bg-background/40 hover:border-border hover:bg-background/70",
                    )}
                  >
                    {it.checked ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn("flex-1 text-sm", it.checked && "line-through opacity-70")}>{it.label}</span>
                    {it.required ? <Badge variant="outline" className="text-[10px] text-warning">Required</Badge> : null}
                  </button>
                </li>
              ))}
            </ul>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this run…"
              rows={2}
              className="mt-3"
            />
          </>
        )}

        <DialogFooter className="items-center">
          <div className="mr-auto flex items-center gap-1.5 text-xs">
            {allRequiredPassed ? (
              <><ShieldCheck className="h-3.5 w-3.5 text-success" /><span className="text-success">All required checks passed</span></>
            ) : (
              <><ShieldAlert className="h-3.5 w-3.5 text-warning" /><span className="text-warning">Missing required checks</span></>
            )}
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || merged.length === 0}>
            {allRequiredPassed ? "Mark setup followed" : "Log run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
