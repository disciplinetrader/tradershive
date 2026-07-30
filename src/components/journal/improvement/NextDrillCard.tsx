/**
 * JOURNAL X — PHASE 5 · Next-best drill.
 *
 * The recommendation is produced by the deterministic engine in
 * `improvement.ts`; this component only renders it and offers the four
 * actions: start now, add to homework, dismiss, choose another.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ListPlus, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { JournalEntry } from "@/lib/journal/api";
import { CONFIDENCE_LABEL, modeLabel, type DrillRecommendation } from "@/lib/journal/improvement";
import { acceptDrill, homeworkKeys } from "@/lib/journal/homework";
import { IntentDialog, usePracticeLauncher, availableModes } from "@/components/journal/replay/PracticeLauncher";

export function NextDrillCard({
  recommendations,
  entries,
  compact = false,
}: {
  recommendations: DrillRecommendation[];
  entries: JournalEntry[];
  compact?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = recommendations.filter((r) => !dismissed.includes(r.id));
  const rec = visible[Math.min(index, Math.max(0, visible.length - 1))] ?? null;

  const entry = useMemo(() => entries.find((e) => e.id === rec?.entryId) ?? null, [entries, rec?.entryId]);
  const launcher = usePracticeLauncher(entry);

  const add = useMutation({
    mutationFn: async () => {
      if (!user || !rec) throw new Error("Sign in to save homework.");
      return acceptDrill({ userId: user.id, rec, symbol: entry?.symbol ?? null, market: entry?.market ?? null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: homeworkKeys.all });
      toast.success("Added to homework.");
    },
    onError: (e) => toast.error((e as Error).message || "Could not save the drill."),
  });

  if (!rec) {
    return (
      <div className="rounded-[3px] border border-dashed border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground">
        No drill is recommended right now — log a trade with a confirmed mistake and one will appear here.
      </div>
    );
  }

  const canStart = entry ? availableModes(entry).includes(rec.mode) : false;

  return (
    <div className={cn("rounded-[3px] border border-primary/25 bg-primary/[0.04] p-2.5", compact && "p-2")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-primary/80">What to practise next</span>
            <span className="text-[10px] text-muted-foreground">
              {rec.skillLabel} · {modeLabel(rec.mode)} · {CONFIDENCE_LABEL[rec.confidence].toLowerCase()}
            </span>
          </div>
          <p className="mt-1 text-[13px] font-medium leading-snug">{rec.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{rec.reason}</p>
          {rec.entryLabel ? <p className="mt-0.5 text-[11px] text-muted-foreground">Trade: {rec.entryLabel}</p> : null}
          {!compact && (
            <ul className="mt-1.5 space-y-0.5">
              {rec.evidence.map((e, i) => (
                <li key={i} className="text-[10px] leading-snug text-muted-foreground">
                  · {e}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            <span className="uppercase tracking-wide">Measurable target</span> — {rec.target}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
          aria-label="Dismiss recommendation"
          onClick={() => setDismissed((d) => [...d, rec.id])}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={!canStart || launcher.isPending}
          onClick={() => launcher.open(rec.mode, rec.mistake ?? undefined)}
          title={canStart ? undefined : "This trade does not carry the data this mode needs."}
        >
          <Play className="mr-1 h-3 w-3" /> Start now
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={add.isPending} onClick={() => add.mutate()}>
          <ListPlus className="mr-1 h-3 w-3" /> Add to homework
        </Button>
        {visible.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground">
                Choose another <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              {visible.map((r, i) => (
                <DropdownMenuItem key={r.id} onClick={() => setIndex(i)} className="flex-col items-start gap-0.5">
                  <span className="text-xs">{r.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {r.skillLabel} · priority {r.score}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {entry ? (
        <IntentDialog
          entry={entry}
          pending={launcher.pending}
          onClose={launcher.close}
          onStart={launcher.start}
          busy={launcher.isPending}
        />
      ) : null}
    </div>
  );
}
