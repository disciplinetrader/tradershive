import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { PairAnalysisTable, SetupAnalysisTable, StrategyAnalysisTable, SessionAnalysisTable } from "@/components/statistics/GroupTables";
import { EmotionAnalysis, MistakeAnalysis } from "@/components/statistics/EmotionMistake";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { FiltersBar } from "@/components/statistics/FiltersBar";

export const Route = createFileRoute("/_authenticated/dashboard/trades")({
  head: () => ({
    meta: [
      { title: "Trade Analysis — TradersHIVE" },
      { name: "description", content: "Detailed breakdown of your trades by setup, strategy, and emotion." },
    ],
  }),
  component: DashboardTradesPage,
});

function DashboardTradesPage() {
  return (
    <AnalyticsProvider>
      <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
        <DashboardHeader />
        <FiltersBar />
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <SetupAnalysisTable />
            <StrategyAnalysisTable />
          </div>
          <SessionAnalysisTable />
          <PairAnalysisTable />
          <div className="grid gap-4 xl:grid-cols-2">
            <EmotionAnalysis />
            <MistakeAnalysis />
          </div>
        </div>
      </div>
    </AnalyticsProvider>
  );
}
