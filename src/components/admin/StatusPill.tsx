import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted";

const TONE: Record<Tone, string> = {
  default: "bg-surface text-foreground border-border/60",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  info: "bg-primary/10 text-primary border-primary/30",
  muted: "bg-muted/10 text-muted-foreground border-border/40",
};

const STATUS_TONE: Record<string, Tone> = {
  open: "info",
  new: "info",
  triaged: "warning",
  in_progress: "warning",
  planned: "warning",
  considering: "info",
  shipped: "success",
  resolved: "success",
  closed: "muted",
  declined: "muted",
  duplicate: "muted",
  spam: "danger",
  active: "success",
  trialing: "info",
  past_due: "warning",
  canceled: "muted",
  expired: "muted",
  paused: "warning",
  lifetime: "success",
  operational: "success",
  degraded: "warning",
  error: "danger",
  critical: "danger",
  info: "info",
  warning: "warning",
  low: "muted",
  medium: "warning",
  high: "danger",
  urgent: "danger",
};

export function StatusPill({ value, tone }: { value: string; tone?: Tone }) {
  const t = tone ?? STATUS_TONE[value?.toLowerCase()] ?? "default";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        TONE[t],
      )}
    >
      {value?.replaceAll("_", " ")}
    </span>
  );
}
