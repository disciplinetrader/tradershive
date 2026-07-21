import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Live-updating countdown pill. Ticks every second. */
export function CountdownPill({
  target,
  label,
  className,
  compact,
}: {
  target: string | Date | undefined | null;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ts = target ? new Date(target).getTime() : 0;
  const diff = Math.max(0, ts - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const ended = ts > 0 && diff === 0;
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-xs tabular-nums",
        ended && "text-muted-foreground",
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      {label ? <span className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span> : null}
      <span>{ended ? "Ended" : parts}</span>
      {compact ? null : null}
    </div>
  );
}
