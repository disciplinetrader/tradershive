import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Shield, Users } from "lucide-react";

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
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    enabled: isAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      return { users: count ?? 0 };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["admin-recent"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, email, level, xp, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description="System overview and platform moderation."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total traders" value={stats?.users ?? "—"} icon={Users} />
        <StatCard label="Active today" value="—" hint="Last 24h" />
        <StatCard label="Open challenges" value="—" />
        <StatCard label="Reports" value="0" icon={Shield} />
      </div>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold">Recent signups</h2>
        {!recent || recent.length === 0 ? (
          <EmptyState className="mt-4" title="No signups yet" />
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {recent.map((u) => (
              <li key={u.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {u.display_name ?? u.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Lvl {u.level} · {u.xp} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
