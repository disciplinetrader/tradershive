/**
 * Phase 8D · Improvement Intelligence.
 *
 * Aggregates every scored replay into a skill trend. Each dimension carries an
 * evidence level, so a two-session sample is never presented as a verdict.
 */
import { Link } from "@tanstack/react-router";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useReplayImprovement } from "@/lib/replay/review/queries";
import type { ImprovementView } from "@/lib/replay/review/improvement";

const delta = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

export function ImprovementView_({ view }: { view: ImprovementView }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Latest score</div>
          <div className="font-mono text-lg">{view.recentScore ?? "—"}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Average score</div>
          <div className="font-mono text-lg">{view.averageScore?.toFixed(1) ?? "—"}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Process delta</div>
          <div className="font-mono text-lg">{delta(view.processDelta)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Open drills</div>
          <div className="font-mono text-lg">{view.openDrills}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Score trend</div>
        {view.trend.length < 2 ? (
          <p className="text-xs text-muted-foreground">Score at least two sessions to see a trend.</p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.trend}>
                <XAxis
                  dataKey="time" tickFormatter={(t) => new Date(t).toLocaleDateString()}
                  fontSize={10} stroke="currentColor" opacity={0.5}
                />
                <YAxis domain={[0, 100]} fontSize={10} stroke="currentColor" opacity={0.5} />
                <Tooltip labelFormatter={(t) => new Date(Number(t)).toLocaleString()} />
                <Line type="monotone" dataKey="score" dot={false} strokeWidth={2} stroke="hsl(var(--primary))" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Skills</div>
          <ul className="space-y-1 text-xs">
            {view.dimensions.map((d) => (
              <li key={d.key} className="flex items-center justify-between rounded border border-border/50 px-2 py-1">
                <span>{d.label}</span>
                <span className="flex items-center gap-2 font-mono">
                  {d.recent?.toFixed(0) ?? "—"}
                  <span className={(d.delta ?? 0) > 0 ? "text-emerald-500" : (d.delta ?? 0) < 0 ? "text-destructive" : ""}>
                    {delta(d.delta)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{d.evidence}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Mistake verdicts</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{view.verdicts.corrected} corrected</Badge>
            <Badge variant="outline">{view.verdicts.partial} partial</Badge>
            <Badge variant="outline">{view.verdicts.repeated} repeated</Badge>
            <Badge variant="outline">{view.verdicts.untested} untested</Badge>
          </div>
          {view.unknowns.length ? (
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {view.unknowns.map((u) => <li key={u}>{u}</li>)}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

export function ImprovementDashboard() {
  const q = useReplayImprovement();
  const view = q.data as ImprovementView | undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Improvement intelligence</h1>
          <p className="text-xs text-muted-foreground">
            What your replay practice is actually changing, measured across every scored session.
          </p>
        </div>
        <Button asChild size="sm" variant="secondary"><Link to="/replay/history">Replay history</Link></Button>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !view || view.trend.length === 0 ? (
        <Card className="space-y-3 p-8 text-center">
          <div className="font-medium">No scored replays yet</div>
          <p className="text-sm text-muted-foreground">
            Finish a replay session and score it — after that, this page tracks how your discipline, risk and
            execution move over time.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild><Link to="/replay">Start a replay</Link></Button>
            <Button asChild variant="secondary"><Link to="/replay/history">View history</Link></Button>
          </div>
        </Card>
      ) : (
        <ImprovementView_ view={view} />
      )}
    </div>
  );
}
