import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  beforeLoad: () => {
    throw redirect({
      to: "/battle-arena/leaderboard",
      replace: true,
    });
  },
});
