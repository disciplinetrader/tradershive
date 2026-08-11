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
/**
 * Open replay at this trade.
 *
 * Two mechanisms, and the fallback is not a degraded one:
 *
 *  · `observation_cursor` is the exact observation index the fill landed on
 *    inside a frozen replay dataset. It exists only for replay- and
 *    battle-originated trades, where the index is authoritative and can differ
 *    from what a timestamp lookup would resolve to. When present, use it.
 *
 *  · A live paper trade has no cursor because there is no dataset to index
 *    into. Its `opened_at`/`closed_at` are real market times, which map
 *    deterministically onto candles once a timeframe is chosen — so
 *    reconstruction there is the CORRECT method, not a lesser one.
 *
 * Both are always sent: the cursor is the precise anchor, the timestamps stay
 * as the window to load around it.
 */
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
    cursor: entry.observation_cursor ?? undefined,
    anchor: entry.observation_cursor != null ? ("cursor" as const) : ("timestamp" as const),
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
