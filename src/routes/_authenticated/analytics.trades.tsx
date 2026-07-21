import { createFileRoute } from "@tanstack/react-router";
import { GroupTables } from "@/components/statistics/GroupTables";
import { EmotionAnalysis, MistakeAnalysis } from "@/components/statistics/EmotionMistake";

export const Route = createFileRoute("/_authenticated/analytics/trades")({
  component: () => (
    <div className="space-y-4">
      <GroupTables />
      <div className="grid gap-4 xl:grid-cols-2">
        <EmotionAnalysis />
        <MistakeAnalysis />
      </div>
    </div>
  ),
});
