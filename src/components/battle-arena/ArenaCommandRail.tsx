import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Trophy, Users, MessageSquare, ShieldAlert,
  Activity, Info, Target, Timer, Signal, SignalLow, User, AlertTriangle, Music,
  LogOut
} from "lucide-react";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
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
import { MusicPlayer } from "@/components/audio/MusicPlayer";
import { useAuth } from "@/hooks/use-auth";

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
    refetchInterval: 30000, // Increased manual poll
  });

  // No realtime subscription here on purpose. The rail reads queries that
  // `useBattleRealtime` (owned by the battle route) keeps fresh — chat,
  // rankings, events. Owning a channel made the rail unsafe to mount twice:
  // both instances joined the same `arena-rail-<id>` topic, and either one
  // unmounting removed it out from under the other.
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
      <RailIcon icon={Music} label="Music" onClick={onExpand} />
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
      {/* 1. Battle Name + Leave/Reset */}
      <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/10">
        <div className="flex items-center gap-2 overflow-hidden">
          <Trophy className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider truncate">{battle.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-danger" onClick={onClose} title="Leave Arena">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5">
          {/* 2. Time Remaining */}
          <div className="p-4 bg-muted/20">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Time Remaining</span>
                <Signal className="h-3 w-3 text-success" />
              </div>
              <div className="flex items-center gap-3 bg-background/50 rounded-xl border border-border/40 p-3">
                <Timer className="h-4 w-4 text-primary" />
                <div className="font-mono text-xl font-black text-success">
                  <CountdownTimer to={battle.end_at} />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Battle Rules (Collapsible) */}
          <div className="border-y border-border/40">
            <Accordion type="single" collapsible defaultValue="rules">
              <AccordionItem value="rules" className="border-none">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 group">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Arena Rules</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <RulesPanel battle={battle} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* 4. Leaderboard (Top 3) */}
          <div className="p-4 border-b border-border/40">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Leaderboard</span>
              <Badge className="bg-primary/20 text-primary hover:bg-primary/30 text-[9px] px-1.5 py-0">TOP 3</Badge>
            </div>
            <LiveLeaderboard 
              rankings={stats?.rankings?.slice(0, 3) ?? []} 
              profiles={stats?.profiles ?? []}
              presence={[]}
              winCondition={battle.win_condition}
              compact
            />
            <Button variant="link" className="h-auto p-0 mt-3 text-[10px] font-bold uppercase tracking-widest text-primary/70 hover:text-primary" onClick={() => {}}>
              View Full Standings <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>

          {/* 5. Participants */}
          <div className="p-4 border-b border-border/40">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Participants ({stats?.rankings?.length ?? 0}/{battle.max_participants})
              </span>
            </div>
            <ParticipantsList 
              participants={battle.participants ?? []} 
              profiles={stats?.profiles ?? []} 
              hostId={battle.created_by} 
            />
          </div>

          {/* 6. Chat (Collapsible/Unified) */}
          <div className="border-b border-border/40">
            <Accordion type="single" collapsible defaultValue="chat">
              <AccordionItem value="chat" className="border-none">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 group">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Arena Chat</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <div className="h-[280px]">
                    <BattleChat battleId={battle.id} canPost={!isSpectator} isHost={isHost} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Music Player at bottom of rail */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Music className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Arena Ambience</span>
            </div>
            <MusicPlayer embedded />
          </div>
        </div>
      </ScrollArea>

      {/* Rule Warning stays at bottom */}
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
