/**
 * Sprint 4 — Replay session loading skeleton.
 *
 * Renders a chart-shaped shimmer, session identity chip and progress
 * strip so the trader never sees a blank shell while candles fetch.
 * All context is available from the session row (which resolves before
 * candles), so the workspace feels intentional even during the first
 * paint after preload was skipped.
 */
import { Activity, CalendarClock, Loader2 } from "lucide-react";
import type { ReplaySession } from "@/lib/replay/types";

export function ReplaySkeleton({ session }: { session: ReplaySession | null }) {
  return (
    <div className="flex min-h-[calc(100dvh-0px)] flex-col">
      {/* Toolbar surrogate */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-card/40 px-3 py-1.5 backdrop-blur">
        <span className="rounded-[3px] border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
          Replay
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-bold">
            {session?.title ?? <span className="inline-block h-3 w-40 animate-pulse rounded bg-muted/60" />}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            {session ? (
              <>
                <span>{session.market}</span>
                <span>·</span>
                <span className="font-mono">{session.symbol}</span>
                <span>·</span>
                <span>{session.timeframe}</span>
              </>
            ) : (
              <span className="inline-block h-2.5 w-24 animate-pulse rounded bg-muted/60" />
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Loading historical candles…
        </div>
      </div>

      {/* Chart surrogate */}
      <div className="relative flex min-h-0 flex-1 items-end overflow-hidden bg-gradient-to-b from-background/40 to-background">
        {/* Faux gridlines */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border)/0.35) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)/0.25) 1px, transparent 1px)",
            backgroundSize: "80px 60px",
          }}
        />
        {/* Candle shimmer */}
        <div className="relative z-10 flex h-full w-full items-end gap-[3px] px-4 pb-6">
          {Array.from({ length: 96 }).map((_, i) => {
            const h = 20 + ((i * 37) % 65);
            const up = (i * 13) % 3 !== 0;
            return (
              <div
                key={i}
                className={
                  "w-[6px] shrink-0 animate-pulse rounded-[1px] " +
                  (up ? "bg-success/25" : "bg-danger/25")
                }
                style={{ height: `${h}%`, animationDelay: `${(i % 12) * 40}ms` }}
              />
            );
          })}
        </div>

        {/* Center status card */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-2.5 text-center shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Preparing your replay
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              {session?.replay_date ?? "Historical range"} · {session?.timeframe ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline surrogate */}
      <div className="border-t border-border/40 bg-card/40 px-3 py-1.5">
        <div className="h-9 w-full animate-pulse rounded-[3px] bg-muted/40" />
      </div>
    </div>
  );
}
