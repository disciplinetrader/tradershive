import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { StrategyCard } from "@/components/strategy/StrategyCard";
import { StrategyFilters, type FilterState } from "@/components/strategy/StrategyFilters";
import { listStrategies } from "@/lib/strategy.functions";
import type { Strategy } from "@/lib/strategy/types";

export const Route = createFileRoute("/_authenticated/strategies/library")({
  component: LibraryPage,
});

const DEFAULT: FilterState = { q: "", category: "", status: "", favoritesOnly: false, sort: "recent" };

function LibraryPage() {
  const list = useServerFn(listStrategies);
  const q = useQuery({ queryKey: ["strategies"], queryFn: () => list() });
  const [f, setF] = useState<FilterState>(DEFAULT);

  const items = useMemo(() => {
    const data = (q.data ?? []) as Strategy[];
    let out = data.filter((s) => {
      if (f.q && !`${s.name} ${s.description ?? ""} ${(s.tags ?? []).join(" ")}`.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.category && s.category !== f.category) return false;
      if (f.status && s.status !== f.status) return false;
      if (f.favoritesOnly && !s.is_favorite) return false;
      return true;
    });
    switch (f.sort) {
      case "name": out = out.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "favorite": out = out.sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite)); break;
      case "version": out = out.sort((a, b) => b.version - a.version); break;
      default: out = out.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return out;
  }, [q.data, f]);

  return (
    <div className="space-y-4">
      <PageHeader title="Strategy Library" description="All your strategies. Search, filter, sort and open." />
      <StrategyFilters value={f} onChange={setF} />
      {items.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">No strategies match your filters.</GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((s) => <StrategyCard key={s.id} strategy={s} />)}
        </div>
      )}
    </div>
  );
}
