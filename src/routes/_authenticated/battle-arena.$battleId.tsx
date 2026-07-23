import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getBattle, joinBattle, leaveBattle, cancelBattle, finalizeBattle } from "@/lib/battle-arena.functions";
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
import { LineChart, LogIn, LogOut, Trash2, Copy, Play, Eye } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { routeBoundaries } from "@/lib/route-boundaries";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/battle-arena/$battleId")({
  component: BattleDetail,
  ...routeBoundaries({
    label: "Battle",
    boundary: "battle_detail_route",
    backHref: "/battle-arena",
    backLabel: "Back to Battle Arena",
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
  const fnEvents = useServerFn(listBattleEvents);
  const fnStats = useServerFn(getBattleLiveStats);
  const fnHeartbeat = useServerFn(heartbeatPresence);
  const fnPresence = useServerFn(listBattlePresence);
  const fnLeavePres = useServerFn(leavePresence);

  const battleQ = useQuery({
    queryKey: ["battle", battleId],
    queryFn: () => fnGet({ data: { id: battleId } }),
    refetchInterval: 30000,
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
  const role = isHost ? "host" : isParticipant ? "participant" : "spectator";
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

  // Load open positions per user for leaderboard column.
  const [openByUser, setOpenByUser] = useState<Record<string, number>>({});
  const [lastTradeByUser, setLastTradeByUser] = useState<Record<string, string>>({});
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
  if (!battleQ.data) return <div className="text-sm text-muted-foreground">Battle not found.</div>;

  const { participants, rankings, results, profiles } = battleQ.data as any;
  const canJoin = !isParticipant && battle!.visibility === "public" && ["draft", "upcoming"].includes(battle!.status) && participants.length < battle!.max_participants;
  const canLeave = isParticipant && ["draft", "upcoming"].includes(battle!.status);
  const canCancel = isHost && ["draft", "upcoming"].includes(battle!.status);
  const canFinalize = isHost && battle!.status === "live";

  const doJoin = async () => { try { await fnJoin({ data: { battleId } }); toast.success("Joined!"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message ?? "Failed"); } };
  const doLeave = async () => { try { await fnLeave({ data: { battleId } }); toast.success("Left"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message ?? "Failed"); } };
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const doCancel = async () => {
    setCancelling(true);
    try {
      await fnCancel({ data: { battleId } });
      toast.success("Battle cancelled");
      setCancelOpen(false);
      navigate({ to: "/battle-arena" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to cancel battle");
    } finally {
      setCancelling(false);
    }
  };
  const doFinalize = async () => { try { await fnFinalize({ data: { battleId } }); toast.success("Finalized"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); } catch (e: any) { toast.error(e?.message); } };

  const onlineCount = (presenceQ.data ?? []).filter((p: any) => p.status !== "disconnected").length;

  return (
    <div className="space-y-5">
      <LiveBattleHeader
        battle={battle!}
        stats={statsQ.data as any}
        profiles={profiles}
        participantCount={participants.length}
      />

      <div className="flex flex-wrap items-center gap-2">
        {!isParticipant && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs">
            <Eye className="h-3.5 w-3.5" /> Spectator mode
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> {onlineCount} online
        </span>
        {canJoin && <Button size="sm" onClick={doJoin}><LogIn className="mr-1.5 h-4 w-4" />Join battle</Button>}
        {canLeave && <Button size="sm" variant="outline" onClick={doLeave}><LogOut className="mr-1.5 h-4 w-4" />Leave</Button>}
        {canCancel && <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}><Trash2 className="mr-1.5 h-4 w-4" />Cancel</Button>}
        {canFinalize && <Button size="sm" variant="secondary" onClick={doFinalize}><Play className="mr-1.5 h-4 w-4" />Finalize now</Button>}
        {isParticipant && battle!.status === "live" && (
          <Button size="sm" asChild><Link to="/trading"><LineChart className="mr-1.5 h-4 w-4" />Open trading workspace</Link></Button>
        )}
        {battle!.visibility === "private" && battle!.invite_code && isHost && (
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1 text-xs">
            <span className="text-muted-foreground">Invite:</span>
            <code className="rounded bg-background px-2 py-0.5 font-mono">{battle!.invite_code}</code>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(battle!.invite_code ?? ""); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button>
          </div>
        )}
      </div>

      {battle!.status === "completed" && (
        <BattleResultsView battle={battle!} results={results} profiles={profiles} />
      )}

      <LiveScoreboard stats={statsQ.data as any} profiles={profiles} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <LiveLeaderboard
            rankings={rankings}
            profiles={profiles}
            presence={(presenceQ.data ?? []) as any}
            winCondition={battle!.win_condition}
            openPositionsByUser={openByUser}
            lastTradeByUser={lastTradeByUser}
          />
          <ParticipantsList participants={participants} profiles={profiles} hostId={battle!.host_id} />
          <LiveStatistics stats={statsQ.data as any} />
        </div>

        <div className="space-y-4">
          <Tabs defaultValue="activity">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="activity" className="mt-3">
              <LiveActivityFeed events={(eventsQ.data?.events ?? []) as any} profiles={(eventsQ.data?.profiles ?? []) as any} />
            </TabsContent>
            <TabsContent value="chat" className="mt-3">
              <BattleChat battleId={battleId} canPost={!!user && (isParticipant || isHost || battle!.visibility === "public")} isHost={isHost} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-3">
              <BattleTimeline events={(eventsQ.data?.events ?? []) as any} />
            </TabsContent>
          </Tabs>
          <RulesPanel battle={battle!} />
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this battle?"
        description="All participants will be removed and the battle will end for everyone. This can't be undone."
        confirmLabel="Cancel battle"
        destructive
        loading={cancelling}
        onConfirm={doCancel}
      />
    </div>
  );
}
