/**
 * Responsive layout primitives — Wave A foundation.
 *
 * These are the ONLY layout building blocks pages should reach for.
 * Every route wraps its content in <PageContainer>. Compositions use
 * <Stack>, <Cluster>, <ResponsiveGrid>, <SplitPane> and <SectionHeader>.
 *
 * Rules baked in (see responsive-layout knowledge):
 *   • Text containers get min-w-0 so long strings can truncate.
 *   • Fixed-size children get shrink-0.
 *   • Two-item header rows use grid-cols-[minmax(0,1fr)_auto] on mobile,
 *     promote to flex at `sm:`.
 *   • No fixed pixel widths on panels — use ResponsiveGrid or SplitPane.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

type As<T extends React.ElementType> = { as?: T } & React.ComponentPropsWithoutRef<T>;

/* -----------------------------------------------------------------
 * PageContainer — canonical page wrapper.
 * Applies fluid horizontal padding via clamp(), a max width, and
 * safe-area padding. Every route mounts inside it.
 * ---------------------------------------------------------------- */
export function PageContainer({
  className,
  size = "wide",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { size?: "narrow" | "wide" | "full" }) {
  const maxW =
    size === "narrow" ? "max-w-3xl" : size === "full" ? "max-w-none" : "max-w-7xl";
  return (
    <div
      {...rest}
      className={cn(
        "mx-auto w-full min-w-0 safe-x",
        maxW,
        // fluid page gutter — scales smoothly 12px → 32px, no breakpoint steps
        "[padding-inline:max(env(safe-area-inset-left),var(--space-md))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -----------------------------------------------------------------
 * Stack — vertical rhythm with responsive gap.
 * ---------------------------------------------------------------- */
type Gap = "xs" | "sm" | "md" | "lg" | "xl";
const gapMap: Record<Gap, string> = {
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4 sm:gap-5",
  lg: "gap-5 sm:gap-6 lg:gap-8",
  xl: "gap-6 sm:gap-8 lg:gap-10",
};

export function Stack<T extends React.ElementType = "div">({
  as,
  gap = "md",
  className,
  children,
  ...rest
}: As<T> & { gap?: Gap }) {
  const Comp = (as ?? "div") as React.ElementType;
  return (
    <Comp className={cn("flex flex-col min-w-0", gapMap[gap], className)} {...rest}>
      {children}
    </Comp>
  );
}

/* -----------------------------------------------------------------
 * Cluster — horizontal wrapping flex row (buttons, chips, filters).
 * ---------------------------------------------------------------- */
export function Cluster({
  gap = "sm",
  align = "center",
  justify = "start",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  gap?: Gap;
  align?: "start" | "center" | "end" | "baseline";
  justify?: "start" | "center" | "end" | "between";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap min-w-0",
        gapMap[gap],
        align === "start" && "items-start",
        align === "center" && "items-center",
        align === "end" && "items-end",
        align === "baseline" && "items-baseline",
        justify === "start" && "justify-start",
        justify === "center" && "justify-center",
        justify === "end" && "justify-end",
        justify === "between" && "justify-between",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* -----------------------------------------------------------------
 * ResponsiveGrid — auto-fit grid, never fixed column counts.
 * Pass `min` in px (default 260) to control card min width.
 * ---------------------------------------------------------------- */
export function ResponsiveGrid({
  min = 260,
  gap = "md",
  className,
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { min?: number; gap?: Gap }) {
  return (
    <div
      {...rest}
      className={cn("grid min-w-0", gapMap[gap], className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -----------------------------------------------------------------
 * SplitPane — two-column layout that stacks below `at`.
 * Used by Trading, Replay, Analytics detail, Journal detail.
 * ---------------------------------------------------------------- */
type Breakpoint = "sm" | "md" | "lg" | "xl";
const gridColsAt: Record<Breakpoint, string> = {
  sm: "sm:grid-cols-[minmax(0,1fr)_var(--split-aside,320px)]",
  md: "md:grid-cols-[minmax(0,1fr)_var(--split-aside,320px)]",
  lg: "lg:grid-cols-[minmax(0,1fr)_var(--split-aside,320px)]",
  xl: "xl:grid-cols-[minmax(0,1fr)_var(--split-aside,360px)]",
};

export function SplitPane({
  at = "lg",
  aside,
  asideWidth = 320,
  gap = "md",
  reverse = false,
  className,
  children,
  style,
}: {
  at?: Breakpoint;
  aside: React.ReactNode;
  asideWidth?: number;
  gap?: Gap;
  reverse?: boolean;
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("grid min-w-0 grid-cols-1", gapMap[gap], gridColsAt[at], className)}
      style={{ ["--split-aside" as string]: `${asideWidth}px`, ...style }}
    >
      <div className={cn("min-w-0", reverse && "order-2")}>{children}</div>
      <div className={cn("min-w-0", reverse && "order-1")}>{aside}</div>
    </div>
  );
}

/* -----------------------------------------------------------------
 * SectionHeader — canonical title + actions row.
 * grid on mobile so text truncates and actions never overflow.
 * ---------------------------------------------------------------- */
export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground sm:line-clamp-none">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 justify-self-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/* -----------------------------------------------------------------
 * ScrollX — horizontal scroll container for tables/timelines that
 * must not push page-level horizontal overflow.
 * ---------------------------------------------------------------- */
export function ScrollX({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-w-0 overflow-x-auto no-scrollbar", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
