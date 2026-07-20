import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Clock, Star } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { ReplaySession } from "@/lib/replay/types";

export function LibraryCard({ session }: { session: ReplaySession }) {
  return (
    <Link to="/replay/session" search={{ id: session.id } as any}>
      <motion.div whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
        <GlassCard interactive className="p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="truncate font-semibold text-sm">{session.title}</div>
              <div className="text-[11px] text-muted-foreground">
                {session.market} · {session.symbol} · {session.timeframe}
              </div>
            </div>
            {session.is_favorite ? <Star className="h-3.5 w-3.5 text-warning fill-warning" /> : null}
          </div>
          <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${session.completion_pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="capitalize">{session.status}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.round((session.duration_seconds ?? 0) / 60)}m
            </span>
          </div>
        </GlassCard>
      </motion.div>
    </Link>
  );
}
