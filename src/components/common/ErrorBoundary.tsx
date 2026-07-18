/**
 * Reusable client-side ErrorBoundary.
 *
 * Contains render/effect errors to a single subtree so a widget crash doesn't
 * blank the whole page. Forwards the error to Lovable error reporting and
 * renders a compact fallback with a "Try again" action.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type FallbackRender = (args: { error: Error; reset: () => void }) => ReactNode;

type Props = {
  children: ReactNode;
  /** Optional short label for logs (e.g. "Dashboard.EquityCurve"). */
  name?: string;
  /** Custom fallback UI. Defaults to a compact inline card. */
  fallback?: ReactNode | FallbackRender;
  /** Called after the error is captured (in addition to reportLovableError). */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[error-boundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info);
    reportLovableError(error, {
      boundary: this.props.name ?? "client_error_boundary",
      componentStack: info.componentStack ?? undefined,
    });
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return (this.props.fallback as FallbackRender)({ error, reset: this.reset });
    }
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 text-sm">
        <p className="font-semibold text-foreground">This section didn&apos;t load</p>
        <p className="mt-1 text-muted-foreground">
          {error.message || "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 inline-flex h-8 items-center justify-center rounded-full border border-border bg-surface px-4 text-xs font-medium text-foreground transition hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
