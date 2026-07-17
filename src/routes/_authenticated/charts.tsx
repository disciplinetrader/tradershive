import { createFileRoute, redirect } from "@tanstack/react-router";

// Charts has been merged into the unified Trading Workspace.
export const Route = createFileRoute("/_authenticated/charts")({
  beforeLoad: () => {
    throw redirect({ to: "/trading" });
  },
});
