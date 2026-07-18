import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { CreateBattleWizard } from "@/components/battle-arena/CreateBattleWizard";

export const Route = createFileRoute("/_authenticated/battle-arena/create")({
  component: CreateBattlePage,
});

function CreateBattlePage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader title="Create battle" description="Set the rules, invite traders, and let the market decide." />
      <CreateBattleWizard
        onCancel={() => navigate({ to: "/battle-arena" })}
        onCreated={(id) => navigate({ to: "/battle-arena/$battleId", params: { battleId: id } })}
      />
    </div>
  );
}
