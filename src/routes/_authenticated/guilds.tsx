import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/guilds")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
