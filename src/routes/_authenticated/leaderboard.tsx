import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  beforeLoad: ({ location }) => {
    const destination = location.pathname.replace("/leaderboard", "/battle-arena/leaderboard");
    throw redirect({
      to: destination,
      replace: true,
    });
  },
});
