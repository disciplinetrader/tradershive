/**
 * Playbook match — every verdict shows the rule that produced it and can be
 * corrected by the trader (corrections persist on the entry's checklist).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleSlash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { journalKeys, updateEntry, type ChecklistItem, type JournalEntry } from "@/lib/journal/api";
import type { RuleVerdict } from "@/lib/journal/story";
import { Bar, MissingData } from "./primitives";
import { cn } from "@/lib/utils";

export function PlaybookMatch({
  entry,
  rules,
  pct,
  quality,
}: {
  entry: JournalEntry;
  rules: RuleVerdict[];
  pct: number | null;
  quality: { setup: number | null; entry: number | null; management: number | null; exit: number | null };
}) {
  const qc = useQueryClient();
  const checklist = Array.isArray(entry.checklist) ? (entry.checklist as unknown as ChecklistItem[]) : [];

  const correct = useMutation({
    mutationFn: async (rule: RuleVerdict) => {
      const idx = checklist.findIndex((c) => c.id === rule.id);
      if (idx < 0) return;
      const next = checklist.map((c, i) => (i === idx ? { ...c, checked: !c.checked } : c));
      await updateEntry(entry.id, { checklist: next as unknown as JournalEntry["checklist"] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: journalKeys.entry(entry.id) }),
  });

  if (!rules.length) return <MissingData label="No playbook rules attached to this trade yet." />;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Match</span>
          <span className="text-sm font-semibold tabular-nums">{pct == null ? "—" : `${pct}%`}</span>
        </div>
        <div className="mt-1"><Bar pct={pct ?? 0} tone={pct != null && pct >= 70 ? "up" : "primary"} /></div>
      </div>

      <ul className="space-y-1">
        {rules.map((r) => {
          const editable = checklist.some((c) => c.id === r.id);
          return (
            <li key={r.id} className="flex items-start gap-2 rounded border border-border/40 px-2 py-1.5">
              <StateIcon state={r.state} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-foreground">{r.label}</p>
                <p className="text-[10px] text-muted-foreground">{r.why}</p>
              </div>
              {editable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 shrink-0 px-1.5 text-[10px] text-muted-foreground"
                  disabled={correct.isPending}
                  onClick={() => correct.mutate(r)}
                >
                  Correct
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-1.5">
        {(["setup", "entry", "management", "exit"] as const).map((k) => (
          <div key={k} className="rounded border border-border/40 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{k} quality</p>
            <p className="text-[12px] font-medium tabular-nums">{quality[k] == null ? "—" : `${Math.round(quality[k]!)}%`}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Rule-derived, not AI-confirmed. Use “Correct” when a verdict is wrong.</p>
    </div>
  );
}

function StateIcon({ state }: { state: RuleVerdict["state"] }) {
  const map = {
    followed: { Icon: Check, cls: "text-success" },
    missed: { Icon: CircleSlash, cls: "text-muted-foreground" },
    broken: { Icon: X, cls: "text-danger" },
  } as const;
  const { Icon, cls } = map[state];
  return <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", cls)} />;
}
