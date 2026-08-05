import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/championship")({
  beforeLoad: ({ location }) => {
    const destination = location.pathname.replace("/championship", "/battle-arena/tournaments");
    throw redirect({
      to: destination,
      replace: true,
    });
  },
});
