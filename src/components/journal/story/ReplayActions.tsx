/**
 * Replay entry points. Context (symbol, window, levels, setup) is handed to
 * Replay Studio through search params — comparison lands in Phase 3.
 */
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dumbbell, ListChecks, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JournalEntry } from "@/lib/journal/api";

export function useReplayContext(entry: JournalEntry) {
  const navigate = useNavigate();
  const search = {
    from: "journal" as const,
    entryId: entry.id,
    symbol: entry.symbol ?? undefined,
    date: (entry.opened_at ?? entry.created_at)?.slice(0, 10),
    start: entry.opened_at ?? undefined,
    end: entry.closed_at ?? undefined,
    entryPrice: entry.entry_price ?? undefined,
    exitPrice: entry.exit_price ?? undefined,
    stop: entry.stop_loss ?? undefined,
    target: entry.take_profit ?? undefined,
    setup: entry.setup ?? undefined,
  };
  return () => navigate({ to: "/replay", search: search as never });
}

export function ReplayActions({ entry, onSimilar }: { entry: JournalEntry; onSimilar: () => void }) {
  const replay = useReplayContext(entry);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="h-7 px-2 text-xs" onClick={replay}>
        <Play className="mr-1 h-3.5 w-3.5" /> Replay this trade
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={replay}>
        <Repeat className="mr-1 h-3.5 w-3.5" /> Practise this setup
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onSimilar}>
        <ListChecks className="mr-1 h-3.5 w-3.5" /> Review similar trades
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={() => toast.success("Added to homework — it will show up in your AI Coach queue.")}
      >
        <Dumbbell className="mr-1 h-3.5 w-3.5" /> Add to homework
      </Button>
    </div>
  );
}
