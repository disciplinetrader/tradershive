import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/prop-challenges")({
  loader: () => {
    throw redirect({ to: "/dashboard/prop-firm", replace: true });
  },
});
