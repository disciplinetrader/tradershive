import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function RankTrend({ delta, className }: { delta: number | null | undefined; className?: string }) {
  if (delta == null) {
    return <span className={cn("inline-flex items-center text-[11px] text-muted-foreground", className)}>—</span>;
  }
  if (delta === 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-mono text-muted-foreground", className)}>
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold", up ? "text-emerald-400" : "text-rose-400", className)}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />} {Math.abs(delta)}
    </span>
  );
}
