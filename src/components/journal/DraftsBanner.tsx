/**
 * DraftsBanner — the first thing a trader sees on the Journal landing.
 *
 * Drafts are the highest-friction blocker to a healthy journaling habit,
 * so we surface them above everything else with three one-click actions:
 * Continue Editing, Publish, Delete. Publishing is a single mutation —
 * no confirmation modal — because a draft becoming published is
 * recoverable (edit again) but *not* publishing is not (the habit dies).
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, FileEdit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import {
  deleteEntry,
  journalKeys,
  updateEntry,
  type JournalEntry,
} from "@/lib/journal/api";
import { generateJournalTitle } from "@/lib/journal/auto-title";
import { formatCurrency } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

export function DraftsBanner({
  entries,
  onContinue,
}: {
  entries: JournalEntry[];
  onContinue: (id: string) => void;
}) {
  const qc = useQueryClient();

  const drafts = useMemo(
    () =>
      entries
        .filter((e) => e.status === "draft")
        .sort(
          (a, b) =>
            new Date(b.updated_at ?? b.created_at).getTime() -
            new Date(a.updated_at ?? a.created_at).getTime(),
        )
        .slice(0, 6),
    [entries],
  );

  const publishMut = useMutation({
    mutationFn: (id: string) => updateEntry(id, { status: "published" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: journalKeys.list() });
      const prev = qc.getQueryData<JournalEntry[]>(journalKeys.list());
      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (list) =>
        list ? list.map((e) => (e.id === id ? { ...e, status: "published" } : e)) : list,
      );
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(journalKeys.list(), ctx.prev);
      toast.error(err.message);
    },
    onSuccess: () => toast.success("Published"),
    onSettled: () => qc.invalidateQueries({ queryKey: journalKeys.list() }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: journalKeys.list() });
      const prev = qc.getQueryData<JournalEntry[]>(journalKeys.list());
      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (list) =>
        list ? list.filter((e) => e.id !== id) : list,
      );
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(journalKeys.list(), ctx.prev);
      toast.error(err.message);
    },
    onSuccess: () => toast.success("Draft deleted"),
    onSettled: () => qc.invalidateQueries({ queryKey: journalKeys.list() }),
  });

  if (drafts.length === 0) return null;

  return (
    <GlassCard
      className="border-amber-400/30 bg-amber-500/[0.04] p-4"
      aria-label="Drafts waiting for review"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-amber-400" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">
            Drafts waiting for review
          </h2>
          <Badge variant="outline" className="border-amber-400/40 text-amber-300">
            {drafts.length}
          </Badge>
        </div>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          One click to publish · edits are still allowed after
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="list">
        {drafts.map((entry) => (
          <motion.li
            key={entry.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "group flex items-center justify-between gap-3 rounded-lg border border-border/60",
              "bg-background/40 px-3 py-2 hover:border-primary/40",
            )}
          >
            <button
              type="button"
              onClick={() => onContinue(entry.id)}
              className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
              aria-label={`Continue editing ${generateJournalTitle(entry)}`}
            >
              <p className="truncate text-sm font-medium text-foreground">
                {generateJournalTitle(entry)}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {entry.pnl != null ? formatCurrency(Number(entry.pnl)) : "No P&L"}
                {" · "}
                {relativeTime(entry.updated_at ?? entry.created_at)}
              </p>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-success hover:bg-success/10"
                onClick={() => publishMut.mutate(entry.id)}
                disabled={publishMut.isPending}
                aria-label={`Publish ${generateJournalTitle(entry)}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Publish</span>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-danger"
                onClick={() => deleteMut.mutate(entry.id)}
                disabled={deleteMut.isPending}
                aria-label={`Delete draft ${generateJournalTitle(entry)}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.li>
        ))}
      </ul>
    </GlassCard>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
