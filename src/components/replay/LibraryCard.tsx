import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Archive, Clock, Copy, MoreHorizontal, Play, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createReplaySession,
  deleteReplaySession,
  updateReplaySession,
} from "@/lib/replay.functions";
import type { ReplaySession } from "@/lib/replay/types";
import { cn } from "@/lib/utils";

export function LibraryCard({ session }: { session: ReplaySession }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const updateFn = useServerFn(updateReplaySession);
  const createFn = useServerFn(createReplaySession);
  const delFn = useServerFn(deleteReplaySession);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["replay", "sessions"] });

  const favorite = useMutation({
    mutationFn: () => updateFn({ data: { id: session.id, is_favorite: !session.is_favorite } } as never),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: () => updateFn({ data: { id: session.id, status: session.status === "archived" ? "paused" : "archived" } } as never),
    onSuccess: () => { invalidate(); toast.success(session.status === "archived" ? "Unarchived" : "Archived"); },
  });
  const duplicate = useMutation({
    mutationFn: () => createFn({
      data: {
        title: `${session.title} (copy)`,
        mode: session.mode,
        market: session.market,
        symbol: session.symbol,
        timeframe: session.timeframe,
        replay_date: session.replay_date ?? undefined,
        range_start: session.range_start ?? undefined,
        range_end: session.range_end ?? undefined,
        provider: session.provider,
        tags: session.tags ?? [],
      } as never,
    } as never),
    onSuccess: (row: { id: string }) => {
      invalidate();
      toast.success("Session duplicated");
      navigate({ to: "/replay/session", search: { id: row.id } as never });
    },
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: session.id } } as never),
    onSuccess: () => { invalidate(); toast.success("Session deleted"); },
  });

  return (
    <motion.div whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
      <GlassCard interactive className="p-4 space-y-2.5 relative group">
        <Link
          to="/replay/session"
          search={{ id: session.id } as never}
          className="block space-y-2 pr-6"
          aria-label={`Resume ${session.title}`}
        >
          <div className="min-w-0">
            <div className="truncate font-semibold text-sm">{session.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {session.market} · {session.symbol} · {session.timeframe}
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${session.completion_pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className={cn(
              "capitalize rounded px-1.5 py-0.5",
              session.status === "active" && "bg-success/15 text-success",
              session.status === "paused" && "bg-warning/15 text-warning",
              session.status === "completed" && "bg-info/15 text-info",
              session.status === "archived" && "bg-muted text-muted-foreground",
            )}>
              {session.status}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.round((session.duration_seconds ?? 0) / 60)}m
            </span>
          </div>
          {session.tags?.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {session.tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </Link>

        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); favorite.mutate(); }}
            aria-label={session.is_favorite ? "Unfavorite" : "Favorite"}
          >
            <Star className={cn("h-3.5 w-3.5", session.is_favorite && "text-warning fill-warning")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => e.stopPropagation()} aria-label="More options">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => navigate({ to: "/replay/session", search: { id: session.id } as never })}>
                <Play className="mr-2 h-3.5 w-3.5" /> Continue
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => duplicate.mutate()} disabled={duplicate.isPending}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => archive.mutate()}>
                <Archive className="mr-2 h-3.5 w-3.5" />
                {session.status === "archived" ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => { if (confirm(`Delete "${session.title}"?`)) del.mutate(); }}
                className="text-danger focus:text-danger"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </GlassCard>
    </motion.div>
  );
}
