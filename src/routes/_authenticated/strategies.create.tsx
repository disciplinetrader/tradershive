import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreatorWizard } from "@/components/strategy/CreatorWizard";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/strategies/create")({
  component: CreatePage,
});

function CreatePage() {
  const [open, setOpen] = useState(true);
  // Auto-open wizard on visit
  useEffect(() => { setOpen(true); }, []);
  return (
    <div className="space-y-4">
      <PageHeader title="Create Strategy" description="A guided wizard to define entries, exits, risk and management." actions={
        <Button onClick={() => setOpen(true)}><Rocket className="mr-2 h-4 w-4" />Open Wizard</Button>
      } />
      <CreatorWizard open={open} onOpenChange={setOpen} />
    </div>
  );
}
