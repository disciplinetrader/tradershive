import { createFileRoute, redirect } from "@tanstack/react-router";

// Paper Trading is now a feature inside the Trading Workspace.
export const Route = createFileRoute("/_authenticated/paper-trading")({
  beforeLoad: () => {
    throw redirect({ to: "/trading" });
  },
});
