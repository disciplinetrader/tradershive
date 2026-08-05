import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { GraduationCap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard/prop-firm")({
  head: () => ({
    meta: [
      { title: "Prop Firm Challenges — TradersHIVE" },
      { name: "description", content: "Get funded and scale your trading career with our Prop Firm challenges." },
    ],
  }),
  component: DashboardPropFirmPage,
});

function DashboardPropFirmPage() {
  const [accountId, setAccountId] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
      <DashboardHeader accountId={accountId} onAccountChange={setAccountId} />
      
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/30 p-8 text-center">
        <div className="max-w-md space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Target className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Prop Firm Challenges</h2>
            <p className="text-sm text-muted-foreground">
              We are currently integrating with leading Prop Firms to bring you the best funding opportunities directly within TradersHIVE.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" className="rounded-xl">
              Learn More
            </Button>
            <Button className="gradient-primary text-primary-foreground rounded-xl">
              Get Notified
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
