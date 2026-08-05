import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Plus, Play, Info, MoreVertical, ExternalLink, Calendar, Target, Swords, Briefcase, PlayCircle } from "lucide-react";
import { useSessionContext } from "@/hooks/use-session-context";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function SessionManagement() {
  const { accounts, replays, props, battles, selectContext } = useSessionContext();
  const [search, setSearch] = useMemo(() => {
    // We can't use useState inside useMemo, this is just to show we need search state
    return ["", (v: string) => {}];
  }, []);
  
  // Real implementation needs local state
  return <SessionManagementContent />;
}

import { useState } from "react";

function SessionManagementContent() {
  const { accounts, replays, props, battles, selectContext } = useSessionContext();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "paper" | "replay" | "prop" | "arena">("all");

  const allSessions = useMemo(() => {
    const list: any[] = [];
    
    accounts.forEach(a => list.push({ ...a, type: "paper", label: a.name, icon: Briefcase, status: "active" }));
    replays.forEach(r => list.push({ ...r, type: "replay", label: r.symbol || "Replay", icon: PlayCircle, status: r.status }));
    props.forEach(p => list.push({ ...p, type: "prop", label: p.name || "Challenge", icon: Target, status: p.status }));
    battles.forEach((b: any) => list.push({ ...b, type: "arena", label: b.battle_name || "Battle", icon: Swords, status: b.status }));
    
    return list.sort((a, b) => new Date(b.created_at || b.opened_at).getTime() - new Date(a.created_at || a.opened_at).getTime());
  }, [accounts, replays, props, battles]);

  const filtered = allSessions.filter(s => {
    const matchesSearch = s.label.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || s.type === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search symbols, names, or accounts..." 
            className="pl-9 bg-card/50 border-border/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {(["all", "paper", "replay", "prop", "arena"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              className="h-8 rounded-lg text-xs capitalize whitespace-nowrap"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All Sessions" : f + "s"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <SessionItem key={`${s.type}-${s.id}`} session={s} onSelect={selectContext} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="text-muted-foreground">No sessions found matching your criteria.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionItem({ session, onSelect }: { session: any, onSelect: any }) {
  const Icon = session.icon;
  const date = new Date(session.created_at || session.opened_at).toLocaleDateString();
  
  const statusColors = {
    active: "bg-success/10 text-success border-success/20",
    completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    failed: "bg-danger/10 text-danger border-danger/20",
    archived: "bg-muted text-muted-foreground border-border",
  };

  const handleResume = () => {
    onSelect(session.type, session.id, session.label);
    // Navigation logic based on type
  };

  return (
    <GlassCard className="group p-5 hover:border-primary/30 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm line-clamp-1">{session.label}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{session.type}</span>
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="text-[10px] text-muted-foreground">{date}</span>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to={`/dashboard/sessions/${session.type}/${session.id}`} className="cursor-pointer">
                <Info className="mr-2 h-4 w-4" />
                View Analytics
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleResume} className="cursor-pointer">
              <Play className="mr-2 h-4 w-4" />
              Resume Session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger cursor-pointer">
              Archive Session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", (statusColors as any)[session.status] || statusColors.archived)}>
          {session.status || "Active"}
        </Badge>
        
        <div className="flex items-center gap-2">
           <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-xs text-muted-foreground hover:text-primary"
            asChild
           >
            <Link to={`/dashboard/sessions/${session.type}/${session.id}`}>
              Details
            </Link>
          </Button>
          <Button 
            size="sm" 
            className="h-8 rounded-lg text-xs gradient-primary px-4"
            onClick={handleResume}
          >
            Resume
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
