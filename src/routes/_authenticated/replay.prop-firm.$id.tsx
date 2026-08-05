import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MoreHorizontal, PlayCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useActivePropChallenge } from "@/lib/prop-challenges/active-session";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  abandonPropChallenge, deletePropChallenge, getPropChallenge, tickPropChallenge,
} from "@/lib/prop-challenges.functions";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import { RuleProgressCards } from "@/components/prop-challenges/RuleProgressCards";
import { EquityCurve } from "@/components/prop-challenges/EquityCurve";
import { ResultsPanel } from "@/components/prop-challenges/ResultsPanel";

export const Route = createFileRoute("/_authenticated/replay/prop-firm/$id")({
  component: ChallengeDetail,
});

function ChallengeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getPropChallenge);
  const tick = useServerFn(tickPropChallenge);
  const abandon = useServerFn(abandonPropChallenge);
  const remove = useServerFn(deletePropChallenge);
  const { active: activeSession, setActive } = useActivePropChallenge();

  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({
    queryKey: ["prop-challenge", id],
    queryFn: () => get({ data: { id } }),
    refetchInterval: 30_000,
  });

  const tickM = useMutation({
    mutationFn: () => tick({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prop-challenge", id] }),
  });
  const abandonM = useMutation({
    mutationFn: () => abandon({ data: { id } }),
    onSuccess: () => {
      toast.success("Challenge abandoned");
      qc.invalidateQueries({ queryKey: ["prop-challenge", id] });
      qc.invalidateQueries({ queryKey: ["prop-challenges"] });
    },
  });
  const deleteM = useMutation({
    mutationFn: () => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Challenge deleted");
      qc.invalidateQueries({ queryKey: ["prop-challenges"] });
      navigate({ to: "/prop-challenges" });
    },
  });

  if (q.isLoading || !q.data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading challenge…</div>;
  }
  const { challenge, days, progress, liveEquity } = q.data;
  const drawdownLimitAmt = Number(challenge.starting_equity) * (challenge.max_total_drawdown_pct / 100);

  const statusBadge =
    challenge.status === "active" ? <Badge variant="secondary">Active</Badge> :
    challenge.status === "passed" ? <Badge className="bg-emerald-500/15 text-emerald-400">Passed</Badge> :
    challenge.status === "failed" ? <Badge variant="destructive">Failed</Badge> :
    <Badge variant="outline">Abandoned</Badge>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/prop-challenges" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All challenges
        </Button>
      </div>

      <PageHeader
        title={challenge.name}
        description={`${challenge.preset.replace(/_/g, " ")} · ${formatCurrency(Number(challenge.account_size), challenge.currency)} · ${challenge.leverage}:1`}
        actions={
          <div className="flex items-center gap-2">
            {statusBadge}
            {challenge.status === "active" && (
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90"
                onClick={() => {
                  setActive({ id: challenge.id, paper_account_id: challenge.paper_account_id });
                  toast.success(
                    activeSession?.id === challenge.id
                      ? "Resuming trading session"
                      : "Trading session started — challenge linked to workspace",
                  );
                  navigate({ to: "/trading" });
                }}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                {activeSession?.id === challenge.id ? "Resume Trading" : "Start Trading"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => tickM.mutate()} disabled={tickM.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${tickM.isPending ? "animate-spin" : ""}`} /> Recheck
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {challenge.status === "active" && (
                  <DropdownMenuItem onSelect={() => setConfirmAbandon(true)}>Abandon challenge</DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(true)}>
                  Delete permanently
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <RuleProgressCards progress={progress} currency={challenge.currency} />

      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Equity curve</div>
            <div className="text-xs text-muted-foreground">
              Live equity {formatCurrency(liveEquity, challenge.currency)} · dashed line = max drawdown floor
            </div>
          </div>
          <div className="mono-nums text-xs text-muted-foreground">
            Today {progress.todayPnl >= 0 ? "+" : ""}{formatCurrency(progress.todayPnl, challenge.currency)}
          </div>
        </div>
        <div className="mt-3">
          <EquityCurve
            days={days}
            startingEquity={Number(challenge.starting_equity)}
            drawdownLimit={drawdownLimitAmt}
          />
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-3 text-sm font-semibold">Daily log</div>
        {days.length === 0 ? (
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground">
            <span>Start your first trading session — closed trades appear here automatically.</span>
            {challenge.status === "active" && (
              <Button
                size="sm"
                onClick={() => {
                  setActive({ id: challenge.id, paper_account_id: challenge.paper_account_id });
                  navigate({ to: "/trading" });
                }}
              >
                <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Start trading
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Day</th>
                  <th className="p-2 text-right">Trades</th>
                  <th className="p-2 text-right">Start equity</th>
                  <th className="p-2 text-right">End equity</th>
                  <th className="p-2 text-right">Realized P/L</th>
                  <th className="p-2 text-right">Breach</th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.day_date} className="border-t border-border/40">
                    <td className="p-2">{d.day_date}</td>
                    <td className="p-2 text-right mono-nums">{d.trades_count}</td>
                    <td className="p-2 text-right mono-nums">{formatCurrency(Number(d.start_equity), challenge.currency)}</td>
                    <td className="p-2 text-right mono-nums">{formatCurrency(Number(d.end_equity), challenge.currency)}</td>
                    <td className={`p-2 text-right mono-nums ${d.realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {d.realized_pnl >= 0 ? "+" : ""}{formatCurrency(Number(d.realized_pnl), challenge.currency)}
                    </td>
                    <td className="p-2 text-right">
                      {d.breached ? <Badge variant="destructive">{d.breach_code}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <ResultsPanel challenge={challenge} days={days} progress={progress} />

      <AlertDialog open={confirmAbandon} onOpenChange={setConfirmAbandon}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandon this challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              The challenge will be marked as abandoned and locked from further updates. Historical data will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => abandonM.mutate()}>Abandon</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the challenge and all daily snapshots. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteM.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
