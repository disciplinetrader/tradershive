/**
 * DataList — mobile-friendly card fallback for a data table.
 *
 * On < md screens tables horizontally scroll or clip. Wrap the same
 * dataset with <DataList> to render as stacked cards.
 *
 *   <TableOrList
 *     mobile={<DataList items={rows} render={(r) => (...)} />}
 *     desktop={<MyTable rows={rows} />}
 *   />
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollX } from "./primitives";

export function DataList<T>({
  items,
  render,
  keyFn,
  className,
  empty,
}: {
  items: T[];
  render: (item: T, i: number) => React.ReactNode;
  keyFn?: (item: T, i: number) => React.Key;
  className?: string;
  empty?: React.ReactNode;
}) {
  if (!items.length && empty) return <>{empty}</>;
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((it, i) => (
        <li
          key={keyFn ? keyFn(it, i) : i}
          className="rounded-md border border-border/60 bg-card p-3 shadow-card"
        >
          {render(it, i)}
        </li>
      ))}
    </ul>
  );
}

/**
 * TableOrList — pick between two renderings based on viewport.
 * Desktop path is auto-wrapped in <ScrollX> so long tables never
 * force page-level horizontal scroll.
 */
export function TableOrList({
  mobile,
  desktop,
  breakpoint = "md",
}: {
  mobile: React.ReactNode;
  desktop: React.ReactNode;
  breakpoint?: "sm" | "md" | "lg";
}) {
  const isMobile = useIsMobile();
  // For SSR safety we prefer the CSS-only switch below, but keep the
  // hook path for consumers who need explicit branching.
  void isMobile;
  const mobileCls =
    breakpoint === "sm" ? "sm:hidden" : breakpoint === "lg" ? "lg:hidden" : "md:hidden";
  const desktopCls =
    breakpoint === "sm" ? "hidden sm:block" : breakpoint === "lg" ? "hidden lg:block" : "hidden md:block";
  return (
    <>
      <div className={mobileCls}>{mobile}</div>
      <div className={desktopCls}>
        <ScrollX>{desktop}</ScrollX>
      </div>
    </>
  );
}
