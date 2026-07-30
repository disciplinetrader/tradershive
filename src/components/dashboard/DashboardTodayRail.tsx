/**
 * Today rail — the right-hand column of the dashboard hero.
 *
 * Answers the three "state of play" questions a trader asks before acting:
 *   • How am I doing today?      (Today's P&L)
 *   • Am I under contract?       (Prop firm status)
 *   • Where do I start?          (Quick actions)
 *
 * Presentation only — every value is passed in from existing server data.
 */

import { Link } from "@tanstack/react-router";
import { BookOpen, LineChart, PlayCircle, Shield } from "lucide-react";

import { Surface } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { HeroState } from "@/lib/dashboard-hero.functions";
import type { HomeSummary } from "@/lib/dashboard-home.functions";
import { cn } from "@/lib/utils";

type Props = {
  performance?: HomeSummary["performance"];
  hero?: HeroState;
};

function fmtR(v: number): string {
  if (!Number.isFinite(v)) return "0.00R";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}R`;
}

export function DashboardTodayRail({ performance, hero }: Props) {
  const todayR = performance?.todayR ?? 0;
  const tradesToday = performance?.tradesToday ?? 0;
  const tone = todayR > 0 ? "up" : todayR < 0 ? "down" : "flat";
  const challenge = hero?.activeChallenges?.[0] ?? null;

  const target = challenge?.targetPct ?? 0;
  const profit = challenge?.profitPct ?? 0;
  const challengePct = target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0;

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Today's P&L */}

      <Surface>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Today&rsquo;s P&amp;L
        </span>
        <div
          className={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            tone === "up" && "text-success",
            tone === "down" && "text-danger",
          )}
        >
          {fmtR(todayR)}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {tradesToday === 0
            ? "No trades closed today"
            : `${tradesToday} trade${tradesToday === 1 ? "" : "s"} closed today`}
        </p>
      </Surface>

      {/* Prop firm status */}
      {challenge ? (
        <Surface tone="accent">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {challenge.name ?? "Prop challenge"}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold tabular-nums">{profit.toFixed(2)}%</span>
            {target > 0 ? (
              <span className="text-[11px] text-muted-foreground tabular-nums">target {target.toFixed(0)}%</span>
            ) : null}
          </div>
          {target > 0 ? <Progress value={challengePct} aria-label="Challenge progress" className="mt-2 h-1.5" /> : null}
          <Button asChild size="sm" variant="ghost" className="mt-2 h-7 w-full text-xs">
            <Link to="/prop-challenges">View challenge</Link>
          </Button>
        </Surface>
      ) : null}

      {/* Quick actions */}
      <Surface tone="muted" className="space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </span>
        <div className="grid gap-1.5">
          <QuickAction to="/trading" icon={LineChart} label="Start Trading" />
          <QuickAction to="/replay" icon={PlayCircle} label="Start Replay" />
          <QuickAction to="/journal" icon={BookOpen} label="Add Journal" />
        </div>
      </Surface>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof LineChart;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}
