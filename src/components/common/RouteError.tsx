import { useEffect } from "react";
import { useRouter, Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { cn } from "@/lib/utils";

export interface RouteErrorProps {
  error: Error;
  reset?: () => void;
  /** Short label to identify the failing area, e.g. "Journal". */
  title?: string;
  /** Optional override for the descriptive body copy. */
  description?: string;
  /** "inline" fits within a page section, "full" fills the viewport. */
  variant?: "inline" | "full";
  className?: string;
  /** Boundary identifier for telemetry. */
  boundary?: string;
}

/**
 * Shared error UI for TanStack route `errorComponent` slots.
 * Handles both loader retries (router.invalidate + reset) and telemetry.
 */
export function RouteError({
  error,
  reset,
  title = "Something went wrong",
  description,
  variant = "inline",
  className,
  boundary = "route_error_component",
}: RouteErrorProps) {
  const router = useRouter();

  useEffect(() => {
    // Log for devs + forward to Lovable so async loader errors get captured.
    console.error(`[${boundary}]`, error);
    reportLovableError(error, { boundary });
  }, [error, boundary]);

  const message =
    description ??
    (error?.message
      ? `We hit an error loading this page: ${error.message}`
      : "We hit an unexpected error loading this page.");

  const handleRetry = () => {
    router.invalidate();
    reset?.();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        variant === "full"
          ? "flex min-h-dvh items-center justify-center bg-background px-4"
          : "flex w-full items-center justify-center px-4 py-12",
        className,
      )}
    >
      <div className="w-full max-w-md rounded-3xl glass p-8 text-center shadow-elegant">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={handleRetry} className="gradient-primary text-primary-foreground">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span>Try again</span>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">
              <Home className="h-4 w-4" aria-hidden="true" />
              <span>Go home</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
