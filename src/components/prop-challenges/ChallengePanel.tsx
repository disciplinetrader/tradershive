import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, LogOut, Trophy } from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import { getPropChallenge, tickPropChallenge } from "@/lib/prop-challenges.functions";
import { useActivePropChallenge } from "@/lib/prop-challenges/active-session";

/**
 * Persistent panel shown in the Trading Workspace while a Prop Firm
 * challenge is active. Auto-ticks the server every 15s and re-renders on
 * every closed trade (via the shared react-query key) so all rule cushions
 * update without a page refresh.
 */
export function ChallengePanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { active, clear } = useActivePropChallenge();
  const get = useServerFn(getPropChallenge);
  const tick = useServerFn(tickPropChallenge);

  const q = useQuery({
    queryKey: ["prop-challenge", active?.id],
    queryFn: () => get({ data: { id: active!.id } }),
    enabled: !!active?.id,
    refetchInterval: 15_000,
  });

  const tickM = useMutation({
    mutationFn: () => tick({ data: { id: active!.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prop-challenge", active?.id] }),
  });

  // Re-tick whenever a paper trade closes (paper query key = ["paper", …]).
  useEffect(() => {
    if (!active?.id) return;
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const key = event.query.queryKey as unknown[];
      if (Array.isArray(key) && key[0] === "paper" && (key[1] === "trades" || key[1] === "accounts")) {
        void tickM.mutateAsync().catch(() => undefined);
      }
    });
    return () => unsub();
  }, [active?.id, qc, tickM]);

  if (!active?.id) return null;
  if (!q.data) {
    return (
      <GlassCard className="p-3 text-xs text-muted-foreground">Loading challenge…</GlassCard>
    );
  }

  const { challenge, progress, liveEquity } = q.data;
  const currency = challenge.currency;

  const dailyLossLimitAmt = Number(challenge.starting_equity) * (challenge.max_daily_loss_pct / 100);
  const drawdownLimitAmt = Number(challenge.starting_equity) * (challenge.max_total_drawdown_pct / 100);
  const dailyLossUsedAmt = dailyLossLimitAmt - progress.dailyLoss.remainingAmount;
  const drawdownUsedAmt = drawdownLimitAmt - progress.drawdown.remainingAmount;

  const statusBadge =
    progress.verdict === "passed" ? (
      <Badge className="bg-emerald-500/15 text-emerald-400"><Trophy className="mr-1 h-3 w-3" />Passed</Badge>
    ) : progress.verdict === "failed" ? (
      <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Failed</Badge>
    ) : (
      <Badge variant="secondary">Active</Badge>
    );

  const profitTone = progress.profit.amount >= 0 ? "text-emerald-400" : "text-rose-400";

  const endSession = () => {
    clear();
    toast.success("Trading session ended — challenge unlinked from workspace");
  };

  return (
    <GlassCard className={cn("p-3", compact ? "space-y-2" : "space-y-3")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Trophy className="h-3 w-3" /> Active Challenge
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold">{challenge.name}</div>
          <div className="truncate text-[11px] capitalize text-muted-foreground">
            {challenge.preset.replace(/_/g, " ")} · {formatCurrency(Number(challenge.account_size), currency)}
          </div>
        </div>
        {statusBadge}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat
          label="Profit"
          value={`${progress.profit.amount >= 0 ? "+" : ""}${formatCurrency(progress.profit.amount, currency)}`}
          sub={`${progress.profit.pct >= 0 ? "+" : ""}${progress.profit.pct.toFixed(2)}%`}
          tone={profitTone}
        />
        <Stat
          label="Target"
          value={`${challenge.profit_target_pct}%`}
          sub={formatCurrency(progress.profit.targetAmount, currency)}
        />
      </div>

      <Meter
        label="Daily Loss"
        value={`${formatCurrency(dailyLossUsedAmt, currency)} / ${formatCurrency(dailyLossLimitAmt, currency)}`}
        pct={progress.dailyLoss.usedPct}
        danger={!progress.dailyLoss.safe}
      />
      <Meter
        label="Overall Drawdown"
        value={`${formatCurrency(drawdownUsedAmt, currency)} / ${formatCurrency(drawdownLimitAmt, currency)}`}
        pct={progress.drawdown.usedPct}
        danger={!progress.drawdown.safe}
      />
      <Meter
        label="Trading Days"
        value={`${progress.tradingDays.used} / ${progress.tradingDays.required}`}
        pct={
          progress.tradingDays.required > 0
            ? Math.min(100, (progress.tradingDays.used / progress.tradingDays.required) * 100)
            : 100
        }
      />

      {progress.verdict === "failed" && progress.breach && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" /> Challenge Failed
          </div>
          <div className="mt-0.5">{progress.breach.message}</div>
        </div>
      )}
      {progress.verdict === "passed" && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
          <div className="flex items-center gap-1.5 font-semibold">
            <Trophy className="h-3.5 w-3.5" /> Challenge Passed
          </div>
          <div className="mt-0.5">
            Final equity {formatCurrency(liveEquity, currency)} — review your performance.
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-[11px]"
        >
          <Link to="/prop-challenges/$id" params={{ id: challenge.id }}>
            <ExternalLink className="mr-1 h-3 w-3" /> View Challenge
          </Link>
        </Button>
        {progress.verdict === "in_progress" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={endSession}
          >
            <LogOut className="mr-1 h-3 w-3" /> End Session
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 flex-1 text-[11px]"
            onClick={() => {
              endSession();
              navigate({ to: "/prop-challenges/$id", params: { id: challenge.id } });
            }}
          >
            View Results
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mono-nums text-sm font-semibold", tone ?? "text-foreground")}>{value}</div>
      {sub && <div className="mono-nums text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Meter({ label, value, pct, danger }: { label: string; value: string; pct: number; danger?: boolean }) {
  const barCls = danger ? "bg-rose-500" : pct > 60 ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("mono-nums font-semibold", danger ? "text-rose-400" : "text-foreground")}>{value}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, pct))} className="mt-1 h-1" indicatorClassName={barCls} />
    </div>
  );
}
