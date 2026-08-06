import { useBattles } from "@/lib/battle-arena/hooks/use-battle-queries";
import { BattleCard } from "../BattleCard";
import { Search, Filter, Plus, Zap, Target, Timer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "@tanstack/react-router";

export function BattleList({ scope }: { scope: string }) {
  const { data: battles } = useBattles(scope);
  const [search, setSearch] = useState("");

  const filtered = battles.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:max-w-md group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Search matches..." 
            className="pl-9 bg-card/40 border-border/60 rounded-2xl focus:ring-primary/20 h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl border-border/60 bg-card/40">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!filtered.length ? (
        <div className="flex flex-col items-center gap-4 rounded-[40px] border border-dashed border-border/60 bg-card/10 px-6 py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-muted/20 text-muted-foreground/40">
            <Zap className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight">No battles found</h3>
            <p className="mt-1 text-sm text-muted-foreground font-medium">Try a different search or create your own arena.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          {filtered.map(b => (
            <BattleCard key={b.id} battle={b} />
          ))}
        </div>
      )}
    </div>
  );
}
