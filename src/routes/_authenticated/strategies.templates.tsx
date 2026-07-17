import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as icons from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { createFromTemplate, listTemplates } from "@/lib/strategy.functions";
import type { StrategyTemplate } from "@/lib/strategy/types";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/strategies/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const list = useServerFn(listTemplates);
  const create = useServerFn(createFromTemplate);
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["strategy-templates"], queryFn: () => list() });

  const mut = useMutation({
    mutationFn: async (template_id: string) => create({ data: { template_id } }),
    onSuccess: (row: any) => {
      toast.success("Strategy created from template");
      qc.invalidateQueries({ queryKey: ["strategies"] });
      nav({ to: "/strategies/$id", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const items = (q.data ?? []) as StrategyTemplate[];

  return (
    <div className="space-y-4">
      <PageHeader title="Strategy Templates" description="Battle-tested starting points. Fork one and customize it." />
      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="glass rounded-3xl h-32 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((t) => {
            const Icon = ((icons as any)[t.icon] ?? Sparkles) as React.ComponentType<{ className?: string }>;
            return (
              <GlassCard key={t.id} className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="grid place-items-center rounded-xl p-2" style={{ background: `${t.color}22`, color: t.color }}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.category} · {t.difficulty}</div>
                  </div>
                </div>
                {t.description ? <p className="line-clamp-3 text-xs text-muted-foreground">{t.description}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {t.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-md bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>
                  ))}
                </div>
                <Button size="sm" className="w-full" onClick={() => mut.mutate(t.id)} disabled={mut.isPending}>
                  Use Template
                </Button>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
