import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/prop-challenges")({
  head: () => ({
    meta: [
      { title: "Prop Firm Mode — TradersHIVE Arena" },
      { name: "description", content: "Simulate FTMO, Apex, Topstep and other prop firm evaluations with live rule monitoring and pass/fail verdicts." },
    ],
  }),
  component: () => (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <Outlet />
    </div>
  ),
});
