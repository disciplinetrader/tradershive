/**
 * Journal Statistics V2 — Simplified summary.
 *
 * Shows five KPI cards + a Session Performance strip. Advanced metrics
 * (Profit Factor, Expectancy, Sharpe, DD, Equity Curve) intentionally
 * live in the Analytics section, not here.
 *
 * Reusable: `SummaryCard` and `SessionCard` are exported so future metrics
 * can be added without redesigning the container.
 */

import { useMemo, type ComponentType, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Hash,
  Heart,
  Info,
  Percent,
  Sigma,
  Target,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { JournalEntry } from "@/lib/journal/api";
import { formatNumber } from "@/lib/journal/format";
import { usePersistentDisclosure } from "@/hooks/use-persistent-disclosure";
import { normalizeEmotions, emotionMeta } from "@/lib/journal/emotions";
import { DEFAULT_EMOTIONS } from "@/lib/journal/constants";
import { cn } from "@/lib/utils";


type Tone = "up" | "down" | "neutral";

const MIN_TRADES_FOR_MEANING = 5;

/* ----------------------------------------------------- session mapping */

type SessionKey = "london" | "new_york" | "asian";

const SESSION_LABEL: Record<SessionKey, string> = {
  london: "London",
  new_york: "New York",
  asian: "Asian",
};

/** Map raw DB session values to the 3 top-level sessions shown in Journal. */
function toSessionKey(raw: string | null | undefined): SessionKey | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "london") return "london";
  if (v === "new_york") return "new_york";
  if (v === "london_ny_overlap") return "new_york"; // dominant NY liquidity
  if (v === "asia" || v === "tokyo" || v === "sydney") return "asian";
  return null;
}

/* ------------------------------------------------------------ duration */

function formatHoldTime(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return "<1 min";
}

/* ------------------------------------------------------------- compute */

type SessionStat = {
  key: SessionKey;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netR: number;
};

type EmotionStat = {
  value: string;
  label: string;
  emoji: string;
  trades: number;
  wins: number;
  winRate: number;
  avgR: number;
  netR: number;
  share: number;
};

type PositionKey = "long" | "short";
type PositionStat = {
  key: PositionKey;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  netR: number;
  profitFactor: number | null;
};

