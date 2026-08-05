import { useState, useEffect } from "react";
import { PageTitle } from "@/components/dashboard/v2/primitives";
import { DashboardSubNav } from "@/components/dashboard/v2/DashboardSubNav";
import { MarketStatusBadge } from "@/components/market/MarketStatusBadge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useSessionContext } from "@/hooks/use-session-context";
import { Briefcase, PlayCircle, Trophy, Swords, Globe } from "lucide-react";

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader() {
  const { profile, user } = useAuth();
  const { context, selectContext, accounts, replays, props, battles, isLoading } = useSessionContext();
  const [internalValue, setInternalValue] = useState(context.id ? `${context.type}:${context.id}` : "");

  useEffect(() => {
    if (context.id) {
      setInternalValue(`${context.type}:${context.id}`);
    } else if (!isLoading && accounts.length > 0) {
      // Auto-select first account if nothing selected
      const first = accounts[0];
      selectContext("paper", first.id, first.name);
      setInternalValue(`paper:${first.id}`);
    }
  }, [context.type, context.id, accounts, isLoading, selectContext]);

  const name = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Trader";
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const handleValueChange = (val: string) => {
    const [type, id] = val.split(":");
    let label = "";
    
    if (type === "paper") label = accounts.find(a => a.id === id)?.name || "Paper Account";
    else if (type === "replay") label = replays.find(r => r.id === id)?.symbol || "Replay Session";
    else if (type === "prop") label = (props.find(p => p.id === id) as any)?.name || "Prop Challenge";
    else if (type === "arena") label = (battles.find(b => b.id === id) as any)?.battle_name || "Arena Match";
    
    setInternalValue(val);
    selectContext(type as any, id, label);
  };

  return (
    <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0 space-y-3">
        <div>
          <p className="eyebrow mb-1 text-primary">{dateStr}</p>
          <PageTitle>
            {greeting()}, <span className="text-foreground/90">{name}</span>
          </PageTitle>
        </div>
        <DashboardSubNav />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select value={currentValue} onValueChange={handleValueChange}>
          <SelectTrigger className="h-10 w-[240px] rounded-xl border-border/50 bg-card/50 text-sm backdrop-blur-sm shadow-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <SelectValue placeholder="Select context" />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {accounts.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-2 text-muted-foreground py-2">
                  <Briefcase className="h-3.5 w-3.5" />
                  Paper Accounts
                </SelectLabel>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={`paper:${a.id}`}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            
            {props.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-2 text-muted-foreground py-2">
                    <Trophy className="h-3.5 w-3.5" />
                    Prop Challenges
                  </SelectLabel>
                  {props.map((p) => (
                    <SelectItem key={p.id} value={`prop:${p.id}`}>
                      {p.name || `Challenge ${p.id.slice(0, 4)}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}

            {battles.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-2 text-muted-foreground py-2">
                    <Swords className="h-3.5 w-3.5" />
                    Arena Matches
                  </SelectLabel>
                  {battles.map((b: any) => (
                    <SelectItem key={b.id} value={`arena:${b.id}`}>
                      {b.battle_name || `Match ${b.id.slice(0, 4)}`}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}

            {replays.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-2 text-muted-foreground py-2">
                    <PlayCircle className="h-3.5 w-3.5" />
                    Replay Sessions
                  </SelectLabel>
                  {replays.map((r) => (
                    <SelectItem key={r.id} value={`replay:${r.id}`}>
                      {r.symbol || "Session"} ({new Date(r.created_at).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
        <MarketStatusBadge market="forex" className="h-10 rounded-xl px-4" />
      </div>
    </header>
  );
}
