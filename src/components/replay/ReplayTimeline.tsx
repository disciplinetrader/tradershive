import { useMemo, useRef, useState } from "react";
import { Bookmark, Flag, TrendingDown, TrendingUp } from "lucide-react";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";

/**
 * Professional replay timeline. Renders a horizontal bar with
 * proportional markers for bookmarks, trade entries/exits and
 * checkpoints, plus a subtle session-band tint (Asia / London / NY)
 * so users can scrub visually across the session.
 */
export function ReplayTimeline() {
  const {
    candles,
    cursorIdx,
    setCursorIdx,
    bookmarks,
    trades,
    checkpoints,
  } = useReplay();

  const barRef = useRef<HTMLDivElement | null>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const total = candles.length;
  const cursorPct = total > 1 ? (cursorIdx / (total - 1)) * 100 : 0;

  // Cheap identity signature so memoized markers only recompute when the
  // underlying candle range or marker count actually changes — not on every
  // playback tick.
  const candleSig = candles.length ? `${candles.length}:${candles[0].time}:${candles[total - 1].time}` : "0";

  const toPct = (ts: number) => {
    if (total <= 1) return 0;
    let lo = 0, hi = total - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time < ts) lo = mid + 1; else hi = mid;
    }
    return (lo / (total - 1)) * 100;
  };

  const bmMarks = useMemo(
    () =>
      bookmarks.map((b) => ({
        id: b.id,
        pct: toPct(new Date(b.bookmark_ts).getTime()),
        label: b.label ?? "Bookmark",
        category: b.category ?? "custom",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candleSig, bookmarks.length, bookmarks],
  );

  const cpMarks = useMemo(
    () =>
      checkpoints.map((c) => ({
        id: c.id,
        pct: toPct(new Date(c.checkpoint_ts).getTime()),
        label: c.label ?? "Checkpoint",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candleSig, checkpoints.length, checkpoints],
  );

  const tradeMarks = useMemo(() => {
    const rows: {
      id: string;
      pct: number;
      kind: "entry" | "exit";
      dir: "long" | "short";
    }[] = [];
    for (const t of trades) {
      if (t.opened_at) {
        rows.push({
          id: `${t.id}-in`,
          pct: toPct(new Date(t.opened_at).getTime()),
          kind: "entry",
          dir: (t.direction ?? "long") as "long" | "short",
        });
      }
      if (t.closed_at) {
        rows.push({
          id: `${t.id}-out`,
          pct: toPct(new Date(t.closed_at).getTime()),
          kind: "exit",
          dir: (t.direction ?? "long") as "long" | "short",
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candleSig, trades.length, trades]);

  // Session bands (Asia / London / NY) painted as % ranges across the bar.
  // Walk candles once, collapse consecutive same-session runs to a range.
  const sessionBands = useMemo(() => {
    if (total < 2) return [] as Array<{ pct: number; width: number; key: string; cls: string }>;
    const bands: Array<{ pct: number; width: number; key: string; cls: string }> = [];
    const kindOf = (h: number) =>
      h >= 22 || h < 6 ? "asia" : h < 12 ? "london" : h < 17 ? "overlap" : "ny";
    const cls: Record<string, string> = {
      asia: "bg-info/10",
      london: "bg-warning/10",
      overlap: "bg-primary/10",
      ny: "bg-success/10",
    };
    let runStart = 0;
    let runKind = kindOf(new Date(candles[0].time).getUTCHours());
    for (let i = 1; i < total; i++) {
      const k = kindOf(new Date(candles[i].time).getUTCHours());
      if (k !== runKind) {
        bands.push({
          pct: (runStart / (total - 1)) * 100,
          width: ((i - runStart) / (total - 1)) * 100,
          key: `${runKind}-${runStart}`,
          cls: cls[runKind],
        });
        runStart = i;
        runKind = k;
      }
    }
    bands.push({
      pct: (runStart / (total - 1)) * 100,
      width: (((total - 1) - runStart) / (total - 1)) * 100,
      key: `${runKind}-${runStart}`,
      cls: cls[runKind],
    });
    return bands;
  }, [candleSig, candles, total]);

  const seek = (clientX: number) => {
    const el = barRef.current;
    if (!el || total <= 1) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setCursorIdx(Math.round(pct * (total - 1)));
  };

  const hoverTime =
    hoverPct != null
      ? candles[Math.round((hoverPct / 100) * (total - 1))]?.time
      : null;

  const cursorTs = candles[cursorIdx]?.time;
  const cursorLabel = cursorTs
    ? new Date(cursorTs).toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="rounded-[3px] border border-border/60 bg-card/60 p-2 backdrop-blur">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Timeline</span>
        <span className="tabular-nums">
          {cursorIdx + 1} / {total}
        </span>
      </div>
      <div
        ref={barRef}
        className="relative h-9 select-none rounded-[3px] border border-border/60 bg-background/60"
        onMouseMove={(e) => {
          const el = barRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          setHoverPct(((e.clientX - rect.left) / rect.width) * 100);
        }}
        onMouseLeave={() => setHoverPct(null)}
        onClick={(e) => seek(e.clientX)}
        role="slider"
        aria-label="Replay timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, total - 1)}
        aria-valuenow={cursorIdx}
        aria-valuetext={cursorLabel}
      >
        {/* Session bands (Asia / London / NY / overlap) — subtle tint layer */}
        {sessionBands.map((b) => (
          <div
            key={b.key}
            aria-hidden
            className={cn("absolute inset-y-0 pointer-events-none", b.cls)}
            style={{ left: `${b.pct}%`, width: `${b.width}%` }}
          />
        ))}

        {/* Filled progress */}
        <div
          className="absolute inset-y-0 left-0 bg-primary/15"
          style={{ width: `${cursorPct}%` }}
        />

        {/* Checkpoint markers (top) */}
        {cpMarks.map((m) => (
          <div
            key={m.id}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${m.pct}%` }}
            title={m.label}
          >
            <Flag className="h-3 w-3 text-warning drop-shadow" />
            <div className="h-9 w-px bg-warning/60" />
          </div>
        ))}

        {/* Trade markers (middle) */}
        {tradeMarks.map((m) => (
          <div
            key={m.id}
            className={cn(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-[2px]",
              m.dir === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
            )}
            style={{ left: `${m.pct}%` }}
            title={`Trade ${m.kind}`}
          >
            {m.dir === "long" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </div>
        ))}

        {/* Bookmark markers (bottom) */}
        {bmMarks.map((m) => (
          <div
            key={m.id}
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${m.pct}%` }}
            title={`${m.label} · ${m.category}`}
          >
            <div className="h-9 w-px bg-info/60" />
            <Bookmark className="h-3 w-3 text-info" />
          </div>
        ))}

        {/* Cursor */}
        <div
          className="absolute inset-y-[-2px] w-[2px] bg-primary shadow-[0_0_0_1px_hsl(var(--background))]"
          style={{ left: `${cursorPct}%` }}
        />

        {/* Hover tooltip */}
        {hoverPct != null && hoverTime ? (
          <div
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded-[3px] border border-border/60 bg-background/95 px-1.5 py-0.5 text-[10px] tabular-nums shadow"
            style={{ left: `${hoverPct}%` }}
          >
            {new Date(hoverTime).toLocaleString(undefined, {
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        ) : null}
      </div>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/90">
        <span className="inline-flex items-center gap-1">
          <Flag className="h-2.5 w-2.5 text-warning" /> Checkpoints ({cpMarks.length})
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-2.5 w-2.5 text-success" /> Trades ({trades.length})
        </span>
        <span className="inline-flex items-center gap-1">
          <Bookmark className="h-2.5 w-2.5 text-info" /> Bookmarks ({bmMarks.length})
        </span>
        <span className="ml-auto hidden sm:inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-info/40" /> Asia</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning/40" /> London</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/40" /> Overlap</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success/40" /> New York</span>
        </span>
      </div>
    </div>
  );
}

import { Bookmark, Flag, TrendingDown, TrendingUp } from "lucide-react";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";

/**
 * Professional replay timeline. Renders a horizontal bar with
 * proportional markers for bookmarks, trade entries/exits and
 * checkpoints so users can scrub visually across the session.
 */
export function ReplayTimeline() {
  const {
    candles,
    cursorIdx,
    setCursorIdx,
    bookmarks,
    trades,
    checkpoints,
  } = useReplay();

  const barRef = useRef<HTMLDivElement | null>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const total = candles.length;
  const cursorPct = total > 1 ? (cursorIdx / (total - 1)) * 100 : 0;

  const toPct = (ts: number) => {
    if (total <= 1) return 0;
    // Binary search for candle index at/after ts.
    let lo = 0, hi = total - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time < ts) lo = mid + 1; else hi = mid;
    }
    return (lo / (total - 1)) * 100;
  };

  const bmMarks = useMemo(
    () =>
      bookmarks.map((b) => ({
        id: b.id,
        pct: toPct(new Date(b.bookmark_ts).getTime()),
        label: b.label ?? "Bookmark",
        category: b.category ?? "custom",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarks, candles],
  );

  const cpMarks = useMemo(
    () =>
      checkpoints.map((c) => ({
        id: c.id,
        pct: toPct(new Date(c.checkpoint_ts).getTime()),
        label: c.label ?? "Checkpoint",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkpoints, candles],
  );

  const tradeMarks = useMemo(() => {
    const rows: {
      id: string;
      pct: number;
      kind: "entry" | "exit";
      dir: "long" | "short";
    }[] = [];
    for (const t of trades) {
      if (t.opened_at) {
        rows.push({
          id: `${t.id}-in`,
          pct: toPct(new Date(t.opened_at).getTime()),
          kind: "entry",
          dir: (t.direction ?? "long") as "long" | "short",
        });
      }
      if (t.closed_at) {
        rows.push({
          id: `${t.id}-out`,
          pct: toPct(new Date(t.closed_at).getTime()),
          kind: "exit",
          dir: (t.direction ?? "long") as "long" | "short",
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, candles]);

  const seek = (clientX: number) => {
    const el = barRef.current;
    if (!el || total <= 1) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setCursorIdx(Math.round(pct * (total - 1)));
  };

  const hoverTime =
    hoverPct != null
      ? candles[Math.round((hoverPct / 100) * (total - 1))]?.time
      : null;

  return (
    <div className="rounded-[3px] border border-border/60 bg-card/60 p-2 backdrop-blur">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Timeline</span>
        <span className="tabular-nums">
          {cursorIdx + 1} / {total}
        </span>
      </div>
      <div
        ref={barRef}
        className="relative h-9 select-none rounded-[3px] border border-border/60 bg-background/60"
        onMouseMove={(e) => {
          const el = barRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          setHoverPct(((e.clientX - rect.left) / rect.width) * 100);
        }}
        onMouseLeave={() => setHoverPct(null)}
        onClick={(e) => seek(e.clientX)}
        role="slider"
        aria-label="Replay timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, total - 1)}
        aria-valuenow={cursorIdx}
      >
        {/* Filled progress */}
        <div
          className="absolute inset-y-0 left-0 bg-primary/15"
          style={{ width: `${cursorPct}%` }}
        />

        {/* Checkpoint markers (top) */}
        {cpMarks.map((m) => (
          <div
            key={m.id}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${m.pct}%` }}
            title={m.label}
          >
            <Flag className="h-3 w-3 text-warning drop-shadow" />
            <div className="h-9 w-px bg-warning/60" />
          </div>
        ))}

        {/* Trade markers (middle) */}
        {tradeMarks.map((m) => (
          <div
            key={m.id}
            className={cn(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-[2px]",
              m.dir === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
            )}
            style={{ left: `${m.pct}%` }}
            title={`Trade ${m.kind}`}
          >
            {m.dir === "long" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </div>
        ))}

        {/* Bookmark markers (bottom) */}
        {bmMarks.map((m) => (
          <div
            key={m.id}
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${m.pct}%` }}
            title={`${m.label} · ${m.category}`}
          >
            <div className="h-9 w-px bg-info/60" />
            <Bookmark className="h-3 w-3 text-info" />
          </div>
        ))}

        {/* Cursor */}
        <div
          className="absolute inset-y-[-2px] w-[2px] bg-primary shadow-[0_0_0_1px_hsl(var(--background))]"
          style={{ left: `${cursorPct}%` }}
        />

        {/* Hover tooltip */}
        {hoverPct != null && hoverTime ? (
          <div
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded-[3px] border border-border/60 bg-background/95 px-1.5 py-0.5 text-[10px] tabular-nums shadow"
            style={{ left: `${hoverPct}%` }}
          >
            {new Date(hoverTime).toLocaleString(undefined, {
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        ) : null}
      </div>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Flag className="h-2.5 w-2.5 text-warning" /> Checkpoints ({cpMarks.length})
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-2.5 w-2.5 text-success" /> Trades ({trades.length})
        </span>
        <span className="inline-flex items-center gap-1">
          <Bookmark className="h-2.5 w-2.5 text-info" /> Bookmarks ({bmMarks.length})
        </span>
      </div>
    </div>
  );
}
