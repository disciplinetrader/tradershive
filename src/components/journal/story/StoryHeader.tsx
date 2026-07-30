/**
 * Compact sticky header for the Trade Story. Identity + outcome on one row,
 * every action reachable without scrolling.
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Play,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JournalEntry } from "@/lib/journal/api";
import { GRADE_COLOR } from "@/lib/journal/constants";
import { formatCurrency, formatDateTime, formatNumber, shortId } from "@/lib/journal/format";
import { sessionLabel, setupLabel } from "@/lib/journal/story";
import { cn } from "@/lib/utils";

export function StoryHeader({
  entry,
  hiveDelta,
  prevId,
  nextId,
  onEdit,
  onAddNote,
  onAddScreenshot,
  onReplay,
  onDelete,
}: {
  entry: JournalEntry;
  hiveDelta: number | null;
  prevId: string | null;
  nextId: string | null;
  onEdit: () => void;
  onAddNote: () => void;
  onAddScreenshot: () => void;
  onReplay: () => void;
  onDelete: () => void;
}) {
  const pnl = entry.pnl == null ? null : Number(entry.pnl);
  const r = entry.rr == null ? null : Number(entry.rr);
  const long = entry.direction !== "short";

  return (
    <div className="sticky top-0 z-30 -mx-1 rounded-lg border border-border/60 bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
          <Link to="/journal/trades"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Trades</Link>
        </Button>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold tracking-tight">{entry.symbol ?? "Untitled"}</span>
          {entry.direction ? (
            <Badge
              className={cn(
                "h-5 border px-1.5 text-[10px] font-semibold",
                long ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger",
              )}
            >
              {long ? <ArrowUpRight className="mr-0.5 h-3 w-3" /> : <ArrowDownRight className="mr-0.5 h-3 w-3" />}
              {long ? "LONG" : "SHORT"}
            </Badge>
          ) : null}
          {entry.grade ? (
            <Badge className={cn("h-5 border px-1.5 text-[10px] font-bold", GRADE_COLOR[entry.grade])}>{entry.grade}</Badge>
          ) : null}
          <Badge variant="outline" className="h-5 border-border/60 px-1.5 text-[10px] capitalize text-muted-foreground">
            {entry.status ?? "draft"}
          </Badge>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 text-[11px] text-muted-foreground lg:flex">
          <span className="truncate">{formatDateTime(entry.opened_at ?? entry.created_at)}</span>
          <span className="truncate">{sessionLabel(entry.session as string | null)}</span>
          <span className="truncate">{entry.setup ? setupLabel(entry.setup) : "No setup"}</span>
          <span className="truncate">#{shortId(entry.id)}</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Stat label="Net P/L" value={formatCurrency(pnl)} tone={pnl == null ? "flat" : pnl > 0 ? "up" : pnl < 0 ? "down" : "flat"} />
          <Stat label="R" value={r == null ? "—" : `${r > 0 ? "+" : ""}${formatNumber(r, 2)}R`} tone={r == null ? "flat" : r > 0 ? "up" : r < 0 ? "down" : "flat"} />
          <Stat
            label="Hive"
            value={hiveDelta == null ? "—" : `${hiveDelta > 0 ? "+" : ""}${formatNumber(hiveDelta, 1)}`}
            tone={hiveDelta == null ? "flat" : hiveDelta > 0 ? "up" : hiveDelta < 0 ? "down" : "flat"}
          />
        </div>

        <div className="flex items-center gap-1">
          <NavBtn to={prevId} dir="prev" />
          <NavBtn to={nextId} dir="next" />
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onAddNote} title="Add note">
            <StickyNote className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onAddScreenshot} title="Add screenshot">
            <Camera className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onReplay}>
            <Play className="mr-1 h-3.5 w-3.5" /> Replay
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-1.5" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddScreenshot}>Add screenshot</DropdownMenuItem>
              <DropdownMenuItem onClick={onReplay}>Replay this trade</DropdownMenuItem>
              <DropdownMenuItem className="text-danger focus:text-danger" onClick={onDelete}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete entry
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "flat" }) {
  return (
    <div className="text-right leading-tight">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
          tone === "flat" && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function NavBtn({ to, dir }: { to: string | null; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  if (!to) {
    return (
      <Button variant="ghost" size="sm" className="h-7 px-1.5 opacity-40" disabled aria-label={`${dir} trade`}>
        <Icon className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size="sm" className="h-7 px-1.5">
      <Link to="/journal/$entryId" params={{ entryId: to }} aria-label={`${dir} trade`}>
        <Icon className="h-4 w-4" />
      </Link>
    </Button>
  );
}
