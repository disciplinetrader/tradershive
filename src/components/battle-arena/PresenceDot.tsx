import { cn } from "@/lib/utils";

export type PresenceStatus = "trading" | "watching" | "idle" | "disconnected" | "finished";

const styles: Record<PresenceStatus, { color: string; label: string; pulse?: boolean }> = {
  trading:      { color: "bg-emerald-500", label: "Trading",       pulse: true },
  watching:     { color: "bg-blue-500",    label: "Watching" },
  idle:         { color: "bg-amber-500",   label: "Idle" },
  disconnected: { color: "bg-slate-400",   label: "Disconnected" },
  finished:     { color: "bg-purple-500",  label: "Finished" },
};

export function PresenceDot({ status, showLabel = false, className }: { status?: PresenceStatus | null; showLabel?: boolean; className?: string }) {
  const s = styles[(status ?? "disconnected") as PresenceStatus] ?? styles.disconnected;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("inline-block h-2 w-2 rounded-full", s.color, s.pulse && "animate-pulse ring-2 ring-emerald-500/25")} />
      {showLabel && <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>}
    </span>
  );
}
