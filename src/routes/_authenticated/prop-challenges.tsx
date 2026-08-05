import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/prop-challenges")({
  beforeLoad: () => {
    throw redirect({ to: "/replay/prop-firm" });
  },
});
