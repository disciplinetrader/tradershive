/**
 * Compact badge showing the FX session active at a given timestamp.
 * Used inside positions/history rows and the post-trade summary.
 */
import { Badge } from "@/components/ui/badge";
import { detectSession } from "@/lib/paper-trading/session";
import { cn } from "@/lib/utils";

export function SessionBadge({ at, className }: { at: string | Date | number; className?: string }) {
  const s = detectSession(at);
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 gap-1 px-1.5 text-[10px] font-medium uppercase tracking-wider",
        s.overlap && "border-primary/50 bg-primary/10 text-primary",
        s.primary === "off_hours" && "text-muted-foreground",
        className,
      )}
      title={s.label}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full",
        s.primary === "off_hours" ? "bg-muted-foreground" : "bg-primary")} />
      {s.label}
    </Badge>
  );
}
