import { createFileRoute, redirect } from "@tanstack/react-router";

// Challenges are no longer part of the Replay Studio backtesting workflow.
// They live elsewhere in the platform; this route redirects to keep old links working.
export const Route = createFileRoute("/_authenticated/replay/challenges")({
  beforeLoad: () => {
    throw redirect({ to: "/replay" });
  },
});
