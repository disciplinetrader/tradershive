/**
 * Legacy redirect — the standalone Practice section was folded into Replay
 * Studio, which now owns drills, challenges and skill work.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/practice")({
  beforeLoad: () => {
    throw redirect({ to: "/replay" });
  },
});
