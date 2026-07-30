/**
 * Performance section — equity curve + a maximum of six KPI cards.
 *
 * Three headline KPIs are always visible (Net P&L, Win rate, Profit factor via
 * the existing guarded PerformanceSnapshot). The remaining three secondary
 * metrics live behind progressive disclosure so the default view stays calm.
 *
 * Presentation only — no metric is removed, only deferred.
 */

import { Activity, BarChart3 } from "lucide-react";

import { DisclosureSection, Metric, SectionHeader, Surface } from "@/components/ds";
import { EquityCurve } from "@/components/dashboard/EquityCurve";
import { PerformanceSnapshot } from "@/components/dashboard/PerformanceSnapshot";
import type { HomeSummary } from "@/lib/dashboard-home.functions";

function fmtR(v: number): string {
  if (!Number.isFinite(v)) return "0.00R";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}R`;
}

export function PerformanceSection({ data }: { data: HomeSummary["performance"] }) {
  const weekTone = data.weekR > 0 ? "up" : data.weekR < 0 ? "down" : "flat";
  const avgTone = data.avgR > 0 ? "up" : data.avgR < 0 ? "down" : "flat";

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Performance"
        description="Last 30 days"
        icon={BarChart3}
      />

      <PerformanceSnapshot data={data} />

      <Surface flush className="p-4">
        <EquityCurve />
      </Surface>

      <DisclosureSection
        title="Secondary metrics"
        description="Week R, average R and drawdown"
        icon={Activity}
        storageKey="dashboard-secondary-metrics"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="This week"
            value={fmtR(data.weekR)}
            sub={`${data.tradesWeek} trade${data.tradesWeek === 1 ? "" : "s"} · ${fmtR(data.weekDeltaR)} vs last week`}
            tone={weekTone}
            size="sm"
          />
          <Metric
            label="Average R"
            value={fmtR(data.avgR)}
            sub="Per closed trade · 30d"
            tone={avgTone}
            size="sm"
          />
          <Metric
            label="Max drawdown"
            value={`${data.currentDrawdownR.toFixed(2)}R`}
            sub="Peak-to-trough · last 60 trades"
            tone={data.currentDrawdownR > 0 ? "down" : "flat"}
            size="sm"
          />
        </div>
      </DisclosureSection>
    </section>
  );
}
