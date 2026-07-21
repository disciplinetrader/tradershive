import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Play, RotateCcw, Share2, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getReplaySessionSummary } from "@/lib/replay-studio.functions";
import { generateReplayDebrief, getReplayDebrief } from "@/lib/replay-coach.functions";

export function PostSessionSummary({
  sessionId,
  open,
  onOpenChange,
  onReplayAgain,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onReplayAgain?: () => void;
}) {
  const get = useServerFn(getReplaySessionSummary);
  const getDeb = useServerFn(getReplayDebrief);
  const genDeb = useServerFn(generateReplayDebrief);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["replay", "summary", sessionId],
    queryFn: () => get({ data: { session_id: sessionId } }),
    enabled: open,
  });
  const dQ = useQuery({
    queryKey: ["replay", "debrief", sessionId],
    queryFn: () => getDeb({ data: { session_id: sessionId } }),
    enabled: open,
  });
  const genM = useMutation({
    mutationFn: () => genDeb({ data: { session_id: sessionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["replay", "debrief", sessionId] });
      qc.invalidateQueries({ queryKey: ["coach"] });
    },
  });
  const debrief: any = dQ.data;

  const t = (q.data as any)?.totals;
  const s = (q.data as any)?.session;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session Summary</DialogTitle>
        </DialogHeader>

        {!t ? (
          <div className="h-40 animate-pulse rounded-[3px] bg-muted/40" />
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              {s?.symbol} · {s?.timeframe} · {s?.market}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Trades" value={t.trades} />
              <Metric label="Win rate" value={`${t.win_rate.toFixed(0)}%`} />
              <Metric label="Avg RR" value={t.avg_rr.toFixed(2)} />
              <Metric
                label="Net P&L"
                value={`$${t.net_profit.toFixed(2)}`}
                tone={t.net_profit >= 0 ? "success" : "danger"}
              />
              <Metric label="Profit Factor" value={t.profit_factor.toFixed(2)} />
              <Metric label="Max DD" value={`$${t.max_drawdown.toFixed(2)}`} tone="danger" />
            </div>

            <div className="rounded-[3px] border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <GraduationCap className="h-4 w-4" /> AI Coach Debrief
                </div>
                {debrief ? <span className="text-[10px] rounded-full bg-primary/20 text-primary px-1.5 py-0.5">Grade {debrief.grade}</span> : null}
              </div>
              {debrief ? (
                <div className="space-y-1.5 text-xs">
                  <p className="text-foreground/90">{debrief.overall_summary}</p>
                  {debrief.wins?.length ? <div><span className="text-[10px] uppercase text-success">Wins</span><ul className="list-disc pl-4 text-foreground/80">{debrief.wins.slice(0, 2).map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div> : null}
                  {debrief.mistakes?.length ? <div><span className="text-[10px] uppercase text-danger">Mistakes</span><ul className="list-disc pl-4 text-foreground/80">{debrief.mistakes.slice(0, 2).map((m: any, i: number) => <li key={i}>{typeof m === "string" ? m : m.description ?? m.kind}</li>)}</ul></div> : null}
                  {debrief.action_items?.length ? <div><span className="text-[10px] uppercase text-primary">Action Items</span><ul className="list-disc pl-4 text-foreground/80">{debrief.action_items.slice(0, 2).map((a: string, i: number) => <li key={i}>{a}</li>)}</ul></div> : null}
                  <Button size="sm" variant="ghost" className="w-full mt-1" asChild>
                    <Link to="/ai/coach">Open Coach Hub →</Link>
                  </Button>
                </div>
              ) : (
                <Button size="sm" className="w-full" onClick={() => genM.mutate()} disabled={genM.isPending}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  {genM.isPending ? "Coach analyzing…" : "Generate AI Debrief"}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="secondary" onClick={onReplayAgain}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Replay Again
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/journal"><BookOpen className="mr-2 h-3.5 w-3.5" /> Open Journal</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/statistics"><Play className="mr-2 h-3.5 w-3.5" /> Statistics</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/community"><Share2 className="mr-2 h-3.5 w-3.5" /> Share</Link>
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
              <X className="mr-2 h-3.5 w-3.5" /> Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-[3px] border border-border/60 bg-card/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
