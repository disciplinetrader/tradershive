import { createFileRoute } from "@tanstack/react-router";
import { PairAnalysisTable, SetupAnalysisTable, StrategyAnalysisTable, SessionAnalysisTable } from "@/components/statistics/GroupTables";
import { EmotionAnalysis, MistakeAnalysis } from "@/components/statistics/EmotionMistake";

export const Route = createFileRoute("/_authenticated/analytics/trades")({
  component: () => (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SetupAnalysisTable />
        <StrategyAnalysisTable />
      </div>
      <SessionAnalysisTable />
      <div className="grid gap-4 xl:grid-cols-2">
        <EmotionAnalysis />
        <MistakeAnalysis />
      </div>
    </div>
  ),
});
