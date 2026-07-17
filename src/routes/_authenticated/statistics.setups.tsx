import { createFileRoute } from "@tanstack/react-router";
import { PairAnalysisTable, SetupAnalysisTable, StrategyAnalysisTable } from "@/components/statistics/GroupTables";
import { EmotionAnalysis, MistakeAnalysis } from "@/components/statistics/EmotionMistake";

export const Route = createFileRoute("/_authenticated/statistics/setups")({
  component: () => (
    <div className="space-y-4">
      <PairAnalysisTable />
      <SetupAnalysisTable />
      <StrategyAnalysisTable />
      <div className="grid gap-4 xl:grid-cols-2">
        <EmotionAnalysis />
        <MistakeAnalysis />
      </div>
    </div>
  ),
});
