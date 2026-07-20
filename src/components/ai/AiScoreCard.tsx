import { motion } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, PolarRadiusAxis } from "recharts";
import { SCORE_CATEGORIES } from "@/lib/ai/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ScoreShape = Record<string, unknown>;

function scoreColor(v: number) {
  if (v >= 80) return "text-success";
  if (v >= 60) return "text-sky-400";
  if (v >= 40) return "text-warning";
  return "text-danger";
}

export function AiScoreCard({ score }: { score: ScoreShape | null | undefined }) {
  const overall = Number(score?.overall ?? 0);
  const radarData = SCORE_CATEGORIES.map((c) => ({
    category: c.label,
    value: Number(score?.[c.key] ?? 0),
  }));
  return (
    <Card className="overflow-hidden bg-card/60 backdrop-blur-md border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">AI Score</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Computed from your real trades, journal & habits</p>
        </div>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn("text-5xl font-black tabular-nums", scoreColor(overall))}
        >
          {overall.toFixed(0)}
        </motion.div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="80%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="category"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.35}
                animationDuration={800}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SCORE_CATEGORIES.map((c) => {
            const v = Number(score?.[c.key] ?? 0);
            return (
              <div key={c.key} className="rounded-md border border-border/60 bg-background/40 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
                <div className={cn("text-lg font-bold tabular-nums", scoreColor(v))}>{v.toFixed(0)}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
