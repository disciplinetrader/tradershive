/**
 * Chronological execution timeline. Selecting an event focuses the chart at
 * that moment; the chart reports focus back through the same selected id.
 */
import { useMemo } from "react";
import {
  Camera,
  CheckCircle2,
  Flag,
  History,
  Lightbulb,
  LogIn,
  LogOut,
  Shield,
  Sparkles,
  StickyNote,
} from "lucide-react";
import type { TimelineEvent, TimelineKind } from "@/lib/journal/story";
import { formatCurrency, formatNumber } from "@/lib/journal/format";
import { MissingData } from "./primitives";
import { cn } from "@/lib/utils";

const ICONS: Record<TimelineKind, typeof Flag> = {
  idea: Lightbulb,
  entry: LogIn,
  stop: Shield,
  target: Flag,
  screenshot: Camera,
  note: StickyNote,
  exit: LogOut,
  review: Sparkles,
  edit: History,
};

const TONE: Record<TimelineKind, string> = {
  idea: "text-muted-foreground",
  entry: "text-success",
  stop: "text-danger",
  target: "text-primary",
  screenshot: "text-muted-foreground",
  note: "text-muted-foreground",
  exit: "text-primary",
  review: "text-primary",
  edit: "text-muted-foreground",
};

export function ExecutionTimeline({
  events,
  selectedId,
  onSelect,
  shotUrls,
}: {
  events: TimelineEvent[];
  selectedId: string | null;
  onSelect: (e: TimelineEvent) => void;
  shotUrls: Record<string, string>;
}) {
  // Long histories stay cheap: only the most recent 60 events render.
  const visible = useMemo(() => (events.length > 60 ? events.slice(-60) : events), [events]);

  if (!events.length) return <MissingData label="No execution events recorded for this trade." />;

  return (
    <div className="max-h-[320px] overflow-y-auto pr-1">
      {events.length > visible.length ? (
        <p className="mb-2 text-[10px] text-muted-foreground">Showing the latest {visible.length} of {events.length} events.</p>
      ) : null}
      <ol className="relative space-y-1 border-l border-border/50 pl-3">
        {visible.map((e) => {
          const Icon = ICONS[e.kind] ?? CheckCircle2;
          const active = selectedId === e.id;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition",
                  active ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border/60 hover:bg-muted/25",
                )}
              >
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TONE[e.kind])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[12px] font-medium capitalize text-foreground">{e.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {e.at ? new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                    {e.price != null ? <span>@ {formatNumber(e.price, 5)}</span> : null}
                    {e.quantity != null ? <span>{formatNumber(e.quantity, 2)} lots</span> : null}
                    {e.pnlImpact != null ? (
                      <span className={e.pnlImpact > 0 ? "text-success" : e.pnlImpact < 0 ? "text-danger" : ""}>
                        {formatCurrency(e.pnlImpact)}
                      </span>
                    ) : null}
                  </div>
                  {e.detail ? <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{e.detail}</p> : null}
                  {e.screenshot && shotUrls[e.screenshot] ? (
                    <img
                      src={shotUrls[e.screenshot]}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="mt-1 h-14 rounded border border-border/50 object-cover"
                    />
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
