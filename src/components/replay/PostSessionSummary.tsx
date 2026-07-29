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

  // Derive a single "next step" — prefer AI action item, then heuristic.
  const nextStep: string | null = (() => {
    if (debrief?.action_items?.length) return String(debrief.action_items[0]);
    if (!t) return null;
    if (t.trades === 0) return "Take at least one deliberate trade next session — even a paper commit teaches you your bias.";
    if (Number(t.max_drawdown) > Math.abs(Number(t.net_profit ?? 0)) * 2)
      return "Tighten risk: your worst drawdown exceeded your net result. Cap size or move to break-even earlier.";
    if (Number(t.profit_factor) < 1) return "Refine entries — profit factor under 1 means losers are dominating. Journal each loss before the next session.";
    if (Number(t.win_rate) < 40) return "Study your losing trades: hit-rate is under 40%. Look for a repeatable setup filter before doubling volume.";
    return "Keep this rhythm — repeat this playbook on a fresh date to confirm the edge holds.";
  })();

  const strength: string | null = debrief?.wins?.[0] ?? null;
  const mistake: string | null = (() => {
    const m = debrief?.mistakes?.[0];
    if (!m) return null;
    return typeof m === "string" ? m : m.description ?? m.kind ?? null;
  })();

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

            {/* Next step — the one actionable takeaway. Always visible first. */}
            {nextStep ? (
              <div className="rounded-[3px] border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3 w-3" /> Next step
                </div>
                <p className="mt-1 text-sm text-foreground/90">{nextStep}</p>
              </div>
            ) : null}

            {/* Strength / mistake chips */}
            {(strength || mistake) && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {strength ? (
                  <div className="rounded-[3px] border border-success/30 bg-success/5 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-success">Biggest strength</div>
                    <p className="mt-0.5 text-xs text-foreground/85">{strength}</p>
                  </div>
                ) : null}
                {mistake ? (
                  <div className="rounded-[3px] border border-danger/30 bg-danger/5 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-danger">Key mistake</div>
                    <p className="mt-0.5 text-xs text-foreground/85">{mistake}</p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Hero metrics — the three numbers the trader remembers. */}
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Net P&L"
                value={`$${t.net_profit.toFixed(2)}`}
                tone={t.net_profit >= 0 ? "success" : "danger"}
                hero
              />
              <Metric label="Win rate" value={`${t.win_rate.toFixed(0)}%`} hero />
              <Metric
                label="Grade"
                value={debrief?.grade ?? "—"}
                tone={debrief?.grade && ["A", "B"].includes(String(debrief.grade)[0]) ? "success" : undefined}
                hero
              />
            </div>

            {/* Secondary tier */}
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Trades" value={t.trades} />
              <Metric label="Avg RR" value={t.avg_rr.toFixed(2)} />
              <Metric label="Profit Factor" value={t.profit_factor.toFixed(2)} />
              <Metric label="Max DD" value={`$${t.max_drawdown.toFixed(2)}`} tone="danger" />
              <Metric label="Duration" value={formatDuration(s?.duration_seconds ?? 0)} />
              <Metric label="Progress" value={`${s?.completion_pct ?? 0}%`} />
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
                <Link to="/analytics"><Play className="mr-2 h-3.5 w-3.5" /> Analytics</Link>
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

function Metric({ label, value, tone, hero }: { label: string; value: React.ReactNode; tone?: "success" | "danger"; hero?: boolean }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className={`rounded-[3px] border p-2 ${hero ? "border-primary/30 bg-primary/5" : "border-border/60 bg-card/40"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${hero ? "text-lg" : "text-sm"} font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(sec)}s`;
}
