import { useEffect, useState } from "react";
import { marketData } from "@/lib/market-data/engine";
import { DEFAULT_SESSIONS } from "@/lib/market-data/sessions";
import { cn } from "@/lib/utils";
import type { SessionWindow } from "@/lib/market-data/types";

export function SessionsBar({ className }: { className?: string }) {
  const [active, setActive] = useState<SessionWindow[]>([]);
  const [next, setNext] = useState<{ session: SessionWindow; opensInMinutes: number } | null>(null);
  useEffect(() => {
    marketData.init();
    const tick = () => { setActive(marketData.activeSessions()); setNext(marketData.nextSession()); };
    tick(); const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {DEFAULT_SESSIONS.map((s) => {
        const on = active.find((a) => a.code === s.code);
        return (
          <div key={s.code} className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium",
            on ? "bg-primary/10 text-primary" : "bg-card/40 text-muted-foreground",
          )}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color ?? "#888" }} />
            {s.name}
            {on && <span className="ml-1 text-[10px] uppercase tracking-wide">LIVE</span>}
          </div>
        );
      })}
      {next && (
        <div className="text-[11px] text-muted-foreground">
          Next: <span className="text-foreground/80">{next.session.name}</span> in {Math.floor(next.opensInMinutes / 60)}h {next.opensInMinutes % 60}m
        </div>
      )}
    </div>
  );
}
