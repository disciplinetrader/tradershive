/**
 * Mistakes grouped by phase, each with evidence, cost and detection source.
 * Phase 4 adds a per-mistake drill entry point straight into Replay Studio.
 */
import type { MistakeItem } from "@/lib/journal/story";
import type { JournalEntry } from "@/lib/journal/api";
import { FixMistakeButton, IntentDialog, usePracticeLauncher } from "@/components/journal/replay/PracticeLauncher";
import { formatNumber } from "@/lib/journal/format";
import { MissingData } from "./primitives";
import { cn } from "@/lib/utils";

const ORDER: MistakeItem["group"][] = ["setup", "entry", "risk", "management", "exit", "psychology", "process"];

export function MistakesPanel({ items, entry }: { items: MistakeItem[]; entry?: JournalEntry }) {
  const launcher = usePracticeLauncher(entry);
  if (!items.length) return <MissingData label="No mistakes tagged or detected on this trade." />;

  const groups = ORDER.map((g) => ({ g, list: items.filter((i) => i.group === g) })).filter((x) => x.list.length);

  return (
    <div className="space-y-2">
      {groups.map(({ g, list }) => (
        <div key={g}>
          <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">{g}</p>
          <ul className="space-y-1">
            {list.map((m) => (
              <li key={m.value} className="rounded border border-border/40 px-2 py-1.5">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[12px] font-medium text-foreground">{m.label}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-0.5 text-[9px] uppercase tracking-wide",
                      m.source === "user" ? "bg-muted/40 text-muted-foreground" : "bg-primary/10 text-primary",
                    )}
                  >
                    {m.source === "user" ? "You tagged" : "Rule detected"}
                  </span>
                </div>
                {m.evidence ? <p className="mt-0.5 text-[10px] text-muted-foreground">Evidence: {m.evidence}</p> : null}
                <div className="mt-0.5 flex flex-wrap gap-3 text-[10px] tabular-nums text-muted-foreground">
                  {m.costR != null ? <span className="text-danger">Cost ≈ {formatNumber(m.costR, 2)}R</span> : null}
                  <span>Seen {m.occurrences}×</span>
                </div>
                <p className="mt-0.5 text-[11px] text-foreground/80">Instead: {m.correct}</p>
                {entry && m.source === "user" ? (
                  <div className="mt-1">
                    <FixMistakeButton mistake={m.value} launcher={launcher} entry={entry} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {entry && launcher.pending ? (
        <IntentDialog
          entry={entry}
          pending={launcher.pending}
          busy={launcher.isPending}
          onClose={launcher.close}
          onStart={launcher.start}
        />
      ) : null}
    </div>
  );
}
