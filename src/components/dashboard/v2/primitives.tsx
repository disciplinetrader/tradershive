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
  return (
    <h1 className={cn("text-2xl font-bold tracking-tight sm:text-3xl", className)}>{children}</h1>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-sm font-semibold tracking-tight", className)}>{children}</h2>;
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

/** The single card shell used across the dashboard. */
export function Panel({ className, flush, tone = "default", ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.25)]",
        tone === "hero"
          ? "bg-gradient-to-br from-primary/10 via-card to-card ring-1 ring-primary/15"
          : "bg-card ring-1 ring-border/40",
        !flush && "p-5 sm:p-6",
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
    <Panel className="p-4 sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums sm:text-2xl",
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
    <Panel className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
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
      className="group flex items-center gap-3 rounded-3xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-border/40 transition hover:ring-primary/40 sm:p-5"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}
