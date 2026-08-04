/**
 * TradersHIVE Design System — shared layout primitives.
 *
 * One language for every page: surfaces, section headers, metrics and
 * progressive-disclosure blocks. Pages compose these instead of inventing
 * their own card/spacing/typography rules.
 *
 * Tokens only — no hardcoded colours.
 */

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Surface */

export type SurfaceTone = "default" | "muted" | "accent";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  /** Removes inner padding for full-bleed content (charts, tables). */
  flush?: boolean;
  interactive?: boolean;
}

const SURFACE_TONE: Record<SurfaceTone, string> = {
  default: "border-border/50 bg-card/60",
  muted: "border-border/40 bg-muted/20",
  accent: "border-primary/25 bg-gradient-to-br from-primary/8 via-card/70 to-card/60",
};

/** The single canonical card in the product. */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { className, tone = "default", flush, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border backdrop-blur-sm transition-colors",
        SURFACE_TONE[tone],
        !flush && "p-4",
        interactive && "hover:border-primary/40 hover:bg-card/80",
        className,
      )}
      {...props}
    />
  );
});

/* ------------------------------------------------------------ SectionHeader */

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

/** Consistent section label used above every dashboard block. */
export function SectionHeader({ title, description, actions, icon: Icon, className }: SectionHeaderProps) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <div className="min-w-0">
          <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {description ? (
            <p className="truncate text-[11px] text-muted-foreground/70">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- Metric */

export type MetricTone = "up" | "down" | "flat";

export interface MetricProps {
  label: string;
  value: string;
  sub?: string;
  tone?: MetricTone;
  /** `lg` for headline KPIs, `sm` for secondary rows. */
  size?: "sm" | "lg";
  className?: string;
}

/** The single canonical KPI readout. */
export function Metric({ label, value, sub, tone = "flat", size = "lg", className }: MetricProps) {
  return (
    <Surface className={cn(size === "sm" && "p-3", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "mt-1.5 font-bold tabular-nums",
          size === "lg" ? "text-2xl" : "text-lg",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
    </Surface>
  );
}

/* --------------------------------------------------------- DisclosureSection */

export interface DisclosureSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  /** Persisted across visits when provided. */
  storageKey?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Progressive disclosure — secondary detail stays out of the way until
 * the trader asks for it. Nothing is removed, only deferred.
 */
export function DisclosureSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  storageKey,
  children,
  className,
}: DisclosureSectionProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey || typeof window === "undefined") return defaultOpen;
    try {
      const v = window.localStorage.getItem(`ds:disclosure:${storageKey}`);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          window.localStorage.setItem(`ds:disclosure:${storageKey}`, next ? "1" : "0");
        } catch {
          /* storage unavailable */
        }
      }
      return next;
    });
  };

  return (
    <section className={cn("rounded-2xl border border-border/40 bg-card/30", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-card/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            {description ? (
              <span className="block truncate text-[11px] text-muted-foreground/70">{description}</span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-border/40 p-4">{children}</div> : null}
    </section>
  );
}

/** TradersHIVE Design System — implementation roadmap and audit results. */
export function DesignSystemAudit() {
  return (
    <div className="mx-auto max-w-4xl p-8 space-y-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">TradersHIVE UI/UX Audit & Roadmap</h1>
        <p className="text-muted-foreground leading-relaxed">
          The goal is to iteratively transform the application into a premium, modern trading platform by studying the strongest industry patterns (TradingView, FXReplay, TradeZella) while maintaining our uniquely professional identity.
        </p>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Surface tone="default" className="space-y-3">
          <h3 className="font-semibold text-foreground">Phase 1: Foundation (Current)</h3>
          <p className="text-sm text-muted-foreground">Standardizing spacing, typography, and premium tokens. Implementing ultra-rounded corners and deeper shadow systems.</p>
        </Surface>
        <Surface tone="muted" className="space-y-3 opacity-60">
          <h3 className="font-semibold text-foreground">Phase 2: Trading Workspace</h3>
          <p className="text-sm text-muted-foreground">Refining layout proportions, toolbars, and on-chart interaction depth to match TradingView standards.</p>
        </Surface>
      </div>

      <div className="prose prose-invert max-w-none prose-sm opacity-50 border-t border-border/40 pt-8">
        <h3 className="text-foreground">Competitive UX Inspiration</h3>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li><strong>TradeFXBook/TradeZella:</strong> Clean KPI hierarchy and learning-first journaling.</li>
          <li><strong>FXReplay:</strong> Terminal-grade playback controls and focus modes.</li>
          <li><strong>TradingView:</strong> Industry-standard charting interaction and object management.</li>
        </ul>
      </div>
    </div>
  );
}
