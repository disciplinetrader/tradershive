/**
 * JOURNAL X — PHASE 4 · replay entry points on the Trade Story.
 *
 * "Replay this trade" now starts a tracked practice attempt (intent card →
 * Replay Studio with future candles hidden) instead of a loose deep link.
 * The attempt history and improvement trend live directly underneath.
 */
import { Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JournalEntry } from "@/lib/journal/api";
import { availableModes, IntentDialog, PracticeButton, usePracticeLauncher } from "@/components/journal/replay/PracticeLauncher";
import { AttemptHistory } from "@/components/journal/replay/AttemptHistory";
import { MissingData } from "@/components/journal/story/primitives";
import { useNavigate } from "@tanstack/react-router";

/** Kept for callers that still want a plain deep link into Replay Studio. */
export function useReplayContext(entry: JournalEntry) {
  const navigate = useNavigate();
  const search = {
    from: "journal" as const,
    entryId: entry.id,
    symbol: entry.symbol ?? undefined,
    date: (entry.opened_at ?? entry.created_at)?.slice(0, 10),
    start: entry.opened_at ?? undefined,
    end: entry.closed_at ?? undefined,
    setup: entry.setup ?? undefined,
  };
  return () => navigate({ to: "/replay", search: search as never });
}

export function ReplayActions({ entry, onSimilar }: { entry: JournalEntry; onSimilar: () => void }) {
  const launcher = usePracticeLauncher(entry);
  const modes = availableModes(entry);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {modes.length ? (
          <PracticeButton entry={entry} launcher={launcher} />
        ) : (
          <MissingData label="This trade has no symbol or timestamp, so a replay context cannot be reconstructed." />
        )}
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onSimilar}>
          <ListChecks className="mr-1 h-3.5 w-3.5" /> Review similar trades
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
          <Link to="/replay">Open Replay Studio</Link>
        </Button>
      </div>

      <AttemptHistory entryId={entry.id} onPractiseAgain={() => launcher.open(modes[0] ?? "standard")} />

      {launcher.pending ? (
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
