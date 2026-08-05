import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Trophy, Users, MessageSquare, ShieldAlert,
  Activity, Info, Target, Timer, Signal, SignalLow, User, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveArena } from "./useActiveArena";
import { usePaper } from "@/components/paper-trading/context";
import { BattleChat } from "./BattleChat";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { ParticipantsList } from "./ParticipantsList";
import { RulesPanel } from "./RulesPanel";
import { LiveActivityFeed } from "./LiveActivityFeed";
import { CountdownTimer } from "./CountdownTimer";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBattleEvents, getBattleLiveStats } from "@/lib/battle-arena-live.functions";
import { supabase } from "@/integrations/supabase/client";

interface ArenaCommandRailProps {
  className?: string;
  onClose?: () => void;
}

export function ArenaCommandRail({ className, onClose }: ArenaCommandRailProps) {
  const isMobile = useIsMobile();
  const { accountId, account } = usePaper();
  const { data: arenaData, isLoading } = useActiveArena(accountId);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(360);
  const [activeTab, setActiveTab] = useState("status");

  // Persist width
  useEffect(() => {
    const saved = localStorage.getItem("th_arena_rail_width");
    if (saved) setWidth(parseInt(saved, 10));
  }, []);

  const saveWidth = (w: number) => {
    setWidth(w);
    localStorage.setItem("th_arena_rail_width", w.toString());
  };

  const fnEvents = useServerFn(listBattleEvents);
  const fnStats = useServerFn(getBattleLiveStats);

  const battle = arenaData?.battle;
  const battleId = battle?.id;

  const eventsQ = useQuery({
    queryKey: ["battle-events", battleId],
    queryFn: () => fnEvents({ data: { battleId: battleId!, limit: 50 } }),
    enabled: !!battleId,
  });

  const statsQ = useQuery({
    queryKey: ["battle-live-stats", battleId],
    queryFn: () => fnStats({ data: { battleId: battleId! } }),
    enabled: !!battleId,
    refetchInterval: 10000,
  });

  if (isLoading || !battle) return null;

  const isSpectator = !arenaData.isParticipant;

  return (
    <TooltipProvider>
      <div
        className={cn(
          "relative flex h-full flex-col border-l border-border/40 bg-background/95 backdrop-blur-xl transition-all duration-300",
          isCollapsed ? "w-14" : "",
          className
        )}
        style={{ width: isCollapsed ? undefined : width }}
      >
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -left-3 top-1/2 z-50 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background shadow-lg transition-transform hover:scale-110"
        >
          {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {isCollapsed ? (
          <CollapsedRail 
            battle={battle} 
            onExpand={() => setIsCollapsed(false)} 
            isSpectator={isSpectator}
          />
        ) : (
          <ExpandedRail
            battle={battle}
            stats={statsQ.data as any}
            events={eventsQ.data as any}
            isSpectator={isSpectator}
            isHost={arenaData.isHost}
            account={account}
            onClose={onClose}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function CollapsedRail({ battle, onExpand, isSpectator }: { 
  battle: any; 
  onExpand: () => void;
  isSpectator: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <RailIcon icon={Trophy} label="Arena Status" onClick={onExpand} active />
      <RailIcon icon={Users} label="Standings" onClick={onExpand} />
      <RailIcon icon={MessageSquare} label="Chat" onClick={onExpand} />
      <Separator className="w-8 opacity-40" />
      <RailIcon icon={ShieldAlert} label="Rules" onClick={onExpand} />
      <RailIcon icon={Signal} label="Connection" onClick={onExpand} />
    </div>
  );
}

function RailIcon({ icon: Icon, label, onClick, active }: { 
  icon: any; 
  label: string; 
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={cn(
            "h-10 w-10 rounded-xl",
            active ? "bg-primary/10 text-primary" : "text-muted-foreground"
          )}
        >
          <Icon className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function ExpandedRail({ battle, stats, events, isSpectator, isHost, account, onClose }: {
  battle: any;
  stats: any;
  events: any;
  isSpectator: boolean;
  isHost: boolean;
  account: any;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider">{battle.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-5 px-2 text-[10px] font-bold">
              {battle.status.toUpperCase()}
            </Badge>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={onClose}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Time Remaining</span>
            <div className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-primary" />
              <CountdownTimer to={battle.end_at} />
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Connection</span>
            <div className="flex items-center gap-1.5">
              <Signal className="h-3 w-3 text-success" />
              <span className="text-[10px] font-bold">STABLE</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="opacity-40" />

      {/* Personal Performance (if not spectator) */}
      {!isSpectator && account && (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">My Performance</span>
            <Badge className="bg-primary/20 text-primary hover:bg-primary/30">RANK #{stats?.rankings?.find((r: any) => r.user_id === account.user_id)?.rank || "--"}</Badge>
          </div>
          <div className="mb-2 text-[10px] text-muted-foreground italic">
            Placement determined by Return % &gt; Drawdown &gt; Breaches &gt; Target Time
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard 
              label="Return" 
              value={`${((account.balance / account.starting_balance - 1) * 100).toFixed(2)}%`} 
              trend={(account.balance > account.starting_balance) ? "up" : (account.balance < account.starting_balance) ? "down" : "neutral"} 
            />
            <MetricCard label="Equity" value={`$${account.equity.toLocaleString()}`} />
            <MetricCard label="Realized" value={`$${(account.balance - account.starting_balance).toLocaleString()}`} />
            <MetricCard 
              label="Drawdown" 
              value={`${(stats?.rankings?.find((r: any) => r.user_id === account.user_id)?.max_drawdown || 0).toFixed(2)}%`} 
              trend="neutral" 
            />
          </div>
        </div>
      )}

      <Separator className="opacity-40" />

      {/* Main Content Tabs */}
      <Tabs defaultValue="standings" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-4 grid grid-cols-4 bg-muted/40 p-1 h-10 rounded-xl">
          <TabsTrigger value="standings" className="text-[10px] font-bold uppercase">Standings</TabsTrigger>
          <TabsTrigger value="chat" className="text-[10px] font-bold uppercase">Conversation</TabsTrigger>
          <TabsTrigger value="rules" className="text-[10px] font-bold uppercase">Rules</TabsTrigger>
          <TabsTrigger value="feed" className="text-[10px] font-bold uppercase">Feed</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden p-4">
          <TabsContent value="standings" className="h-full mt-0 focus-visible:outline-none overflow-y-auto">
             <LiveLeaderboard 
               rankings={stats?.rankings ?? []} 
               profiles={stats?.profiles ?? []}
               presence={[]}
               winCondition={battle.win_condition}
               compact
             />
          </TabsContent>
          <TabsContent value="chat" className="h-full mt-0 focus-visible:outline-none">
            <BattleChat battleId={battle.id} canPost={!isSpectator} isHost={isHost} />
          </TabsContent>
          <TabsContent value="rules" className="h-full mt-0 focus-visible:outline-none overflow-y-auto">
            <RulesPanel battle={battle} />
          </TabsContent>
          <TabsContent value="feed" className="h-full mt-0 focus-visible:outline-none overflow-y-auto">
            <LiveActivityFeed events={events?.events ?? []} profiles={events?.profiles ?? []} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Rule Warning (Mocked for now) */}
      {!isSpectator && account && (
        <RuleWarning 
          account={account} 
          battle={battle} 
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, trend }: { label: string; value: string; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="flex flex-col rounded-xl border border-border/40 bg-card/40 p-2.5">
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn(
        "text-xs font-black tabular-nums",
        trend === "up" ? "text-success" : trend === "down" ? "text-danger" : ""
      )}>
        {value}
      </span>
    </div>
  );
}

function RuleWarning({ account, battle }: { account: any; battle: any }) {
  // Use authoritative values from account/battle
  const dailyLoss = account.daily_loss_pct || 0;
  const maxDailyLoss = battle.max_daily_loss_pct || 5;
  const drawdown = account.drawdown_pct || 0;
  const maxDrawdown = battle.max_drawdown_pct || 10;
  
  const isApproachingDaily = dailyLoss > maxDailyLoss * 0.8;
  const isApproachingDD = drawdown > maxDrawdown * 0.8;
  
  if (!isApproachingDaily && !isApproachingDD) return null;
  
  return (
    <div className="border-t border-border/40 bg-warning/5 p-3">
      <div className="flex items-center gap-2 text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-[10px] font-bold leading-tight uppercase">
          {isApproachingDaily && `Approaching daily loss limit (${dailyLoss.toFixed(2)}% / ${maxDailyLoss}%)`}
          {isApproachingDaily && isApproachingDD && " | "}
          {isApproachingDD && `Approaching drawdown limit (${drawdown.toFixed(2)}% / ${maxDrawdown}%)`}
        </span>
      </div>
    </div>
  );
}
