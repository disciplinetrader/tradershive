import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { RouteError } from "@/components/common/RouteError";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Shared helper for per-route error + not-found boundaries.
 * Returns fragments to spread into a `createFileRoute({...})` config so
 * failing routes surface contextual titles instead of the generic default.
 */
export function routeBoundaries(opts: {
  /** Short label used in the error title, e.g. "Battle". */
  label: string;
  /** Boundary identifier used for telemetry. */
  boundary: string;
  /** Optional description shown on the not-found screen. */
  notFoundDescription?: string;
  /** Optional link the "Back" button navigates to. Defaults to "/". */
  backHref?: string;
  /** Optional label for the back link. Defaults to "Back to home". */
  backLabel?: string;
}) {
  const { label, boundary, notFoundDescription, backHref = "/", backLabel = "Back to home" } = opts;
  return {
    errorComponent: ({ error, reset }: { error: Error; reset: () => void }) => (
      <RouteError
        error={error}
        reset={reset}
        title={`${label} failed to load`}
        boundary={boundary}
      />
    ),
    notFoundComponent: () => (
      <div className="flex w-full items-center justify-center px-4 py-16">
        <EmptyState
          icon={Compass}
          title={`${label} not found`}
          description={
            notFoundDescription ??
            `We couldn't find that ${label.toLowerCase()}. It may have been removed or the link is incorrect.`
          }
          action={{
            label: backLabel,
            // Using a plain anchor via EmptyState's `href` keeps this helper
            // decoupled from the target route's params.
            href: backHref,
          }}
        />
        <span className="sr-only">
          <Link to="/">Home</Link>
        </span>
      </div>
    ),
  };
}
