/**
 * JOURNAL X — PHASE 5 · Homework queue.
 *
 * Suggested → Accepted → In progress → Completed. A drill is only marked
 * complete by a real replay attempt, so "complete" here records the outcome
 * the attempt produced rather than a self-declared checkbox.
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/lib/journal/api";
import type { Rollup } from "@/lib/journal/improvement";
import { modeLabel, signed } from "@/lib/journal/improvement";
import {
  HOMEWORK_STATUS_LABEL,
  OPEN_STATUSES,
  deleteHomework,
  homeworkKeys,
  homeworkMode,
  setHomeworkStatus,
  type HomeworkRow,
  type HomeworkStatus,
} from "@/lib/journal/homework";
import { InlineEmpty, Panel } from "./primitives";
import { IntentDialog, usePracticeLauncher, availableModes } from "@/components/journal/replay/PracticeLauncher";

const STATUS_CLASS: Record<string, string> = {
  suggested: "border-border/60 text-muted-foreground",
  accepted: "border-primary/30 text-primary/90",
  in_progress: "border-sky-500/30 text-sky-400/90",
  completed: "border-emerald-500/30 text-emerald-400/90",
  dismissed: "border-border/60 text-muted-foreground",
};

function HomeworkItem({ row, entries, rollup }: { row: HomeworkRow; entries: JournalEntry[]; rollup: Rollup }) {
  const qc = useQueryClient();
  const entry = useMemo(() => entries.find((e) => e.id === row.source_entry_id) ?? null, [entries, row.source_entry_id]);
  const launcher = usePracticeLauncher(entry);
  const mode = homeworkMode(row);

  // A drill counts as done when an attempt on the same trade + mode completed
  // after the homework was created — no self-reporting.
  const evidenceAttempt = useMemo(
    () =>
      rollup.facts.find(
        (f) => f.status === "completed" && f.entryId === row.source_entry_id && f.mode === mode && f.at >= +new Date(row.created_at),
      ) ?? null,
    [rollup.facts, row.source_entry_id, row.created_at, mode],
  );

  const status = (row.status as HomeworkStatus) ?? "accepted";
  const canStart = entry ? availableModes(entry).includes(mode) : false;

  const patch = useMutation({
    mutationFn: (next: HomeworkStatus) =>
      setHomeworkStatus(row.id, next, next === "completed" && evidenceAttempt ? { attemptId: evidenceAttempt.id, processDelta: evidenceAttempt.processDelta } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: homeworkKeys.all }),
    onError: (e) => toast.error((e as Error).message || "Could not update the drill."),
  });

  const remove = useMutation({
    mutationFn: () => deleteHomework(row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: homeworkKeys.all }),
  });

  return (
    <div className="rounded-[3px] border border-border/50 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-[3px] border px-1 py-px text-[9px] uppercase tracking-wide", STATUS_CLASS[status])}>
          {HOMEWORK_STATUS_LABEL[status] ?? status}
        </span>
        <span className="text-[12px] font-medium">{row.title ?? "Practice drill"}</span>
        <span className="text-[10px] text-muted-foreground">{modeLabel(mode)}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">priority {row.priority ?? 0}</span>
      </div>
      {row.reason ? <p className="mt-1 text-[11px] text-muted-foreground">{row.reason}</p> : null}
      {row.measurable_goal ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          <span className="uppercase tracking-wide">Target</span> — {row.measurable_goal}
        </p>
      ) : null}
      {evidenceAttempt ? (
        <p className="mt-0.5 text-[10px] text-emerald-400/90">
          Attempt completed · process {signed(evidenceAttempt.processDelta, 1)}
        </p>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {status !== "completed" && (
          <Button
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={!canStart || launcher.isPending}
            onClick={() => {
              if (status !== "in_progress") patch.mutate("in_progress");
              launcher.open(mode, row.target_mistake ?? undefined);
            }}
            title={canStart ? undefined : "This trade does not carry the data this mode needs."}
          >
            <Play className="mr-1 h-3 w-3" /> {status === "in_progress" ? "Continue" : "Start"}
          </Button>
        )}
        {status !== "completed" && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={!evidenceAttempt || patch.isPending}
            onClick={() => patch.mutate("completed")}
            title={evidenceAttempt ? undefined : "Complete a replay attempt for this drill first."}
          >
            <Check className="mr-1 h-3 w-3" /> Mark done
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 className="mr-1 h-3 w-3" /> Remove
        </Button>
      </div>

      {entry ? (
        <IntentDialog entry={entry} pending={launcher.pending} onClose={launcher.close} onStart={launcher.start} busy={launcher.isPending} />
      ) : null}
    </div>
  );
}

export function HomeworkQueue({ rows, entries, rollup }: { rows: HomeworkRow[]; entries: JournalEntry[]; rollup: Rollup }) {
  const open = rows.filter((r) => OPEN_STATUSES.includes((r.status as HomeworkStatus) ?? "accepted"));
  const done = rows.filter((r) => r.status === "completed").slice(0, 5);

  return (
    <Panel title="Homework" subtitle="Accepted drills — completion is proven by a replay attempt, not a checkbox">
      {open.length === 0 && done.length === 0 ? (
        <InlineEmpty text="Nothing queued. Accept a recommended drill and it lands here with its measurable target." />
      ) : (
        <div className="space-y-1.5">
          {open.map((r) => (
            <HomeworkItem key={r.id} row={r} entries={entries} rollup={rollup} />
          ))}
          {done.length > 0 && (
            <>
              <div className="pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Recently completed</div>
              {done.map((r) => (
                <HomeworkItem key={r.id} row={r} entries={entries} rollup={rollup} />
              ))}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
