/**
 * REPLAY STUDIO X — primitives (Phase 0).
 *
 * Small, dependency-light building blocks that every Replay surface uses.
 * They intentionally bypass the app-wide shadcn/glass components so the
 * studio can keep a distinct terminal identity (compact, hairline, flat).
 */
import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RxSize } from "@/lib/replay/design-tokens";

/* ── Toolbar shell ─────────────────────────────────────────── */
export function RxToolbar({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="toolbar"
      className={cn("rx-surface rx-line-b flex items-center gap-1 px-2", className)}
      style={{ height: "var(--rx-toolbar-h)" }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function RxDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rx-divider", className)} />;
}

/* ── Buttons ───────────────────────────────────────────────── */
type RxButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: RxSize;
  tone?: "default" | "accent";
  active?: boolean;
  icon?: boolean;
};

export const RxButton = React.forwardRef<HTMLButtonElement, RxButtonProps>(
  ({ size = "md", tone = "default", active, icon, className, type, ...rest }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      data-size={size}
      data-tone={tone}
      data-active={active ? "true" : undefined}
      data-variant={icon ? "icon" : undefined}
      className={cn("rx-btn", className)}
      {...rest}
    />
  ),
);
RxButton.displayName = "RxButton";

/** Icon button with a tooltip — the studio's default affordance. */
export function RxIconButton({
  label,
  side = "top",
  children,
  ...rest
}: RxButtonProps & { label: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <RxButton icon aria-label={label} {...rest}>
          {children}
        </RxButton>
      </TooltipTrigger>
      <TooltipContent side={side} className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/* ── Read-outs ─────────────────────────────────────────────── */
export function RxStat({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "long" | "short" | "dim";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center leading-none", className)}>
      <span className="rx-caps">{label}</span>
      <span
        className={cn(
          "rx-value truncate",
          tone === "long" && "rx-long",
          tone === "short" && "rx-short",
          tone === "dim" && "rx-dim",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Inline meta chip used in the top bar (symbol, timeframe, status). */
export function RxChip({
  children,
  tone = "default",
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "accent" | "long" | "short" }) {
  return (
    <span
      className={cn(
        "inline-flex h-[20px] shrink-0 items-center gap-1 rounded-[var(--rx-radius-sm)] border px-1.5 text-[10px] font-semibold uppercase tracking-wider",
        tone === "accent"
          ? "border-[oklch(0.66_0.19_295_/_0.35)] bg-[var(--rx-accent-soft)] text-[var(--rx-text)]"
          : tone === "long"
            ? "border-transparent bg-[oklch(0.74_0.17_152_/_0.14)] rx-long"
            : tone === "short"
              ? "border-transparent bg-[oklch(0.66_0.2_22_/_0.14)] rx-short"
              : "border-[var(--rx-line)] bg-[var(--rx-surface-1)] text-[var(--rx-text-dim)]",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Thin progress rail (replay progress, discipline meter). */
export function RxMeter({
  value,
  tone = "accent",
  className,
  label,
}: {
  value: number;
  tone?: "accent" | "long" | "short" | "warn";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    tone === "long"
      ? "var(--rx-long)"
      : tone === "short"
        ? "var(--rx-short)"
        : tone === "warn"
          ? "var(--rx-warn)"
          : "var(--rx-accent)";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-[3px] w-full overflow-hidden rounded-[var(--rx-radius-pill)] bg-[var(--rx-line)]", className)}
    >
      <div
        className="h-full rounded-[var(--rx-radius-pill)] transition-[width] duration-[var(--rx-dur)]"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** Floating overlay container (transport pill, HUD block). */
export function RxFloat({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rx-float", className)} {...rest}>
      {children}
    </div>
  );
}
