/**
 * Trade Story primitives — thin borders, compact spacing, tabular numbers.
 * Deliberately plain surfaces (no glass, no gradients): this is a review
 * workstation, not a marketing page.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/lib/journal/story";

export function StorySection({
  id,
  title,
  icon,
  subtitle,
  actions,
  children,
  collapsible = true,
  storageKey,
  defaultOpen = true,
  className,
}: {
  id?: string;
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  storageKey?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Collapsed state survives reloads so long reviews keep their shape.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "0") setOpen(false);
    if (raw === "1") setOpen(true);
  }, [storageKey]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (storageKey && typeof window !== "undefined") window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  };

  return (
    <section id={id} className={cn("rounded-lg border border-border/60 bg-card/30", className)}>
      <header className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="rounded p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
          </button>
        ) : null}
      </header>
      {open ? <div className="p-3">{children}</div> : null}
    </section>
  );
}

export function Metric({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "up" | "down";
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Compact prompt shown instead of an empty card when data is absent. */
export function MissingData({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground">
      <span>{label}</span>
      {action}
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  followed: "border-success/40 bg-success/10 text-success",
  minor: "border-warning/40 bg-warning/10 text-warning",
  major: "border-danger/40 bg-danger/10 text-danger",
  missing: "border-border/60 bg-muted/20 text-muted-foreground",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  followed: "Followed plan",
  minor: "Minor deviation",
  major: "Major deviation",
  missing: "Missing data",
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium", VERDICT_STYLE[verdict])}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function Bar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "up" | "down" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "primary" && "bg-primary",
          tone === "up" && "bg-success",
          tone === "down" && "bg-danger",
        )}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
