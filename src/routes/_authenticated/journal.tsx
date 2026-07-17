import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({ meta: [{ title: "Journal — TradersHIVE Arena" }] }),
  component: JournalPage,
});

function JournalPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade Journal"
        description="Log every setup, screenshot, tag, and lesson."
        actions={
          <Button className="gradient-primary text-primary-foreground shadow-elegant">
            <Plus className="mr-1.5 h-4 w-4" /> New entry
          </Button>
        }
      />
      <GlassCard className="p-8">
        <EmptyState
          icon={BookOpen}
          title="Your journal is empty"
          description="Create your first entry to start building your trading playbook."
          action={{ label: "Create first entry" }}
        />
      </GlassCard>
    </div>
  );
}
