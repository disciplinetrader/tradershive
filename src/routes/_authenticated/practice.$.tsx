/** Legacy redirect for any /practice/* deep link. */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/practice/$")({
  beforeLoad: () => {
    throw redirect({ to: "/replay" });
  },
});
