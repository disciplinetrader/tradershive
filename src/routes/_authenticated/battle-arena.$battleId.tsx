import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  getBattle, joinBattle, leaveBattle, cancelBattle, finalizeBattle,
  setParticipantReady
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
import { LineChart, LogIn, LogOut, Trash2, Copy, Play, Eye, ShieldCheck, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { routeBoundaries } from "@/lib/route-boundaries";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PaperTradingProvider } from "@/components/paper-trading/context";
import { TradingWorkspace } from "@/components/trading/TradingWorkspace";
import { ArenaCommandRail } from "@/components/battle-arena/ArenaCommandRail";


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

  const battleQ = useQuery({
    queryKey: ["battle", battleId],
    queryFn: () => fnGet({ data: { id: battleId } }),
    refetchInterval: (data) => {
      const status = data?.battle?.status;
      if (status === 'countdown' || status === 'filling' || status === 'open') return 3000;
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

  // Realtime subscriptions scoped to this battle only.
  useEffect(() => {
    const ch = supabase.channel(`battle-detail-${battleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_rankings", filter: `battle_id=eq.${battleId}` }, () => {
        qc.invalidateQueries({ queryKey: ["battle", battleId] });
        qc.invalidateQueries({ queryKey: ["battle-live-stats", battleId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_participants", filter: `battle_id=eq.${battleId}` }, () => {
        qc.invalidateQueries({ queryKey: ["battle", battleId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "battles", filter: `id=eq.${battleId}` }, () => {
        qc.invalidateQueries({ queryKey: ["battle", battleId] });
        qc.invalidateQueries({ queryKey: ["battle-live-stats", battleId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "battle_events", filter: `battle_id=eq.${battleId}` }, () => {
        qc.invalidateQueries({ queryKey: ["battle-events", battleId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_statistics_live", filter: `battle_id=eq.${battleId}` }, () => {
        qc.invalidateQueries({ queryKey: ["battle-live-stats", battleId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_presence", filter: `battle_id=eq.${battleId}` }, () => {
        qc.invalidateQueries({ queryKey: ["battle-presence", battleId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [battleId, qc]);

  // Presence heartbeat.
  const battle = battleQ.data?.battle;
  const isParticipant = battleQ.data?.isParticipant ?? false;
  const isHost = battleQ.data?.isHost ?? false;
  const role = isHost ? "host" : isParticipant ? "competitor" : "spectator";

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
      if (!cancelled) { setOpenByUser(opens); setLastTradeByUser(last); }
    }
    load();
    const ch = supabase.channel(`battle-trades-${battleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_trades", filter: `battle_id=eq.${battleId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [battleId]);

  if (battleQ.isLoading) return <div className="glass h-64 animate-pulse rounded-2xl" />;
  if (!battleQ.data || !battle) return <div className="text-sm text-muted-foreground p-8 text-center">Arena match not found.</div>;

  const { participants = [], rankings = [], results = [], profiles = [] } = (battleQ.data as any) || {};


  const canJoin = !isParticipant && battle?.visibility === "public" && ["draft", "upcoming", "open", "filling"].includes(battle?.status || "") && participants.length < (battle?.max_participants || 0);
  const canLeave = isParticipant && ["draft", "upcoming", "open", "filling", "ready"].includes(battle?.status || "");
  const canCancel = isHost && ["draft", "upcoming", "open", "filling", "ready", "countdown"].includes(battle?.status || "");
  const canFinalize = isHost && battle?.status === "live";

  const doJoin = async () => { try { await fnJoin({ data: { battleId } }); toast.success("Joined!"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message ?? "Failed"); } };
  const doLeave = async () => { try { await fnLeave({ data: { battleId } }); toast.success("Left"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message ?? "Failed"); } };
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

  return (
    <div className={cn("space-y-6 animate-in fade-in duration-500", battle.status === 'countdown' && "animate-pulse")}>
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
          {canJoin && <Button size="sm" onClick={doJoin} className="font-bold rounded-xl shadow-lg shadow-primary/20"><LogIn className="mr-1.5 h-4 w-4" />Join Arena</Button>}
          {canLeave && <Button size="sm" variant="outline" onClick={doLeave} className="font-bold rounded-xl border-border/60"><LogOut className="mr-1.5 h-4 w-4" />Leave</Button>}
          {canCancel && <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)} className="font-bold rounded-xl"><Trash2 className="mr-1.5 h-4 w-4" />Cancel</Button>}
          {canFinalize && <Button size="sm" variant="secondary" onClick={doFinalize} className="font-bold rounded-xl"><Play className="mr-1.5 h-4 w-4" />Finalize</Button>}
          {isParticipant && battle.status === "live" && (
            <Button size="sm" asChild className="font-bold rounded-xl shadow-lg shadow-primary/20">
              <Link to="/trading"><LineChart className="mr-1.5 h-4 w-4" />Trade Now</Link>
            </Button>
          )}
        </div>

        {battle.visibility === "private" && battle.invite_code && isHost && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1 text-xs">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invite:</span>
            <code className="rounded bg-background px-2 py-0.5 font-mono font-bold">{battle.invite_code}</code>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg" onClick={() => { navigator.clipboard.writeText(battle.invite_code ?? ""); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button>
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
