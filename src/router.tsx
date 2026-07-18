import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { reportLovableError } from "./lib/lovable-error-reporting";

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
  });

  return router;
};

