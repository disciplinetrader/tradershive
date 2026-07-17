import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Copy,
  Eye,
  Heart,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { JournalEntry, JournalTag } from "@/lib/journal/api";
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
  pnlTone,
  shortId,
  tradeResult,
} from "@/lib/journal/format";
import { GRADE_COLOR } from "@/lib/journal/constants";
import { cn } from "@/lib/utils";

export function TradeCard({
  entry,
  tags,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onShare,
  onFavorite,
  screenshotUrl,
}: {
  entry: JournalEntry;
  tags: JournalTag[];
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShare: () => void;
  onFavorite: () => void;
  screenshotUrl?: string | null;
}) {
  const [hovered, setHovered] = useState(false);
  const result = tradeResult(entry.pnl);
  const tone = pnlTone(entry.pnl);

  const badge = useMemo(() => {
    if (result === "win")
      return { text: "Win", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-400/30" };
    if (result === "loss")
      return { text: "Loss", cls: "bg-rose-500/10 text-rose-400 border-rose-400/30" };
    return { text: "BE", cls: "bg-muted/40 text-muted-foreground border-border" };
  }, [result]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -3 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      transition={{ duration: 0.25 }}
    >
      <GlassCard className="group flex h-full flex-col overflow-hidden p-0">
        <button
          type="button"
          onClick={onView}
          className="relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/10 via-transparent to-transparent text-left"
          aria-label={`Open trade ${entry.symbol ?? ""} details`}
        >
          {screenshotUrl ? (
            <img
              src={screenshotUrl}
              alt={entry.symbol ?? "Trade screenshot"}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs uppercase tracking-widest text-muted-foreground">
              No screenshot
            </div>
          )}
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <Badge className={cn("border font-semibold", badge.cls)}>{badge.text}</Badge>
            {entry.grade ? (
              <Badge className={cn("border font-semibold", GRADE_COLOR[entry.grade])}>
                {entry.grade}
              </Badge>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavorite();
            }}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:scale-110"
            aria-label={entry.is_favorite ? "Unfavorite" : "Favorite"}
          >
            <Heart className={cn("h-4 w-4", entry.is_favorite && "fill-rose-400 text-rose-400")} />
          </button>
        </button>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{entry.symbol ?? "—"}</p>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {entry.market ?? ""}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {entry.direction === "long" ? (
                  <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                ) : entry.direction === "short" ? (
                  <ArrowDownRight className="h-3 w-3 text-rose-400" />
                ) : null}
                {entry.direction ? entry.direction.toUpperCase() : ""} · #{shortId(entry.id)}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "text-base font-bold tabular-nums",
                  tone === "up" && "text-emerald-400",
                  tone === "down" && "text-rose-400",
                  tone === "flat" && "text-muted-foreground",
                )}
              >
                {entry.pnl != null ? formatCurrency(Number(entry.pnl)) : "—"}
              </p>
              {entry.rr != null ? (
                <p className="text-[11px] text-muted-foreground">{formatNumber(Number(entry.rr), 2)}R</p>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-[11px]">
            <Stat label="Entry" value={entry.entry_price != null ? formatNumber(Number(entry.entry_price), 5) : "—"} />
            <Stat label="Exit" value={entry.exit_price != null ? formatNumber(Number(entry.exit_price), 5) : "—"} />
            <Stat label="Hold" value={formatDuration(entry.duration_seconds)} />
          </dl>

          {entry.setup || entry.strategy ? (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {entry.setup ? (
                <span className="rounded-full border border-border bg-surface-2/40 px-2 py-0.5 text-muted-foreground">
                  {entry.setup.replace(/_/g, " ")}
                </span>
              ) : null}
              {entry.strategy ? (
                <span className="rounded-full border border-border bg-surface-2/40 px-2 py-0.5 text-muted-foreground">
                  {entry.strategy}
                </span>
              ) : null}
            </div>
          ) : null}

          {tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 4).map((t) => (
                <span
                  key={t.id}
                  className="rounded-full border px-2 py-0.5 text-[10px]"
                  style={{ borderColor: `${t.color}55`, color: t.color }}
                >
                  {t.name}
                </span>
              ))}
              {tags.length > 4 ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  +{tags.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}

          {entry.emotions?.length ? (
            <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {entry.emotions.slice(0, 3).map((e) => (
                <span key={e} className="rounded bg-muted/40 px-1.5 py-0.5">
                  {e.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
            <span>{formatDate(entry.closed_at ?? entry.created_at)}</span>
            <motion.div
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : 6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-1"
            >
              <IconBtn label="View" onClick={onView} icon={<Eye className="h-3.5 w-3.5" />} />
              <IconBtn label="Edit" onClick={onEdit} icon={<Pencil className="h-3.5 w-3.5" />} />
              <IconBtn label="Duplicate" onClick={onDuplicate} icon={<Copy className="h-3.5 w-3.5" />} />
              <IconBtn label="Share" onClick={onShare} icon={<Share2 className="h-3.5 w-3.5" />} />
              <IconBtn label="Delete" onClick={onDelete} icon={<Trash2 className="h-3.5 w-3.5" />} destructive />
            </motion.div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/30 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function IconBtn({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", destructive && "hover:text-rose-400")}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
    </Button>
  );
}
