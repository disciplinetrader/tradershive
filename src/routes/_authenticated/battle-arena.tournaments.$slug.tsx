import { useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Users, Sparkles, Shield, TrendingUp, Zap, Info, Book, Film, Megaphone, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  getChampionship,
  registerChampionship,
  cancelChampionshipRegistration,
  joinChampionshipLive,
} from "@/lib/championship.functions";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { CountdownPill } from "@/components/championship/CountdownPill";
import { LeaderboardTable } from "@/components/championship/LeaderboardTable";
import { ActivityFeed } from "@/components/championship/ActivityFeed";
import { PersonalTimeline, buildPersonalTimeline } from "@/components/championship/PersonalTimeline";
import { MyPerformancePanel } from "@/components/championship/MyPerformancePanel";
import { TournamentSummary } from "@/components/championship/TournamentSummary";
import { routeBoundaries } from "@/lib/route-boundaries";

export const Route = createFileRoute("/_authenticated/battle-arena/tournaments/$slug")({
  component: ChampionshipDetail,
  ...routeBoundaries({
    label: "Championship",
    boundary: "championship_detail_route",
    backHref: "/championship",
    backLabel: "Back to Championships",
  }),
});

function ChampionshipDetail() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const getFn = useServerFn(getChampionship);
  const regFn = useServerFn(registerChampionship);
  const cancelFn = useServerFn(cancelChampionshipRegistration);
  const joinLiveFn = useServerFn(joinChampionshipLive);

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

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`champ:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "championship_rankings", filter: `championship_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["champ-detail", id] }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "championship_activity", filter: `championship_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["champ-detail", id] }),
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
  const joinLive = useMutation({
    mutationFn: () => joinLiveFn({ data: { championship_id: id! } }),
    onSuccess: () => {
      toast.success("You're in — tournament account created.");
      qc.invalidateQueries({ queryKey: ["champ-detail", id] });
      setTimeout(() => nav({ to: "/trading" }), 800);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to join tournament"),
  });

  const d = detail.data;
  const champ = d?.championship;
  const profileMap = useMemo(() => {
    const m = new Map<string, any>();
    (d?.profiles ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [d]);

  const registeredOpen =
    champ && ["registration", "upcoming"].includes(champ.status) && new Date(champ.registration_closes_at) > new Date();
  const isRegistered = !!d?.my_registration && !d?.my_registration.cancelled_at;
  const isParticipant = !!d?.my_participant && d?.my_participant.status === "active";
  const myRank = d?.rankings?.find((r: any) => r.user_id === user?.id);
  const timeline = useMemo(
    () =>
      champ
        ? buildPersonalTimeline({
            champ,
            participant: d?.my_participant,
            myRank,
            activity: d?.activity,
            userId: user?.id,
          })
        : [],
    [champ, d?.activity, d?.my_participant, myRank, user?.id],
  );

  if (idQuery.isLoading || detail.isLoading)
    return <div className="h-96 animate-pulse rounded-3xl bg-muted/40" />;
  if (idQuery.error || detail.error || !champ)
    return (
      <EmptyState
        title="Tournament not found"
        description="Return to the tournament home page."
        action={{ label: "Back to tournaments", onClick: () => nav({ to: "/championship" }) }}
      />
    );

  const prizePool = champ.prize_info?.pool ?? champ.prize_info?.total;
  const isLive = champ.status === "live";
  const isCompleted = champ.status === "completed";
  const showLobby = !isLive && !isCompleted;
  const target = isLive ? champ.end_at : isCompleted ? champ.end_at : champ.start_at;
  const targetLabel = isLive ? "Ends" : isCompleted ? "Ended" : "Starts";
  const announcements = (d?.activity ?? []).filter((a: any) => a.kind === "announcement");

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-warning/10 via-primary/5 to-background p-6 shadow-elegant md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Trophy className="h-4 w-4" />
              {champ.season_year} · Month {champ.season_month}
            </div>
            <h1 className="mt-2 truncate text-3xl font-bold md:text-4xl">{champ.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{champ.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="uppercase">
              <span
                className={cn(
                  "mr-1.5 h-1.5 w-1.5 rounded-full",
                  isLive ? "animate-pulse bg-success" : isCompleted ? "bg-muted-foreground" : "bg-warning",
                )}
              />
              {champ.status}
            </Badge>
            <CountdownPill target={target} label={targetLabel} />
            {(isParticipant || isRegistered) && (
              <ShareToCommunityButton
                sourceType="championship"
                sourceRef={`${champ.season_year}-${String(champ.season_month).padStart(2, "0")}`}
                label="Share"
                variant="outline"
              />
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Participants" value={String(d?.participant_count ?? 0)} icon={Users} />
          <Stat label="Balance" value={`$${Number(champ.starting_balance).toLocaleString()}`} icon={Sparkles} />
          <Stat label="Max drawdown" value={`${champ.max_drawdown_pct}%`} icon={Shield} />
          <Stat label="Prize pool" value={prizePool ? `$${Number(prizePool).toLocaleString()}` : "XP + Badges"} icon={Trophy} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isLive && !isParticipant && (
            <Button
              size="lg"
              onClick={() => joinLive.mutate()}
              disabled={joinLive.isPending}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              <Zap className="mr-2 h-4 w-4" /> Join Live · ${Number(champ.starting_balance).toLocaleString()} account
            </Button>
          )}
          {registeredOpen && !isRegistered && !isLive && (
            <Button size="lg" onClick={() => register.mutate()} disabled={register.isPending}>
              <Trophy className="mr-2 h-4 w-4" /> Register now
            </Button>
          )}
          {registeredOpen && isRegistered && !isParticipant && (
            <Button size="lg" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Cancel registration
            </Button>
          )}
          {isParticipant && (
            <Button size="lg" variant="outline" onClick={() => nav({ to: "/trading" })}>
              <TrendingUp className="mr-2 h-4 w-4" /> Open trading workspace
            </Button>
          )}
          {isRegistered && !isParticipant && <Badge className="bg-success/15 text-success">✓ Registered</Badge>}
          {isParticipant && <Badge className="bg-success/15 text-success">✓ Trading live</Badge>}
          {isParticipant && myRank && (
            <Badge className="bg-primary/15 text-sm text-primary">Your rank: #{myRank.rank ?? "—"}</Badge>
          )}
        </div>
      </div>

      {isCompleted && myRank && (
        <TournamentSummary champ={champ} rank={myRank} totalParticipants={d?.participant_count ?? 0} />
      )}

      <Tabs defaultValue={showLobby ? "lobby" : isCompleted ? "leaderboard" : "leaderboard"} className="space-y-4">
        <TabsList className="flex flex-wrap">
          {showLobby && <TabsTrigger value="lobby">Lobby</TabsTrigger>}
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rules">Rules & Prizes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="my">My Performance</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {showLobby && (
          <TabsContent value="lobby">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="h-4 w-4 text-primary" /> Tournament Lobby
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registration is open. Get familiar with the rules while you wait for the start.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <LobbyStat label="Countdown" value={<CountdownPill target={champ.start_at} label="Starts" />} />
                  <LobbyStat label="Registration closes" value={new Date(champ.registration_closes_at).toLocaleString()} />
                  <LobbyStat label="Participants" value={String(d?.participant_count ?? 0)} />
                  <LobbyStat label="Balance" value={`$${Number(champ.starting_balance).toLocaleString()}`} />
                  <LobbyStat label="Markets" value={(champ.allowed_markets ?? []).join(", ") || "All"} />
                  <LobbyStat label="Duration" value={`${new Date(champ.start_at).toLocaleDateString()} → ${new Date(champ.end_at).toLocaleDateString()}`} />
                </div>
                <RulesGrid champ={champ} className="mt-4" />
              </div>
              <div className="rounded-2xl border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Megaphone className="h-4 w-4 text-primary" /> Announcements
                </div>
                <div className="mt-3">
                  <ActivityFeed
                    activity={announcements.length ? announcements : (d?.activity ?? []).slice(0, 20)}
                    profiles={d?.profiles ?? []}
                    emptyMessage="No announcements yet"
                    maxHeight="26rem"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="leaderboard">
          <LeaderboardTable rows={d?.rankings ?? []} profiles={d?.profiles ?? []} currentUserId={user?.id} />
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="About" icon={Info}>
              <p className="text-sm text-muted-foreground">{champ.description || "No description provided."}</p>
            </Section>
            <Section title="Schedule" icon={Book}>
              <ul className="space-y-1 text-sm">
                <Li k="Registration opens" v={new Date(champ.registration_opens_at).toLocaleString()} />
                <Li k="Registration closes" v={new Date(champ.registration_closes_at).toLocaleString()} />
                <Li k="Starts" v={new Date(champ.start_at).toLocaleString()} />
                <Li k="Ends" v={new Date(champ.end_at).toLocaleString()} />
              </ul>
            </Section>
            <Section title="Allowed markets & symbols" icon={Target}>
              <div className="flex flex-wrap gap-1.5">
                {(champ.allowed_markets ?? []).map((m: string) => (
                  <Badge key={m} variant="outline" className="uppercase">{m}</Badge>
                ))}
                {!(champ.allowed_markets ?? []).length && <span className="text-sm text-muted-foreground">All markets</span>}
              </div>
              {champ.allowed_symbols?.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {champ.allowed_symbols.map((s: string) => (
                    <span key={s} className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px]">{s}</span>
                  ))}
                </div>
              ) : null}
            </Section>
            <Section title="FAQ" icon={Info}>
              <FaqItem q="What are the risk rules?" a={`Max drawdown ${champ.max_drawdown_pct}%. Max daily loss ${champ.max_daily_loss_pct}%. Max ${champ.max_risk_per_trade_pct}% risk per trade.`} />
              <FaqItem q="How is the winner decided?" a={`Winner is the trader with the highest ${champ.win_condition.replace(/_/g, " ")} once the tournament closes.`} />
              <FaqItem q="Do results contribute to my career?" a="Yes — tournament trades roll into your Statistics, Achievements, XP, and career profile automatically." />
              <FaqItem q="Can I replay my trades?" a="Yes — every closed trade is available in Replay Studio after the tournament ends." />
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Risk rules" icon={Shield}>
              <RulesGrid champ={champ} />
            </Section>
            <Section title="Prize structure" icon={Trophy}>
              <PrizeStructure champ={champ} />
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-card p-4 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">Live activity feed</h3>
              <ActivityFeed activity={d?.activity ?? []} profiles={d?.profiles ?? []} maxHeight="36rem" />
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="h-4 w-4 text-primary" /> Announcements
              </h3>
              <ActivityFeed
                activity={announcements}
                profiles={d?.profiles ?? []}
                emptyMessage="No announcements yet"
                maxHeight="36rem"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="my">
          <MyPerformancePanel champ={champ} rank={myRank} totalParticipants={d?.participant_count ?? 0} />
          {isCompleted && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => nav({ to: "/replay" })}>
                <Film className="mr-1.5 h-3.5 w-3.5" /> Replay my trades
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Your tournament journey</h3>
            <PersonalTimeline milestones={timeline} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {children}
    </div>
  );
}

function Li({ k, v }: { k: string; v: string }) {
  return (
    <li className="flex items-center justify-between border-b border-dashed border-border/60 py-1 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </li>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-lg border bg-background/40 p-3">
      <summary className="cursor-pointer text-sm font-medium">{q}</summary>
      <div className="mt-2 text-xs text-muted-foreground">{a}</div>
    </details>
  );
}

function LobbyStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function RulesGrid({ champ, className }: { champ: any; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-2 text-xs md:grid-cols-3", className)}>
      <RuleCell label="Starting balance" value={`$${Number(champ.starting_balance).toLocaleString()}`} />
      <RuleCell label="Max daily loss" value={`${champ.max_daily_loss_pct}%`} />
      <RuleCell label="Max drawdown" value={`${champ.max_drawdown_pct}%`} />
      <RuleCell label="Max risk / trade" value={`${champ.max_risk_per_trade_pct}%`} />
      <RuleCell label="Minimum trades" value={String(champ.min_trades)} />
      <RuleCell label="Win condition" value={String(champ.win_condition).replace(/_/g, " ")} />
      <RuleCell label="Markets" value={(champ.allowed_markets ?? []).join(", ") || "All"} />
      <RuleCell label="Sessions" value={(champ.allowed_sessions ?? []).join(", ") || "24/7"} />
    </ul>
  );
}

function RuleCell({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-lg border bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium capitalize">{value}</div>
    </li>
  );
}

function PrizeStructure({ champ }: { champ: any }) {
  const info = champ.prize_info ?? {};
  const tiers = Array.isArray(info.tiers) ? info.tiers : null;
  return (
    <div className="space-y-3">
      {info.pool ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <span className="text-muted-foreground">Prize pool: </span>
          <span className="font-bold text-warning">${Number(info.pool).toLocaleString()}</span>
        </div>
      ) : null}
      {tiers ? (
        <ul className="space-y-1.5 text-sm">
          {tiers.map((t: any, i: number) => (
            <li key={i} className="flex items-center justify-between rounded-lg border bg-background/40 p-2.5">
              <span className="font-medium">
                {t.label ?? (t.rank_from === t.rank_to ? `#${t.rank_from}` : `#${t.rank_from}-${t.rank_to}`)}
              </span>
              <span className="font-mono text-primary">
                {t.cash ? `$${Number(t.cash).toLocaleString()}` : ""}
                {t.xp ? ` · ${t.xp} XP` : ""}
                {t.badge ? ` · ${t.badge}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border bg-background/40 p-3 text-xs text-muted-foreground">
          Winners earn platform XP, badges, and a permanent place in the Hall of Fame. Cash prizes may apply to sponsored events.
        </div>
      )}
    </div>
  );
}
