/**
 * Equity section — one large chart plus at most three stacked sidebar cards.
 */

import { Link } from "@tanstack/react-router";
import { BookOpen, Shield, Sparkles } from "lucide-react";

import { EquityCurve } from "@/components/dashboard/EquityCurve";
import { Panel, SidebarCard } from "@/components/dashboard/v2/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { HeroState } from "@/lib/dashboard-hero.functions";
import type { HomeSummary } from "@/lib/dashboard-home.functions";

export function EquitySection({ home, hero }: { home?: HomeSummary; hero?: HeroState }) {
  const challenge = hero?.activeChallenges?.[0] ?? null;
  const target = challenge?.targetPct ?? 0;
  const profit = challenge?.profitPct ?? 0;
  const pct = target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0;

  const tip = home?.tips?.[1] ?? home?.tips?.[0] ?? null;
  const reminder = home?.actions?.[0] ?? null;

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel className="min-w-0">
        <EquityCurve />
      </Panel>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <SidebarCard
          icon={Shield}
          title={challenge?.name ?? "Prop firm"}
          footer={
            <Button asChild size="sm" variant="ghost" className="w-full rounded-xl">
              <Link to="/prop-challenges">{challenge ? "View challenge" : "Start a challenge"}</Link>
            </Button>
          }
        >
          {challenge ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums">{profit.toFixed(2)}%</span>
                {target > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">target {target.toFixed(0)}%</span>
                ) : null}
              </div>
              {target > 0 ? <Progress value={pct} aria-label="Challenge progress" className="mt-2.5 h-1.5" /> : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No active challenge. Prove consistency against real prop-firm rules.
            </p>
          )}
        </SidebarCard>

        <SidebarCard
          icon={Sparkles}
          title="AI recommendation"
          footer={
            <Button asChild size="sm" variant="ghost" className="w-full rounded-xl">
              <Link to="/ai/dashboard">Open AI Coach</Link>
            </Button>
          }
        >
          <p className="text-sm font-medium">{tip?.title ?? "Build a baseline"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {tip?.body ?? "Close and journal a handful of trades so your coach has something to work with."}
          </p>
        </SidebarCard>

        <SidebarCard
          icon={BookOpen}
          title="Journal reminder"
          footer={
            <Button asChild size="sm" variant="ghost" className="w-full rounded-xl">
              <Link to={reminder?.href ?? "/journal"}>{reminder?.cta ?? "Open journal"}</Link>
            </Button>
          }
        >
          <p className="text-sm font-medium">{reminder?.title ?? "You're all caught up"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {reminder?.detail ?? "Every closed trade has a journal entry. Keep it that way."}
          </p>
        </SidebarCard>
      </div>
    </section>
  );
}
