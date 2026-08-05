import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/championship")({
  beforeLoad: () => {
    throw redirect({
      to: "/battle-arena/tournaments",
      replace: true,
    });
  },
});
