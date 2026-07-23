import { cn } from "@/lib/utils";

/**
 * Skeleton — subtle shimmer placeholder used for all initial data loads.
 * Prefer this over spinners or "Loading…" text. The `animate-shimmer` utility
 * is defined in src/styles.css and produces a soft L→R shimmer that respects
 * the current theme (light or dark).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-shimmer rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
