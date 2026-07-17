import { Link } from "@tanstack/react-router";
import * as icons from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { Playbook } from "@/lib/strategy/types";

export function PlaybookCard({ pb }: { pb: Playbook & { strategies?: { name?: string } | null } }) {
  const Icon = ((icons as any)[pb.icon] ?? icons.BookMarked) as React.ComponentType<{ className?: string }>;
  return (
    <Link to="/strategies/playbooks" search={{ id: pb.id } as any}>
      <GlassCard interactive className="p-4 space-y-2 h-full">
        <div className="flex items-center gap-2">
          <div className="grid place-items-center rounded-xl p-2" style={{ background: `${pb.color}22`, color: pb.color }}><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{pb.name}</div>
            {pb.strategies?.name ? <div className="text-[10px] text-muted-foreground">Linked to {pb.strategies.name}</div> : null}
          </div>
        </div>
        {pb.overview ? <p className="line-clamp-2 text-xs text-muted-foreground">{pb.overview}</p> : null}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{pb.rules.length} rules</span>
          <span>{pb.checklist.length} checks</span>
          <span>{pb.mistakes.length} mistakes</span>
        </div>
      </GlassCard>
    </Link>
  );
}
