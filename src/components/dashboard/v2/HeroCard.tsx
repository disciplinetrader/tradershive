/**
 * Hero card — the visual focus of the dashboard.
 *
 * Answers "what should I do today?" with three live numbers, one AI insight
 * and exactly two calls to action.
 */

import { Link } from "@tanstack/react-router";
import { Flame, LineChart, PlayCircle, Sparkles } from "lucide-react";

import { Panel } from "@/components/dashboard/v2/primitives";
import { Button } from "@/components/ui/button";
import type { HomeSummary } from "@/lib/dashboard-home.functions";
import { cn } from "@/lib/utils";

function fmtR(v: number): string {
  if (!Number.isFinite(v)) return "0.00R";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}R`;
}

export function HeroCard({ data }: { data?: HomeSummary }) {
  const perf = data?.performance;
  const todayR = perf?.todayR ?? 0;
  const tone = todayR > 0 ? "up" : todayR < 0 ? "down" : "flat";
  const tip = data?.tips?.[0] ?? null;

  return (
    <Panel tone="hero" className="p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-3 gap-4 sm:gap-8">
            <HeroStat
              label="Today's P&L"
              value={fmtR(todayR)}
              hint={`${perf?.tradesToday ?? 0} trade${(perf?.tradesToday ?? 0) === 1 ? "" : "s"} today`}
              tone={tone}
            />
            <HeroStat
              label="Win rate"
              value={`${Math.round(perf?.winRate ?? 0)}%`}
              hint="Last 30 days"
            />
            <HeroStat
              label="Streak"
              value={`${data?.focus.streakDays ?? 0}d`}
              hint="Consecutive trading days"
              icon={Flame}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-2xl">
              <Link to="/trading">
                <LineChart className="mr-2 h-4 w-4" aria-hidden />
                Start Trading
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-2xl">
              <Link to="/replay">
                <PlayCircle className="mr-2 h-4 w-4" aria-hidden />
                Start Replay
              </Link>
            </Button>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl bg-background/60 p-5">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Today&rsquo;s AI insight</span>
          </div>
          <p className="mt-3 text-sm font-semibold">{tip?.title ?? "Log your first trade"}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {tip?.body ?? "Your coach starts spotting patterns as soon as you close and journal a few trades."}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function HeroStat({
  label,
  value,
  hint,
  tone = "flat",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "up" | "down" | "flat";
  icon?: typeof Flame;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 flex items-center gap-1.5 text-2xl font-bold tabular-nums sm:text-4xl",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-warning" aria-hidden /> : null}
        <span className="truncate">{value}</span>
      </p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
