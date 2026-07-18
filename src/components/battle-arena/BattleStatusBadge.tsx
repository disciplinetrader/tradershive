import { cn } from "@/lib/utils";
import { STATUS_STYLES, type BattleStatus } from "@/lib/battle-arena/constants";

export function BattleStatusBadge({ status, className }: { status: BattleStatus; className?: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.upcoming;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", s.className, className)}>
      {s.label}
    </span>
  );
}
