import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { MarketSymbolSearch } from "@/components/market/MarketSymbolSearch";
import { listFavorites, toggleFavorite, touchRecent } from "@/lib/market-data.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/market/symbols")({
  component: SymbolsPage,
});

function SymbolsPage() {
  const qc = useQueryClient();
  const favsFn = useServerFn(listFavorites);
  const toggleFn = useServerFn(toggleFavorite);
  const touchFn = useServerFn(touchRecent);
  const { data: favs = [] } = useQuery({ queryKey: ["market", "favs"], queryFn: () => favsFn() });
  const favSet = useMemo(() => new Set((favs as any[]).map((f) => f.symbol as string)), [favs]);

  const toggle = useMutation({
    mutationFn: (symbol: string) => toggleFn({ data: { symbol } }),
    onSuccess: (res: any) => { toast.success(res?.favorited ? "Added to favorites" : "Removed"); qc.invalidateQueries({ queryKey: ["market", "favs"] }); },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Symbols" description="Search, favorite, and browse every instrument routed through the engine." />
      <GlassCard className="p-4">
        <MarketSymbolSearch
          favorites={favSet}
          onToggleFavorite={(s) => toggle.mutate(s)}
          onSelect={(s) => { touchFn({ data: { symbol: s.symbol } }).catch(() => {}); toast.info(`Loaded ${s.symbol}`); }}
        />
      </GlassCard>
    </div>
  );
}
