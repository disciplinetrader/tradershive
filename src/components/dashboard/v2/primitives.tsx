/**
 * Dashboard design language (v2).
 *
 * One card shell, one KPI, one sidebar card, one quick action, one typography
 * scale. Every dashboard section composes these — no bespoke styling per
 * section. Soft shadows and whitespace instead of heavy outlines.
 */

import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/* --------------------------------------------------------------- Typography */

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("text-fluid-3xl font-bold tracking-tight", className)}>{children}</h1>;
}

/** Section labels read as editorial eyebrows, not as shouty headings. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("eyebrow", className)}>{children}</h2>;
}

export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

/* -------------------------------------------------------------------- Panel */

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes inner padding for tables and charts. */
  flush?: boolean;
  tone?: "default" | "hero";
}

/**
 * The single card shell used across the dashboard. Depth comes from the
 * layered `--elev-*` tokens plus a 1px edge-light — never from heavy
 * outlines or saturated fills.
 */
export function Panel({ className, flush, tone = "default", ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "premium-card transition-all duration-300",
        tone === "hero" && "accent-wash border-primary/10 shadow-xl shadow-primary/5",
        !flush && "p-6 sm:p-7",
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- KPI card */

export type KpiTone = "up" | "down" | "flat";

export function KpiCard({
  label,
  value,
  hint,
  tone = "flat",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
}) {
  return (
    <Panel className="premium-card-interactive p-[var(--gutter-sm)]">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-[clamp(1.25rem,1.1rem+0.5vw,1.6rem)] font-semibold tabular-nums tracking-[-0.03em]",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

/* ------------------------------------------------------------- Sidebar card */

export function SidebarCard({
  icon: Icon,
  title,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-3 p-[var(--gutter-sm)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <SectionTitle className="truncate">{title}</SectionTitle>
      </div>
      <div className="min-w-0 text-sm">{children}</div>
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </Panel>
  );
}

/* --------------------------------------------------------- Quick action card */

export function QuickActionCard({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="premium-card premium-card-interactive sheen group flex items-center gap-3 p-[var(--gutter-sm)]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors duration-300 group-hover:bg-primary/18">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-[-0.01em]">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}