function computeStats(entries: JournalEntry[]) {
  const completed = entries.filter((e) => e.pnl != null);
  const total = completed.length;

  let wins = 0;
  let netR = 0;
  let rCount = 0;
  let rSum = 0;
  let durationSum = 0;
  let durationCount = 0;

  const sessions: Record<SessionKey, SessionStat> = {
    london: { key: "london", trades: 0, wins: 0, losses: 0, winRate: 0, netR: 0 },
    new_york: { key: "new_york", trades: 0, wins: 0, losses: 0, winRate: 0, netR: 0 },
    asian: { key: "asian", trades: 0, wins: 0, losses: 0, winRate: 0, netR: 0 },
  };

  type EmoAcc = { trades: number; wins: number; rSum: number; rCount: number };
  const emoAcc = new Map<string, EmoAcc>();

  type PosAcc = { trades: number; wins: number; losses: number; rSum: number; rCount: number; grossWin: number; grossLoss: number };
  const posAcc: Record<PositionKey, PosAcc> = {
    long: { trades: 0, wins: 0, losses: 0, rSum: 0, rCount: 0, grossWin: 0, grossLoss: 0 },
    short: { trades: 0, wins: 0, losses: 0, rSum: 0, rCount: 0, grossWin: 0, grossLoss: 0 },
  };

  for (const e of completed) {
    const pnl = Number(e.pnl ?? 0);
    const r = e.rr != null ? Number(e.rr) : null;
    const isWin = pnl > 0;
    const isLoss = pnl < 0;

    if (isWin) wins += 1;
    if (r != null && Number.isFinite(r)) {
      netR += r;
      rSum += r;
      rCount += 1;
    }
    if (e.duration_seconds && e.duration_seconds > 0) {
      durationSum += e.duration_seconds;
      durationCount += 1;
    }

    const sk = toSessionKey(e.session as string | null | undefined);
    if (sk) {
      const s = sessions[sk];
      s.trades += 1;
      if (isWin) s.wins += 1;
      if (isLoss) s.losses += 1;
      if (r != null && Number.isFinite(r)) s.netR += r;
    }

    // Emotions — normalize legacy values onto canonical set (+ "unknown").
    const canonicalEmos = normalizeEmotions(
      (e.emotions as readonly (string | null | undefined)[] | null | undefined) ?? null,
    );
    const emos = canonicalEmos.length ? canonicalEmos : ["unknown"];
    for (const em of emos) {
      const acc = emoAcc.get(em) ?? { trades: 0, wins: 0, rSum: 0, rCount: 0 };
      acc.trades += 1;
      if (isWin) acc.wins += 1;
      if (r != null && Number.isFinite(r)) { acc.rSum += r; acc.rCount += 1; }
      emoAcc.set(em, acc);
    }

    // Position type — derived from trade_type if present.
    const tt = String((e as { trade_type?: string | null }).trade_type ?? "").toLowerCase();
    const pk: PositionKey | null = tt === "long" || tt === "buy" ? "long"
      : tt === "short" || tt === "sell" ? "short" : null;
    if (pk) {
      const p = posAcc[pk];
      p.trades += 1;
      if (isWin) p.wins += 1;
      if (isLoss) p.losses += 1;
      if (r != null && Number.isFinite(r)) {
        p.rSum += r; p.rCount += 1;
        if (r > 0) p.grossWin += r;
        if (r < 0) p.grossLoss += Math.abs(r);
      }
    }
  }

  (Object.keys(sessions) as SessionKey[]).forEach((k) => {
    const s = sessions[k];
    s.winRate = s.trades ? (s.wins / s.trades) * 100 : 0;
  });

  const winRate = total ? (wins / total) * 100 : 0;
  const avgR = rCount ? rSum / rCount : 0;
  const avgHold = durationCount ? durationSum / durationCount : 0;

  const hasR = rCount > 0;
  const hasHold = durationCount > 0;

  // Best session: prefer highest Net R, need at least 3 trades to qualify.
  const sessionList = Object.values(sessions);
  const eligible = sessionList.filter((s) => s.trades >= 3);
  const bestSessionKey =
    (eligible.length ? eligible : sessionList.filter((s) => s.trades > 0))
      .sort((a, b) => b.netR - a.netR)[0]?.key ?? null;

  // Build emotion list — canonical order first, then any leftovers (e.g. unknown).
  const emotionOrder = [...DEFAULT_EMOTIONS.map((o) => o.value), "unknown"];
  const emotions: EmotionStat[] = [];
  for (const value of emotionOrder) {
    const acc = emoAcc.get(value);
    if (!acc || acc.trades === 0) continue;
    const meta = emotionMeta(value);
    emotions.push({
      value,
      label: meta.label,
      emoji: meta.emoji ?? "",
      trades: acc.trades,
      wins: acc.wins,
      winRate: acc.trades ? (acc.wins / acc.trades) * 100 : 0,
      avgR: acc.rCount ? acc.rSum / acc.rCount : 0,
      netR: acc.rSum,
      share: total ? (acc.trades / total) * 100 : 0,
    });
  }

  const positions: PositionStat[] = (Object.keys(posAcc) as PositionKey[]).map((k) => {
    const p = posAcc[k];
    return {
      key: k,
      trades: p.trades,
      wins: p.wins,
      losses: p.losses,
      winRate: p.trades ? (p.wins / p.trades) * 100 : 0,
      avgR: p.rCount ? p.rSum / p.rCount : 0,
      netR: p.rSum,
      profitFactor: p.grossLoss > 0 ? p.grossWin / p.grossLoss : (p.grossWin > 0 ? Infinity : null),
    };
  });

  return {
    total,
    winRate,
    avgR,
    netR,
    avgHold,
    hasR,
    hasHold,
    sessions: sessionList,
    bestSessionKey,
    emotions,
    positions,
    isSparse: total < MIN_TRADES_FOR_MEANING,
  };
}

