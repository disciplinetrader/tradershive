import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Camera, MessageSquare, Smile } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { JournalEntry } from "@/lib/journal/api";
import { formatCurrency, formatDateTime, pnlTone, shortId } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

export function TimelineView({
  entries,
  onView,
  screenshotUrls,
}: {
  entries: JournalEntry[];
  onView: (id: string) => void;
  screenshotUrls: Record<string, string>;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    entries.forEach((e) => {
      const iso = e.closed_at ?? e.created_at;
      const d = new Date(iso);
      const key = d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  if (!entries.length) return null;

  return (
    <div className="space-y-6">
      {grouped.map(([day, list]) => (
        <div key={day}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {new Date(day + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <ol className="relative space-y-3 border-l border-border/60 pl-6">
            {list.map((e, i) => {
              const tone = pnlTone(e.pnl);
              const url = screenshotUrls[e.screenshots?.[0] ?? ""];
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.25 }}
                  className="relative"
                >
                  <span
                    className={cn(
                      "absolute -left-[26px] top-3 grid h-4 w-4 place-items-center rounded-full border",
                      tone === "up" && "border-success/60 bg-success/20",
                      tone === "down" && "border-danger/60 bg-danger/20",
                      tone === "flat" && "border-border bg-surface",
                    )}
                  >
                    {tone === "up" ? (
                      <ArrowUpRight className="h-2.5 w-2.5 text-success" />
                    ) : tone === "down" ? (
                      <ArrowDownRight className="h-2.5 w-2.5 text-danger" />
                    ) : null}
                  </span>
                  <GlassCard
                    interactive
                    className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-3 p-3"
                    onClick={() => onView(e.id)}
                  >
                    <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/30">
                      {url ? (
                        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Camera className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{e.symbol ?? "—"}</p>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{e.direction ?? ""}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">#{shortId(e.id)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(e.closed_at ?? e.created_at)}
                        {e.setup ? ` · ${e.setup.replace(/_/g, " ")}` : ""}
                      </p>
                      {e.emotions?.length ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Smile className="h-3 w-3" /> {e.emotions.slice(0, 3).join(" · ")}
                        </p>
                      ) : null}
                      {e.notes_text ? (
                        <p className="mt-1 line-clamp-2 flex items-start gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="truncate">{e.notes_text}</span>
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-right font-mono text-sm font-semibold tabular-nums",
                        tone === "up" && "text-success",
                        tone === "down" && "text-danger",
                      )}
                    >
                      {e.pnl != null ? formatCurrency(Number(e.pnl)) : "—"}
                    </p>
                  </GlassCard>
                </motion.li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
