import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { getBattle, joinBattle, leaveBattle, cancelBattle, finalizeBattle } from "@/lib/battle-arena.functions";
import { BattleStatusBadge } from "@/components/battle-arena/BattleStatusBadge";
import { CountdownTimer } from "@/components/battle-arena/CountdownTimer";
import { RulesPanel } from "@/components/battle-arena/RulesPanel";
import { LiveLeaderboard } from "@/components/battle-arena/LiveLeaderboard";
import { ParticipantsList } from "@/components/battle-arena/ParticipantsList";
import { BattleResultsView } from "@/components/battle-arena/BattleResultsView";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LineChart, LogIn, LogOut, Trash2, Copy, Play } from "lucide-react";
import { findMarket, findWinCondition, findBattleType } from "@/lib/battle-arena/constants";

export const Route = createFileRoute("/_authenticated/battle-arena/$battleId")({
  component: BattleDetail,
});

function BattleDetail() {
  const { battleId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fnGet = useServerFn(getBattle);
  const fnJoin = useServerFn(joinBattle);
  const fnLeave = useServerFn(leaveBattle);
  const fnCancel = useServerFn(cancelBattle);
  const fnFinalize = useServerFn(finalizeBattle);

  const q = useQuery({
    queryKey: ["battle", battleId],
    queryFn: () => fnGet({ data: { id: battleId } }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const ch = supabase.channel(`battle-${battleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_rankings", filter: `battle_id=eq.${battleId}` }, () => qc.invalidateQueries({ queryKey: ["battle", battleId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_participants", filter: `battle_id=eq.${battleId}` }, () => qc.invalidateQueries({ queryKey: ["battle", battleId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "battles", filter: `id=eq.${battleId}` }, () => qc.invalidateQueries({ queryKey: ["battle", battleId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [battleId, qc]);

  if (q.isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!q.data) return <div className="text-sm text-muted-foreground">Battle not found.</div>;

  const { battle, participants, rankings, results, profiles, isHost, isParticipant } = q.data as any;
  const canJoin = !isParticipant && battle.visibility === "public" && ["draft", "upcoming"].includes(battle.status) && participants.length < battle.max_participants;
  const canLeave = isParticipant && ["draft", "upcoming"].includes(battle.status);
  const canCancel = isHost && ["draft", "upcoming"].includes(battle.status);
  const canFinalize = isHost && battle.status === "live";

  const doJoin = async () => {
    try { await fnJoin({ data: { battleId } }); toast.success("Joined!"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); }
    catch (e: any) { toast.error(e?.message ?? "Failed to join"); }
  };
  const doLeave = async () => {
    try { await fnLeave({ data: { battleId } }); toast.success("Left battle"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); }
    catch (e: any) { toast.error(e?.message ?? "Failed to leave"); }
  };
  const doCancel = async () => {
    if (!confirm("Cancel this battle for everyone?")) return;
    try { await fnCancel({ data: { battleId } }); toast.success("Cancelled"); navigate({ to: "/battle-arena" }); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };
  const doFinalize = async () => {
    try { await fnFinalize({ data: { battleId } }); toast.success("Finalized"); qc.invalidateQueries({ queryKey: ["battle", battleId] }); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const market = findMarket(battle.market);
  const wc = findWinCondition(battle.win_condition);
  const bt = findBattleType(battle.battle_type);

  return (
    <div className="space-y-5">
      <PageHeader
        title={battle.name}
        description={`${bt.label} · ${market.label} · ${wc.label}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BattleStatusBadge status={battle.status} />
            {battle.status === "upcoming" && <CountdownTimer to={battle.start_at} label="Starts in" />}
            {battle.status === "live" && <CountdownTimer to={battle.end_at} label="Ends in" />}
            {canJoin && <Button size="sm" onClick={doJoin}><LogIn className="mr-1.5 h-4 w-4" />Join battle</Button>}
            {canLeave && <Button size="sm" variant="outline" onClick={doLeave}><LogOut className="mr-1.5 h-4 w-4" />Leave</Button>}
            {canCancel && <Button size="sm" variant="destructive" onClick={doCancel}><Trash2 className="mr-1.5 h-4 w-4" />Cancel</Button>}
            {canFinalize && <Button size="sm" variant="secondary" onClick={doFinalize}><Play className="mr-1.5 h-4 w-4" />Finalize now</Button>}
            {isParticipant && battle.status === "live" && (
              <Button size="sm" variant="default" asChild>
                <Link to="/trading"><LineChart className="mr-1.5 h-4 w-4" />Open trading workspace</Link>
              </Button>
            )}
          </div>
        }
      />

      {battle.visibility === "private" && battle.invite_code && isHost && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <span className="text-muted-foreground">Invite code:</span>
          <code className="rounded bg-background px-2 py-1 font-mono text-base">{battle.invite_code}</code>
          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(battle.invite_code); toast.success("Copied"); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {battle.description && <p className="rounded-xl border border-border/60 bg-card/30 p-4 text-sm">{battle.description}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {battle.status === "completed"
            ? <BattleResultsView battle={battle} results={results} profiles={profiles} />
            : <LiveLeaderboard rankings={rankings} profiles={profiles} winCondition={battle.win_condition} />}
          <ParticipantsList participants={participants} profiles={profiles} hostId={battle.host_id} />
        </div>
        <RulesPanel battle={battle} />
      </div>
    </div>
  );
}
