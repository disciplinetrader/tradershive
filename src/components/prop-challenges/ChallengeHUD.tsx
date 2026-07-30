import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Trophy } from "lucide-react";
import { getPropChallenge, tickPropChallenge } from "@/lib/prop-challenges.functions";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import { GlassCard } from "@/components/ui/glass-card";
import { Progress } from "@/components/ui/progress";

/**
 * Compact floating HUD shown on the Trading Workspace and Replay Studio
 * when a challenge is active. Ticks the server every 15s so drawdown /
 * daily-loss cushions reflect the latest closed trades.
 */
export function ChallengeHUD({ challengeId }: { challengeId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getPropChallenge);
  const tick = useServerFn(tickPropChallenge);

  const q = useQuery({
    queryKey: ["prop-challenge", challengeId],
    queryFn: () => get({ data: { id: challengeId } }),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const t = setInterval(() => {
      // Background poll: a transient network failure must never escape as an
      // unhandled rejection (it surfaces as a full-screen runtime error).
      void tick({ data: { id: challengeId } })
        .then(() => qc.invalidateQueries({ queryKey: ["prop-challenge", challengeId] }))
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(t);
  }, [challengeId, tick, qc]);


  if (!q.data) return null;
  const { challenge, progress } = q.data;

  const dl = progress.dailyLoss;
  const dd = progress.drawdown;
  const pf = progress.profit;

  return (
    <GlassCard className="pointer-events-auto w-[320px] p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{challenge.name}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {challenge.preset.replace(/_/g, " ")}
          </div>
        </div>
        <Link
          to="/prop-challenges/$id" params={{ id: challenge.id }}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          title="Open challenge"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        <Meter label="Profit" pct={Math.max(0, Math.min(100, (pf.pct / pf.targetPct) * 100))}
          right={`${pf.pct >= 0 ? "+" : ""}${pf.pct.toFixed(2)}% / ${pf.targetPct}%`}
          tone={pf.hit ? "pos" : "info"} />
        <Meter label="Daily buffer" pct={dl.remainingPct}
          right={formatCurrency(dl.remainingAmount, challenge.currency)}
          tone={dl.safe ? "pos" : dl.remainingPct > 20 ? "warn" : "neg"} />
        <Meter label="Drawdown buffer" pct={dd.remainingPct}
          right={formatCurrency(dd.remainingAmount, challenge.currency)}
          tone={dd.safe ? "pos" : dd.remainingPct > 20 ? "warn" : "neg"} />
      </div>

      {progress.verdict === "failed" && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          <span className="truncate">{progress.breach?.message ?? "Challenge failed"}</span>
        </div>
      )}
      {progress.verdict === "passed" && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">
          <Trophy className="h-4 w-4" />
          Challenge passed
        </div>
      )}
    </GlassCard>
  );
}

function Meter({ label, pct, right, tone }: {
  label: string; pct: number; right: string; tone: "pos" | "neg" | "warn" | "info";
}) {
  const toneCls =
    tone === "pos" ? "text-emerald-400" :
    tone === "neg" ? "text-rose-400" :
    tone === "warn" ? "text-amber-400" : "text-primary";
  const barCls =
    tone === "pos" ? "bg-emerald-500" :
    tone === "neg" ? "bg-rose-500" :
    tone === "warn" ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`mono-nums font-semibold ${toneCls}`}>{right}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, pct))} className="mt-1 h-1" indicatorClassName={barCls} />
    </div>
  );
}