/* ---------------------------------------------------- summary card API */

type SummaryCardProps = {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tooltip: string;
  tone?: Tone;
  index?: number;
};

export function SummaryCard({
  label,
  value,
  icon: Icon,
  tooltip,
  tone = "neutral",
  index = 0,
}: SummaryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
    >
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${label}`}
                  className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </div>
          <Icon className="h-4 w-4 text-muted-foreground/70" />
        </div>
        <div
          className={cn(
            "mt-3 text-2xl font-bold tracking-tight tabular-nums",
            tone === "up" && "text-success",
            tone === "down" && "text-danger",
          )}
        >
          {value}
        </div>
      </GlassCard>
    </motion.div>
  );
}

/* --------------------------------------------------------- session card */

function SessionCard({
  stat,
  best,
  index,
}: {
  stat: SessionStat;
  best: boolean;
  index: number;
}) {
  const hasTrades = stat.trades > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <GlassCard
        className={cn(
          "p-4 transition-colors",
          best && "ring-1 ring-primary/40 bg-primary/5",
        )}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{SESSION_LABEL[stat.key]}</p>
          {best ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Best
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-2xl font-bold tabular-nums">
          {hasTrades ? `${formatNumber(stat.winRate, 0)}%` : "—"}
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades</dt>
            <dd className="font-semibold tabular-nums">{stat.trades}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Wins</dt>
            <dd className="font-semibold tabular-nums text-success">{stat.wins}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Losses</dt>
            <dd className="font-semibold tabular-nums text-danger">{stat.losses}</dd>
          </div>
        </dl>

        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Net R</span>
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              hasTrades && stat.netR > 0 && "text-success",
              hasTrades && stat.netR < 0 && "text-danger",
            )}
          >
            {hasTrades ? `${stat.netR >= 0 ? "+" : ""}${formatNumber(stat.netR, 2)}R` : "—"}
          </span>
        </div>
      </GlassCard>
    </motion.div>
  );
}

/* ---------------------------------------------------------- main entry */

export type JournalStatsHandlers = {
  onFilterEmotion?: (value: string) => void;
  onFilterPosition?: (position: "long" | "short") => void;
};

export function JournalStats({
  entries,
  onFilterEmotion,
  onFilterPosition,
}: { entries: JournalEntry[] } & JournalStatsHandlers) {
  const stats = useMemo(() => computeStats(entries), [entries]);
  const [open, , toggle] = usePersistentDisclosure("journal-stats", false);

  const rTone = (v: number): Tone => (v > 0 ? "up" : v < 0 ? "down" : "neutral");
  const signed = (v: number, digits = 2) =>
    `${v >= 0 ? "+" : ""}${formatNumber(v, digits)}R`;

  // Compact 1-line summary — always visible.
  const summary = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground tabular-nums">{stats.total}</span> trades
      </span>
      <span>
        Win rate{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {stats.total ? `${formatNumber(stats.winRate, 0)}%` : "—"}
        </span>
      </span>
      <span>
        Net R{" "}
        <span
          className={cn(
            "font-semibold tabular-nums",
            stats.hasR && stats.netR > 0 && "text-success",
            stats.hasR && stats.netR < 0 && "text-danger",
            !stats.hasR && "text-foreground",
          )}
        >
          {stats.hasR ? signed(stats.netR) : "—"}
        </span>
      </span>
      <span>
        Avg R{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {stats.hasR ? signed(stats.avgR) : "—"}
        </span>
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-2.5">
        {summary}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
        >
          {open ? "Hide stats" : "View stats"}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open ? (
        <div className="space-y-4">
          {stats.isSparse ? (
            <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
              Complete more trades to unlock meaningful statistics.
            </p>
          ) : null}

          {/* Top KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <SummaryCard
              index={0}
              label="Net R"
              icon={Sigma}
              tooltip="The total R multiple earned across all completed trades."
              tone={stats.hasR ? rTone(stats.netR) : "neutral"}
              value={stats.hasR ? signed(stats.netR) : "—"}
            />
            <SummaryCard
              index={1}
              label="Win Rate"
              icon={Percent}
              tooltip="Percentage of completed trades that finished profitable."
              value={stats.total ? `${formatNumber(stats.winRate, 0)}%` : "—"}
            />
            <SummaryCard
              index={2}
              label="Average R"
              icon={Target}
              tooltip="The average R multiple earned per completed trade."
              tone={stats.hasR ? rTone(stats.avgR) : "neutral"}
              value={stats.hasR ? signed(stats.avgR) : "—"}
            />
            <SummaryCard
              index={3}
              label="Total Trades"
              icon={Hash}
              tooltip="Number of completed trades logged in the journal."
              value={stats.total}
            />
            <SummaryCard
              index={4}
              label="Average Hold"
              icon={Clock}
              tooltip="The average amount of time trades remain open."
              value={stats.hasHold ? formatHoldTime(stats.avgHold) : "—"}
            />
          </div>

          {/* Session performance */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Session Performance
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {stats.sessions.map((s, i) => (
                <SessionCard
                  key={s.key}
                  stat={s}
                  best={!stats.isSparse && stats.bestSessionKey === s.key && s.trades > 0}
                  index={i}
                />
              ))}
            </div>
          </div>

          {/* Emotion analytics */}
          {stats.emotions.length ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Emotion Analytics
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {stats.emotions.map((em, i) => {
                  const clickable = !!onFilterEmotion && em.value !== "unknown";
                  return (
                    <motion.button
                      key={em.value}
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && onFilterEmotion?.(em.value)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className={cn(
                        "group rounded-lg border border-border/60 bg-card/40 p-3 text-left transition",
                        clickable && "cursor-pointer hover:border-primary/60 hover:bg-card/60",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{em.label}</span>
                        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                          {formatNumber(em.share, 0)}%
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                        {em.trades} trade{em.trades === 1 ? "" : "s"} · Win {formatNumber(em.winRate, 0)}%
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Net R</span>
                        <span
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            em.netR > 0 && "text-success",
                            em.netR < 0 && "text-danger",
                          )}
                        >
                          {em.netR >= 0 ? "+" : ""}{formatNumber(em.netR, 2)}R
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Position analytics */}
          {stats.positions.some((p) => p.trades > 0) ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Position Analytics
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {stats.positions.map((p, i) => {
                  const isLong = p.key === "long";
                  const Icon = isLong ? ArrowUpRight : ArrowDownRight;
                  const tone = isLong ? "text-success" : "text-danger";
                  const clickable = !!onFilterPosition && p.trades > 0;
                  return (
                    <motion.button
                      key={p.key}
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && onFilterPosition?.(p.key)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                      className={cn(
                        "rounded-lg border border-border/60 bg-card/40 p-4 text-left transition",
                        clickable && "cursor-pointer hover:border-primary/60 hover:bg-card/60",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className={cn("flex items-center gap-2 text-sm font-semibold uppercase tracking-wider", tone)}>
                          <Icon className="h-4 w-4" />
                          {isLong ? "Buy · Long" : "Sell · Short"}
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {p.trades} trade{p.trades === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                        <div>
                          <div className="uppercase tracking-wider">Wins</div>
                          <div className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">{p.wins}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider">Losses</div>
                          <div className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">{p.losses}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider">Win Rate</div>
                          <div className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                            {formatNumber(p.winRate, 0)}%
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider">Avg R</div>
                          <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", p.avgR > 0 && "text-success", p.avgR < 0 && "text-danger")}>
                            {p.avgR >= 0 ? "+" : ""}{formatNumber(p.avgR, 2)}R
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider">Net R</div>
                          <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", p.netR > 0 && "text-success", p.netR < 0 && "text-danger")}>
                            {p.netR >= 0 ? "+" : ""}{formatNumber(p.netR, 2)}R
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wider">Profit Factor</div>
                          <div className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                            {p.profitFactor == null ? "—" : p.profitFactor === Infinity ? "∞" : formatNumber(p.profitFactor, 2)}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

