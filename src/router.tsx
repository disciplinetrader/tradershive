import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { Compass } from "lucide-react";
import { routeTree } from "./routeTree.gen";
import { reportLovableError } from "./lib/lovable-error-reporting";
import { RouteError } from "./components/common/RouteError";
import { EmptyState } from "./components/ui/empty-state";

function DefaultNotFound() {
  return (
    <div className="flex w-full items-center justify-center px-4 py-16">
      <EmptyState
        icon={Compass}
        title="We couldn't find that"
        description="The resource you're looking for was moved, closed, or never existed."
        action={{ label: "Back to home", href: "/" }}
      />
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Sensible retry policy: don't retry auth/permission/validation errors.
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          const code = (error as { code?: string } | null)?.code;
          if (status && status >= 400 && status < 500) return false;
          if (code === "unauthorized" || code === "forbidden" || code === "validation_error") return false;
          return failureCount < 2;
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        onError: (error) => {
          // Always log for devs; UI-level toast is up to the caller.
          console.error("[mutation-error]", error);
          reportLovableError(error, { source: "react_query_mutation" });
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error, reset }) => (
      <RouteError error={error} reset={reset} boundary="router_default_error" />
    ),
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};

