import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/support")({
  component: () => <Navigate to="/settings" search={{ tab: "support" }} replace />,
});
