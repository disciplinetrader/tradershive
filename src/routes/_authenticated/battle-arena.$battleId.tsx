import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getBattle, joinBattle, leaveBattle, cancelBattle, finalizeBattle,
  setParticipantReady, tickBattle
} from "@/lib/battle-arena.functions";
import {
  listBattleEvents, getBattleLiveStats, heartbeatPresence, listBattlePresence, leavePresence,
} from "@/lib/battle-arena-live.functions";
import { LiveBattleHeader } from "@/components/battle-arena/LiveBattleHeader";
import { LiveScoreboard } from "@/components/battle-arena/LiveScoreboard";
import { LiveStatistics } from "@/components/battle-arena/LiveStatistics";
import { LiveActivityFeed } from "@/components/battle-arena/LiveActivityFeed";
import { BattleTimeline } from "@/components/battle-arena/BattleTimeline";
import { BattleChat } from "@/components/battle-arena/BattleChat";
import { RulesPanel } from "@/components/battle-arena/RulesPanel";
import { LiveLeaderboard } from "@/components/battle-arena/LiveLeaderboard";
import { ParticipantsList } from "@/components/battle-arena/ParticipantsList";
import { BattleResultsView } from "@/components/battle-arena/BattleResultsView";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LineChart, LogIn, LogOut, Trash2, Copy, Play, Eye, ShieldCheck, Check, Maximize2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBattleRealtime } from "@/hooks/use-battle-realtime";
import { routeBoundaries } from "@/lib/route-boundaries";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PaperTradingProvider } from "@/components/paper-trading/context";
import { TradingWorkspace } from "@/components/trading/TradingWorkspace";
import { ArenaCommandRail } from "@/components/battle-arena/ArenaCommandRail";
import { BattleStartIntro } from "@/components/battle-arena/lobby/BattleStartIntro";
import { CountdownTimer } from "@/components/battle-arena/CountdownTimer";
import { BattleScrubber } from "@/components/battle-arena/BattleScrubber";
import { BattleStatusBar } from "@/components/battle-arena/BattleStatusBar";



export const Route = createFileRoute("/_authenticated/battle-arena/$battleId")({
  component: BattleDetail,
  ...routeBoundaries({
    label: "Arena",
    boundary: "arena_detail_route",
    backHref: "/battle-arena",
    backLabel: "Back to HIVE Arena",
  }),
});

