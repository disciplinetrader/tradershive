import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Target, Plus, Play, ChevronRight, GraduationCap } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { listPropChallenges } from "@/lib/prop-challenges.functions";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { useActivePropChallenge } from "@/lib/prop-challenges/active-session";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/dashboard/prop-firm")({
  head: () => ({
    meta: [
      { title: "Prop Firm Challenges — TradersHIVE" },
      { name: "description", content: "Practise prop-style evaluation rules using a virtual TradersHIVE account." },
    ],
  }),
  component: DashboardPropFirmPage,
});

function DashboardPropFirmPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const list = useServerFn(listPropChallenges);
  const { active: activeSession, setActive } = useActivePropChallenge();
  
  const { data: challenges, isLoading } = useQuery({
    queryKey: ["prop-challenges"],
    queryFn: () => list(),
  });

  const activeChallenge = useMemo(() => 
    challenges?.find(c => c.status === "active"),
    [challenges]
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)] animate-in fade-in duration-500">
      <DashboardHeader accountId={accountId} onAccountChange={setAccountId} />
      
      <div className="space-y-6">
        {/* Notice Section */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary/80">
          Simulation only. This is not an official account from any prop firm. Practise prop-style evaluation rules using a virtual TradersHIVE account.
        </div>

        {activeChallenge ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <ActiveChallengeOverview challenge={activeChallenge} />
            </div>
            <div className="space-y-6">
              <ActiveChallengeQuickStats challenge={activeChallenge} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
            <div className="max-w-md space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Target className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold">No Active Challenge</h2>
                <p className="text-sm text-muted-foreground">
                  You don't have any active prop firm challenges. Start a new evaluation to test your skills and discipline.
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Button asChild className="gradient-primary text-primary-foreground rounded-xl">
                  <Link to="/prop-challenges/new">
                    <Plus className="mr-2 h-4 w-4" /> Start Challenge
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {challenges && challenges.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Your Challenges</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {challenges.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveChallengeOverview({ challenge }: { challenge: any }) {
  const { active: activeSession, setActive } = useActivePropChallenge();
  const isLinked = activeSession?.id === challenge.id;

  return (
    <GlassCard className="overflow-hidden border-primary/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 border-b border-border/40 bg-primary/5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-primary/20 text-primary border-none text-[10px] uppercase tracking-wider px-2 py-0.5">
              Active Challenge
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider px-2 py-0.5">
              {challenge.preset.replace(/_/g, " ")}
            </Badge>
          </div>
          <h2 className="text-2xl font-bold">{challenge.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Linked Account: <span className="text-foreground font-medium">Prop Account #{challenge.paper_account_id?.slice(-4)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLinked && (
            <Button 
              onClick={() => setActive({ id: challenge.id, paper_account_id: challenge.paper_account_id })}
              className="gradient-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20"
            >
              <Play className="mr-2 h-4 w-4 fill-current" /> Continue Trading
            </Button>
          )}
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/prop-challenges/$id" params={{ id: challenge.id }}>
              View Analytics <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
      
      <div className="p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <StatBox 
            label="Current Balance" 
            value={formatCurrency(Number(challenge.current_equity), challenge.currency)} 
            sub={`Start: ${formatCurrency(Number(challenge.starting_equity), challenge.currency)}`}
          />
          <StatBox 
            label="Equity" 
            value={formatCurrency(Number(challenge.current_equity), challenge.currency)} 
            sub="Real-time"
          />
          <StatBox 
            label="Profit / Loss" 
            value={`${Number(challenge.current_equity) >= Number(challenge.starting_equity) ? "+" : ""}${formatCurrency(Number(challenge.current_equity) - Number(challenge.starting_equity), challenge.currency)}`}
            valueClassName={Number(challenge.current_equity) >= Number(challenge.starting_equity) ? "text-emerald-400" : "text-rose-400"}
            sub={`${((Number(challenge.current_equity) - Number(challenge.starting_equity)) / Number(challenge.starting_equity) * 100).toFixed(2)}%`}
          />
        </div>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Profit Target Progress</span>
              <span className="font-bold text-primary">{((Number(challenge.current_equity) - Number(challenge.starting_equity)) / (Number(challenge.starting_equity) * (challenge.profit_target_pct / 100)) * 100).toFixed(1)}%</span>
            </div>
            <Progress value={Math.max(0, (Number(challenge.current_equity) - Number(challenge.starting_equity)) / (Number(challenge.starting_equity) * (challenge.profit_target_pct / 100)) * 100)} className="h-2" />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Current: {formatCurrency(Math.max(0, Number(challenge.current_equity) - Number(challenge.starting_equity)), challenge.currency)}</span>
              <span>Target: {formatCurrency(Number(challenge.starting_equity) * (challenge.profit_target_pct / 100), challenge.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function ActiveChallengeQuickStats({ challenge }: { challenge: any }) {
  const start = Number(challenge.starting_equity);
  const eq = Number(challenge.current_equity);
  const peak = Number(challenge.peak_equity);
  
  const dailyLossLimit = start * (challenge.max_daily_loss_pct / 100);
  const totalDdLimit = start * (challenge.max_total_drawdown_pct / 100);
  
  const currentDd = ((peak - eq) / start) * 100;
  
  return (
    <GlassCard className="p-6 space-y-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <Target className="h-4 w-4" /> Rule Compliance
      </h3>
      
      <div className="space-y-5">
        <RuleMeter 
          label="Daily Loss Limit" 
          value={`${challenge.max_daily_loss_pct}%`}
          desc={`${formatCurrency(dailyLossLimit, challenge.currency)} max`}
          pct={0} // Server-side would calculate this based on today's starting equity
        />
        <RuleMeter 
          label="Max Drawdown" 
          value={`${challenge.max_total_drawdown_pct}%`}
          desc={`${formatCurrency(totalDdLimit, challenge.currency)} max`}
          pct={(currentDd / challenge.max_total_drawdown_pct) * 100}
        />
        <RuleMeter 
          label="Trading Days" 
          value={`${challenge.trading_days_used} / ${challenge.min_trading_days}`}
          desc="Minimum required"
          pct={(challenge.trading_days_used / challenge.min_trading_days) * 100}
        />
      </div>

      <div className="pt-4 border-t border-border/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <Badge variant="secondary" className="capitalize">{challenge.status}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Leverage</span>
          <span className="text-xs font-medium">{challenge.leverage}:1</span>
        </div>
      </div>
    </GlassCard>
  );
}

function ChallengeCard({ challenge }: { challenge: any }) {
  const status = challenge.status;
  const isPassed = status === "passed";
  const isFailed = status === "failed";
  
  return (
    <GlassCard className="group hover:border-primary/40 transition-all p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
          <GraduationCap className="h-4 w-4" />
        </div>
        <Badge 
          variant={isPassed ? "secondary" : isFailed ? "destructive" : "outline"}
          className={cn("capitalize text-[10px]", isPassed && "bg-emerald-500/10 text-emerald-500 border-none")}
        >
          {status}
        </Badge>
      </div>
      <h4 className="font-bold text-sm truncate">{challenge.name}</h4>
      <div className="flex items-center justify-between mt-4">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {formatCurrency(Number(challenge.account_size), challenge.currency)} · {challenge.preset.replace(/_/g, " ")}
        </div>
        <Button asChild size="icon" variant="ghost" className="h-8 w-8 rounded-full">
          <Link to="/prop-challenges/$id" params={{ id: challenge.id }}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </GlassCard>
  );
}

function StatBox({ label, value, sub, valueClassName }: { label: string; value: string; sub: string; valueClassName?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={cn("text-xl font-bold font-mono", valueClassName)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function RuleMeter({ label, value, pct, desc }: { label: string; value: string; pct: number; desc: string }) {
  const clampedPct = Math.max(0, Math.min(100, pct));
  const isWarning = clampedPct > 70;
  const isDanger = clampedPct > 90;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={cn("font-bold", isDanger ? "text-rose-500" : isWarning ? "text-amber-500" : "text-foreground")}>{value}</span>
      </div>
      <Progress 
        value={clampedPct} 
        className="h-1.5" 
        indicatorClassName={cn(isDanger ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-primary")} 
      />
      <p className="text-[10px] text-muted-foreground">{desc}</p>
    </div>
  );
}
