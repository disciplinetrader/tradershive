import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { supabase } from "@/integrations/supabase/client";
import * as icons from "lucide-react";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/strategies/shared")({
  component: SharedPage,
});

function SharedPage() {
  const q = useQuery({
    queryKey: ["strategies", "shared"],
    queryFn: async () => {
      const { data } = await supabase.from("strategies")
        .select("id,name,description,category,tags,color,icon,updated_at,user_id")
        .eq("status", "public").order("updated_at", { ascending: false }).limit(60);
      return data ?? [];
    },
  });

  const items = (q.data ?? []) as any[];

  return (
    <div className="space-y-4">
      <PageHeader title="Shared Strategies" description="Public strategies from the TradersHIVE community." />
      {items.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">No public strategies yet. Be the first — publish yours from the strategy page.</GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((s) => {
            const Icon = ((icons as any)[s.icon] ?? Sparkles) as React.ComponentType<{ className?: string }>;
            return (
              <Link key={s.id} to="/strategies/$id" params={{ id: s.id }}>
                <GlassCard interactive className="p-4 space-y-2 h-full">
                  <div className="flex items-center gap-2">
                    <div className="grid place-items-center rounded-xl p-2" style={{ background: `${s.color}22`, color: s.color }}><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground">{s.category ?? "shared"}</div>
                    </div>
                  </div>
                  {s.description ? <p className="line-clamp-3 text-xs text-muted-foreground">{s.description}</p> : null}
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