function BattleDetail() {
  const { battleId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fnGet = useServerFn(getBattle);
  const fnJoin = useServerFn(joinBattle);
  const fnLeave = useServerFn(leaveBattle);
  const fnCancel = useServerFn(cancelBattle);
  const fnFinalize = useServerFn(finalizeBattle);
  const fnReady = useServerFn(setParticipantReady);
  const fnEvents = useServerFn(listBattleEvents);
  const fnStats = useServerFn(getBattleLiveStats);
  const fnHeartbeat = useServerFn(heartbeatPresence);
  const fnPresence = useServerFn(listBattlePresence);
  const fnLeavePres = useServerFn(leavePresence);
  const fnTick = useServerFn(tickBattle);

  const battleQ = useQuery({
    queryKey: ["battle", battleId],
    queryFn: () => fnGet({ data: { id: battleId } }),
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.battle?.status;
      if (status === 'countdown' || status === 'filling' || status === 'open' || status === 'upcoming') return 3000;
      return 30000;
    },
  });



  const eventsQ = useQuery({
    queryKey: ["battle-events", battleId],
    queryFn: () => fnEvents({ data: { battleId, limit: 100 } }),
  });

  const statsQ = useQuery({
    queryKey: ["battle-live-stats", battleId],
    queryFn: () => fnStats({ data: { battleId } }),
    refetchInterval: 20000,
  });

  const presenceQ = useQuery({
    queryKey: ["battle-presence", battleId],
    queryFn: () => fnPresence({ data: { battleId } }),
    refetchInterval: 20000,
  });

  // Presence heartbeat.
  const battle = battleQ.data?.battle;
  const isParticipant = battleQ.data?.isParticipant ?? false;
  const isHost = battleQ.data?.isHost ?? false;
  // Must match the presence enum in battle-arena-live.functions.ts:139
  // ("spectator" | "participant" | "host"). This previously sent "competitor",
  // which failed zod validation on every heartbeat and was swallowed by the
  // .catch(() => {}) below — so participants never registered presence at all.
  const role = isHost ? "host" : isParticipant ? "participant" : "spectator";

  const [showIntro, setShowIntro] = useState(false);
  const [introSeen, setIntroSeen] = useState(false);

  useEffect(() => {
    if ((battle?.status === "countdown" || battle?.status === "live") && !introSeen) {
      setShowIntro(true);
      setIntroSeen(true);
    }
  }, [battle?.status, introSeen]);

  // Drive this battle's clock while it is pre-live.
  //
  // Every transition lives in the `tick_battle` RPC — time-gated and
  // idempotent, so calling early is a no-op and concurrent viewers can't
  // double-apply one. The `battle-tick` cron runs the same logic once a minute
  // for battles nobody has open; this poll exists because countdown -> live is
  // a 10-second edge that a 1-minute cron cannot resolve.
  const tickRef = useRef(fnTick);
  tickRef.current = fnTick;
  const battleStatus = battle?.status;

  useEffect(() => {
    if (!battleId || !battleStatus) return;
    if (!["upcoming", "open", "filling", "ready", "countdown", "live"].includes(battleStatus)) return;

    let cancelled = false;
    const run = async () => {
      try {
        const res = await tickRef.current({ data: { battleId } });
        if (!cancelled && res?.status && res.status !== battleStatus) {
          qc.invalidateQueries({ queryKey: ["battle", battleId] });
        }
      } catch {
        // Transient — the cron is the backstop and the next interval retries.
      }
    };

    run();
    const everyMs = battleStatus === "countdown" ? 2000 : battleStatus === "ready" ? 5000 : 30000;
    const timer = setInterval(run, everyMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [battleId, battleStatus, qc]);


  // Hooks must stay above every early return (React error #310).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [openByUser, setOpenByUser] = useState<Record<string, number>>({});
  const [lastTradeByUser, setLastTradeByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!battle) return;
    const beat = () => fnHeartbeat({ data: { battleId, status: isParticipant ? "trading" : "watching", role } }).catch(() => {});
    beat();
    const t = setInterval(beat, 25000);
    const onHide = () => { if (document.hidden) fnHeartbeat({ data: { battleId, status: "idle", role } }).catch(() => {}); else beat(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      fnLeavePres({ data: { battleId } }).catch(() => {});
    };
  }, [battle, battleId, isParticipant, role, fnHeartbeat, fnLeavePres]);

  // Open-position counts and last-trade times for the live leaderboard.
  // Loaded once per battle, then refreshed by the paper_trades registration on
  // the battle channel below.
  //
  // Reads only the viewer's own rows despite the battle_id filter — paper_trades
  // RLS is `own trades` (auth.uid() = user_id) and nothing exempts battle
  // participants, so opponents' cells are blank. See BA-4 in docs/known-issues.md:
  // the agreed fix replaces this function with a count-only server-side
  // aggregate — opponents' entry/size/stop/target stay hidden during a battle.
  const currentBattleId = useRef(battleId);
  currentBattleId.current = battleId;

  const loadTradeCounters = useCallback(async () => {
    const { data: openRows } = await supabase.from("paper_trades")
      .select("user_id").eq("battle_id", battleId).eq("status", "open");
    const opens: Record<string, number> = {};
    (openRows ?? []).forEach((r: any) => { opens[r.user_id] = (opens[r.user_id] ?? 0) + 1; });
    const { data: recent } = await supabase.from("paper_trades")
      .select("user_id, opened_at, closed_at").eq("battle_id", battleId)
      .order("opened_at", { ascending: false }).limit(200);
    const last: Record<string, string> = {};
    (recent ?? []).forEach((r: any) => {
      const t = r.closed_at ?? r.opened_at; if (!t) return;
      if (!last[r.user_id] || new Date(t) > new Date(last[r.user_id])) last[r.user_id] = t;
    });
    // Two awaits in, the route may have moved to another battle.
    if (currentBattleId.current !== battleId) return;
    setOpenByUser(opens);
    setLastTradeByUser(last);
  }, [battleId]);

  useEffect(() => { void loadTradeCounters(); }, [loadTradeCounters]);

  // One channel for the whole screen — see the hook for why.
  useBattleRealtime(battleId, { onPaperTrades: loadTradeCounters });

  if (battleQ.isLoading) return <div className="grid place-items-center h-[calc(100dvh-64px)]"><div className="flex flex-col items-center gap-4"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /><p className="text-sm font-black uppercase tracking-widest animate-pulse">Entering Arena Match...</p></div></div>;
  if (battleQ.isError) return <div className="flex flex-col items-center justify-center h-[calc(100dvh-64px)] p-8 text-center"><Badge variant="destructive" className="mb-4">Error</Badge><h3 className="text-xl font-black mb-2">Failed to load Arena</h3><p className="text-muted-foreground mb-6">{(battleQ.error as any)?.message || "The Arena match could not be found or you don't have access."}</p><Button onClick={() => navigate({ to: "/battle-arena" })}>Return to Lobby</Button></div>;
  if (!battleQ.data || !battle) return <div className="text-sm text-muted-foreground p-8 text-center">Arena match not found.</div>;

  const { participants = [], rankings = [], results = [], profiles = [] } = (battleQ.data as any) || {};


  const canJoin = !isParticipant && battle?.visibility === "public" && ["draft", "upcoming", "open", "filling"].includes(battle?.status || "") && participants.length < (battle?.max_participants || 0);
  const canLeave = isParticipant && ["draft", "upcoming", "open", "filling", "ready"].includes(battle?.status || "");
  const canCancel = isHost && ["draft", "upcoming", "open", "filling", "ready", "countdown"].includes(battle?.status || "");
  const canFinalize = isHost && battle?.status === "live";

  const me = participants.find((p: any) => p.user_id === user?.id);
  const isReady = me?.is_ready ?? false;

  // join_battle creates a paper_accounts row for the joiner. The accounts query
  // has a 30s staleTime and nothing else invalidates it, so without this the
  // battle account is missing from the list the workspace resolves against and
  // the joining player lands on a personal account. The host never saw it
  // because their battle account predates the page load.
  const doJoin = async () => { try { await fnJoin({ data: { battleId } }); toast.success("Joined!"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); qc.invalidateQueries({ queryKey: ["paper", "accounts"] }); } catch (e: any) { toast.error(e?.message ?? "Failed"); } };
  const doLeave = async () => { try { await fnLeave({ data: { battleId } }); toast.success("Left"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message ?? "Failed"); } };
  const doReady = async () => {
    try {
      await fnReady({ data: { battleId, ready: !isReady } });
      toast.success(isReady ? "Un-ready" : "Locked In!");
      qc.invalidateQueries({ queryKey: ["battle", battleId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };
  const doCancel = async () => {

    setCancelling(true);
    try {
      await fnCancel({ data: { battleId } });
      toast.success("Arena match cancelled");
      setCancelOpen(false);
      navigate({ to: "/battle-arena" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to cancel arena match");
    } finally {
      setCancelling(false);
    }
  };
  const doFinalize = async () => { try { await fnFinalize({ data: { battleId } }); toast.success("Finalized"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message); } };

  const onlineCount = (presenceQ.data ?? []).filter((p: any) => p.status !== "disconnected").length;

  const isLobby = ["draft", "upcoming", "open", "filling", "ready", "countdown"].includes(battle.status);
  const isLive = battle.status === "live" || battle.status === "ready" || battle.status === "countdown";

  if (isLive) {
    const myParticipant = participants.find((p: any) => p.user_id === user?.id);
    const battleAccountId = myParticipant?.paper_account_id;

    return (
      <PaperTradingProvider initialAccountId={battleAccountId}>
        <div className="flex h-[calc(100dvh-64px)] w-full flex-col overflow-hidden bg-background">
          <div className="flex h-full w-full overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 relative">
              {/* Header Area within live workspace */}
                <div className="h-14 border-b border-border/40 bg-card/20 px-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <Link to="/battle-arena" className="text-muted-foreground hover:text-foreground">
                      <Badge variant="outline" className="h-7 font-black bg-background/50">HIVE ARENA</Badge>
                    </Link>
                    <div className="h-4 w-[1px] bg-border/40" />
                    <h1 className="font-bold tracking-tight text-sm uppercase truncate max-w-[200px]">{battle.name}</h1>
                    <Badge variant="default" data-testid="battle-live" className="bg-success text-success-foreground font-black text-[10px] animate-pulse">LIVE</Badge>
                  </div>
                  
                  <div className="flex-1 max-w-2xl px-4">
                    <BattleScrubber />
                  </div>

                  <div className="flex items-center gap-4">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 rounded-full"
                      onClick={() => {
                        if (document.fullscreenElement) {
                          document.exitFullscreen();
                        } else {
                          document.documentElement.requestFullscreen();
                        }
                      }}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              
              <div className="flex-1 min-h-0 relative">
                <TradingWorkspace accountId={battleAccountId} />
              </div>

              <BattleStatusBar />
            </div>
            
            <div className="w-80 border-l border-border/40 hidden xl:block overflow-hidden shrink-0">
              <ArenaCommandRail />
            </div>
          </div>
        </div>
      </PaperTradingProvider>
    );
  }


  return (

    <div className={cn("space-y-6 animate-in fade-in duration-500", battle.status === 'countdown' && "animate-pulse")}>
      {showIntro && <BattleStartIntro onComplete={() => setShowIntro(false)} />}

      <LiveBattleHeader
        battle={battle || { name: "Loading...", status: "upcoming" } as any}
        stats={statsQ.data as any}
        profiles={profiles}
        participantCount={participants.length}
      />

      <div className="flex flex-wrap items-center gap-3">
        {!isParticipant && (
          <Badge variant="outline" className="h-7 px-3 bg-card/40 border-border/60 text-muted-foreground font-bold">
            <Eye className="mr-2 h-3.5 w-3.5" /> SPECTATOR MODE
          </Badge>
        )}
        <Badge variant="outline" className="h-7 px-3 bg-card/40 border-border/60 text-muted-foreground font-bold">
          <div className="mr-2 h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> {onlineCount} ONLINE
        </Badge>
        
        <div className="ml-auto flex items-center gap-2">
          {canJoin && <Button size="sm" data-testid="battle-join" onClick={doJoin} className="font-bold rounded-xl shadow-lg shadow-primary/20"><LogIn className="mr-1.5 h-4 w-4" />Join Arena</Button>}
          {isParticipant && isLobby && (
            <Button 
              size="sm" 
              onClick={doReady} 
              variant={isReady ? "secondary" : "default"}
              className={cn("font-bold rounded-xl transition-all", isReady ? "bg-success/20 text-success border-success/30 hover:bg-success/30" : "shadow-lg shadow-primary/20")}
            >
              {isReady ? <Check className="mr-1.5 h-4 w-4" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
              {isReady ? "Locked In" : "Ready to Fight"}
            </Button>
          )}
          {canLeave && <Button size="sm" variant="outline" onClick={doLeave} className="font-bold rounded-xl border-border/60"><LogOut className="mr-1.5 h-4 w-4" />Leave</Button>}
          {canCancel && <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)} className="font-bold rounded-xl"><Trash2 className="mr-1.5 h-4 w-4" />Cancel</Button>}
          {canFinalize && <Button size="sm" variant="secondary" onClick={doFinalize} className="font-bold rounded-xl"><Play className="mr-1.5 h-4 w-4" />Finalize</Button>}
        </div>

        {battle.invite_code && (isHost || isParticipant) && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1 text-xs">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invite Code:</span>
            <code className="rounded bg-background px-2 py-0.5 font-mono font-bold">{battle.invite_code}</code>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg" onClick={() => { navigator.clipboard.writeText(battle.invite_code ?? ""); toast.success("Code Copied"); }}><Copy className="h-3 w-3" /></Button>
            <div className="h-3 w-[1px] bg-border/40 mx-1" />
            <Button size="sm" variant="ghost" className="h-6 flex gap-1 px-2 rounded-lg text-[10px] font-bold" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/battle-arena/${battleId}`); toast.success("Link Copied"); }}><Copy className="h-3 w-3" /> Copy Link</Button>
          </div>
        )}
      </div>


      {battle.status === "completed" && (
        <BattleResultsView battle={battle} results={results} profiles={profiles} />
      )}

      {!isLobby && <LiveScoreboard stats={statsQ.data as any} profiles={profiles} />}

      <div className={cn(
        "grid grid-cols-1 gap-6",
        isLobby ? "lg:grid-cols-[1fr_400px]" : "xl:grid-cols-[minmax(0,1fr)_400px]"
      )}>
        <div className="space-y-6">
          {!isLobby && (
            <LiveLeaderboard
              rankings={rankings}
              profiles={profiles}
              presence={(presenceQ.data ?? []) as any}
              winCondition={battle.win_condition}
              openPositionsByUser={openByUser}
              lastTradeByUser={lastTradeByUser}
            />
          )}
          
          <div className={cn(
            "grid gap-6",
            isLobby ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          )}>
            <ParticipantsList 
              participants={participants} 
              profiles={profiles} 
              hostId={battle.host_id} 
              isLobby={isLobby}
            />
            {isLobby && <RulesPanel battle={battle} />}
          </div>
          
          {!isLobby && <LiveStatistics stats={statsQ.data as any} />}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border/60 bg-card/20 p-6 shadow-xl shadow-background/10">
            <Tabs defaultValue="chat" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-background/40 p-1 rounded-2xl h-12">
                <TabsTrigger value="chat" className="rounded-xl font-bold uppercase tracking-widest text-[10px]">Arena Chat</TabsTrigger>
                <TabsTrigger value="activity" className="rounded-xl font-bold uppercase tracking-widest text-[10px]">Activity</TabsTrigger>
                <TabsTrigger value="timeline" className="rounded-xl font-bold uppercase tracking-widest text-[10px]">Chronology</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="mt-4 focus-visible:outline-none min-h-[400px] max-h-[600px] overflow-y-auto">
                <BattleChat 
                  battleId={battleId} 
                  canPost={!!user && (isParticipant || isHost || battle.visibility === "public")} 
                  isHost={isHost} 
                />
              </TabsContent>
              <TabsContent value="activity" className="mt-4 focus-visible:outline-none">
                <LiveActivityFeed events={(eventsQ.data?.events ?? []) as any} profiles={(eventsQ.data?.profiles ?? []) as any} />
              </TabsContent>
              <TabsContent value="timeline" className="mt-4 focus-visible:outline-none">
                <BattleTimeline events={(eventsQ.data?.events ?? []) as any} />
              </TabsContent>
            </Tabs>
          </div>
          {!isLobby && <RulesPanel battle={battle} />}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Arena Match?"
        description="All competitors will be ejected and the event will be permanently terminated. HIVE Ratings will not be affected."
        confirmLabel="Terminate Arena"
        destructive
        loading={cancelling}
        onConfirm={doCancel}
      />
    </div>
  );
}
