import { useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Clock, Users, Sparkles, Shield, TrendingUp, TrendingDown, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  getChampionship,
  registerChampionship,
  cancelChampionshipRegistration,
} from "@/lib/championship.functions";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";

export const Route = createFileRoute("/_authenticated/championship/$slug")({
  component: ChampionshipDetail,
});

function useCountdown(target: string | undefined) {
  const t = target ? new Date(target).getTime() : 0;
  const now = Date.now();
  const diff = Math.max(0, t - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { d, h, m, s, ended: diff === 0 };
}

function ChampionshipDetail() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const getFn = useServerFn(getChampionship);
  const regFn = useServerFn(registerChampionship);
  const cancelFn = useServerFn(cancelChampionshipRegistration);

  // fetch by slug via first list then id
  const idQuery = useQuery({
    queryKey: ["champ-slug", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("championships").select("id").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Championship not found");
      return data.id as string;
    },
  });
  const id = idQuery.data;

  const detail = useQuery({
    queryKey: ["champ-detail", id],
    queryFn: () => getFn({ data: { id: id! } }) as unknown as Promise<any>,
    enabled: !!id,
    refetchInterval: 15_000,
  });

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`champ:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_rankings", filter: `championship_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["champ-detail", id] }),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "championship_activity", filter: `championship_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["champ-detail", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  const register = useMutation({
    mutationFn: () => regFn({ data: { championship_id: id! } }),
    onSuccess: () => {
      toast.success("Registered — good luck!");
      qc.invalidateQueries({ queryKey: ["champ-detail", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to register"),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { championship_id: id! } }),
    onSuccess: () => {
      toast.success("Registration cancelled");
      qc.invalidateQueries({ queryKey: ["champ-detail", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const d = detail.data;
  const champ = d?.championship;
  const profileMap = useMemo(() => {
    const m = new Map<string, any>();
    (d?.profiles ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [d]);

  const startsIn = useCountdown(champ?.start_at);
  const endsIn = useCountdown(champ?.end_at);
  const registeredOpen =
    champ && ["registration", "upcoming"].includes(champ.status) && new Date(champ.registration_closes_at) > new Date();
  const isRegistered = !!d?.my_registration && !d?.my_registration.cancelled_at;
  const isParticipant = !!d?.my_participant && d?.my_participant.status === "active";
  const myRank = d?.rankings?.find((r: any) => r.user_id === user?.id);

  if (idQuery.isLoading || detail.isLoading) return <div className="h-96 animate-pulse rounded-3xl bg-muted/40" />;
  if (idQuery.error || detail.error || !champ)
    return (
      <EmptyState
        title="Championship not found"
        description="Return to the championship home page."
        action={<Button onClick={() => nav({ to: "/championship" })}>Back to championships</Button>}
      />
    );

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-amber-500/15 via-primary/10 to-background p-6 shadow-elegant md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Trophy className="h-4 w-4" />
              {champ.season_year} · Month {champ.season_month}
            </div>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">{champ.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{champ.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="uppercase">
              <span
                className={cn(
                  "mr-1.5 h-1.5 w-1.5 rounded-full",
                  champ.status === "live" ? "animate-pulse bg-emerald-500" : "bg-amber-500",
                )}
              />
              {champ.status}
            </Badge>
            {isParticipant || isRegistered ? (
              <ShareToCommunityButton
                sourceType="championship"
                sourceRef={`${champ.season_year}-${String(champ.season_month).padStart(2, "0")}`}
                label="Share"
                variant="outline"
              />
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={champ.status === "live" ? "Ends in" : "Starts in"} value={
            champ.status === "live"
              ? `${endsIn.d}d ${endsIn.h}h ${endsIn.m}m`
              : `${startsIn.d}d ${startsIn.h}h ${startsIn.m}m`
          } icon={Clock} />
          <Stat label="Participants" value={String(d?.participant_count ?? 0)} icon={Users} />
          <Stat label="Balance" value={`$${Number(champ.starting_balance).toLocaleString()}`} icon={Sparkles} />
          <Stat label="Max drawdown" value={`${champ.max_drawdown_pct}%`} icon={Shield} />
        </div>

        {/* CTA */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {registeredOpen && !isRegistered ? (
            <Button size="lg" onClick={() => register.mutate()} disabled={register.isPending}>
              <Trophy className="mr-2 h-4 w-4" /> Register now
            </Button>
          ) : null}
          {registeredOpen && isRegistered ? (
            <Button size="lg" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Cancel registration
            </Button>
          ) : null}
          {isRegistered ? <Badge className="bg-emerald-500/15 text-emerald-500">✓ Registered</Badge> : null}
          {isParticipant && myRank ? (
            <Badge className="bg-primary/15 text-primary text-sm">Your rank: #{myRank.rank ?? "—"}</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Leaderboard */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-sm font-semibold">Live Leaderboard</h2>
              <div className="text-xs text-muted-foreground">Updates automatically</div>
            </div>
            {d?.rankings?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Rank</th>
                      <th className="px-3 py-2 text-left">Trader</th>
                      <th className="px-3 py-2 text-right">PnL</th>
                      <th className="px-3 py-2 text-right">R</th>
                      <th className="px-3 py-2 text-right">Win%</th>
                      <th className="px-3 py-2 text-right">PF</th>
                      <th className="px-3 py-2 text-right">DD</th>
                      <th className="px-3 py-2 text-right">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rankings.slice(0, 100).map((r: any) => {
                      const p = profileMap.get(r.user_id);
                      const isMe = r.user_id === user?.id;
                      const trend = r.previous_rank != null && r.rank != null ? r.previous_rank - r.rank : 0;
                      return (
                        <tr key={r.id} className={cn("border-t transition hover:bg-muted/40", isMe && "bg-primary/5")}>
                          <td className="px-3 py-2 font-mono font-semibold">
                            {r.rank ? `#${r.rank}` : "—"}
                            {trend > 0 ? <TrendingUp className="ml-1 inline h-3 w-3 text-emerald-500" /> : trend < 0 ? <TrendingDown className="ml-1 inline h-3 w-3 text-rose-500" /> : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {p?.avatar_url ? (
                                <img src={p.avatar_url} className="h-6 w-6 rounded-full" alt="" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-muted" />
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium">{p?.display_name ?? p?.username ?? "Trader"}</div>
                                <div className="text-[10px] text-muted-foreground">{p?.country ?? ""}</div>
                              </div>
                            </div>
                          </td>
                          <td className={cn("px-3 py-2 text-right font-mono font-semibold", r.pnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
                            {r.pnl >= 0 ? "+" : ""}${Number(r.pnl).toFixed(0)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{Number(r.r_multiple).toFixed(2)}R</td>
                          <td className="px-3 py-2 text-right font-mono">{Number(r.win_rate).toFixed(0)}%</td>
                          <td className="px-3 py-2 text-right font-mono">{Number(r.profit_factor).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">${Number(r.max_drawdown).toFixed(0)}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.total_trades}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState className="py-12" title="No rankings yet" description="Rankings appear once participants start trading." />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold">Rules</h3>
            <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <li>Starting balance: <b className="text-foreground">${Number(champ.starting_balance).toLocaleString()}</b></li>
              <li>Max daily loss: <b className="text-foreground">{champ.max_daily_loss_pct}%</b></li>
              <li>Max drawdown: <b className="text-foreground">{champ.max_drawdown_pct}%</b></li>
              <li>Max risk / trade: <b className="text-foreground">{champ.max_risk_per_trade_pct}%</b></li>
              <li>Minimum trades: <b className="text-foreground">{champ.min_trades}</b></li>
              <li>Markets: <b className="text-foreground">{(champ.allowed_markets ?? []).join(", ") || "All"}</b></li>
              <li>Win condition: <b className="text-foreground uppercase">{champ.win_condition}</b></li>
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Activity
            </h3>
            <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto text-xs">
              {d?.activity?.length ? (
                d.activity.map((a: any) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-lg border bg-muted/20 p-2">
                    <div
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        a.severity === "success" && "bg-emerald-500",
                        a.severity === "warning" && "bg-amber-500",
                        a.severity === "error" && "bg-rose-500",
                        a.severity === "info" && "bg-primary",
                      )}
                    />
                    <div className="flex-1">
                      <div className="text-foreground">{a.message}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleTimeString()}</div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">No activity yet</li>
              )}
            </ul>
          </div>

          {d?.hall_of_fame ? (
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-background p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-500">
                <Trophy className="h-3.5 w-3.5" /> Hall of Fame
              </h3>
              <div className="mt-3 text-lg font-bold">
                {profileMap.get(d.hall_of_fame.champion_user_id)?.display_name ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">Champion</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
