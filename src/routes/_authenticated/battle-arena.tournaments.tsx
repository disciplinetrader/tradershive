import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/championship")({
  head: () => ({
    meta: [
      { title: "Monthly Championship — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "The flagship monthly trading championship. Compete on live paper trading with global rankings, prizes, and permanent Hall of Fame entries.",
      },
    ],
  }),
  component: () => (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6">
      <Outlet />
    </div>
  ),
});
