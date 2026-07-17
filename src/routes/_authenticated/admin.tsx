import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/ui/page-header";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — TradersHIVE Arena" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("is_platform_admin", {
      _user_id: user.user.id,
    });
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin Console"
        description="Enterprise platform management for TradersHIVE Arena."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            <Shield className="h-3 w-3" /> Restricted
          </span>
        }
      />
      <AdminShell>
        <Outlet />
      </AdminShell>
    </div>
  );
}
