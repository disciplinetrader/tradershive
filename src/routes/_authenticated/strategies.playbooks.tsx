import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookMarked, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PlaybookCard, type PlaybookRow } from "@/components/playbook/PlaybookCard";
import { PlaybookFilters, type PlaybookFilterState } from "@/components/playbook/PlaybookFilters";
import { listPlaybookLibrary } from "@/lib/playbook.functions";

export const Route = createFileRoute("/_authenticated/strategies/playbooks")({
  component: PlaybookLibraryPage,
  head: () => ({
    meta: [
      { title: "Playbook Library · TradersHIVE" },
      { name: "description", content: "Your personal trading setup library — rules, checklists, mistakes and live performance for every playbook." },
      { property: "og:title", content: "Playbook Library · TradersHIVE" },
      { property: "og:description", content: "Codify, run and refine every trading setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PlaybookLibraryPage() {
  const list = useServerFn(listPlaybookLibrary);
  const [filters, setFilters] = useState<PlaybookFilterState>({
    search: "", market: "", timeframe: "", tag: "", favoritesOnly: false, hasTradesOnly: false,
  });

  const q = useQuery({
    queryKey: ["playbook-library", filters],
    queryFn: () => list({ data: filters }),
    staleTime: 30_000,
  });

  const rows = (q.data ?? []) as PlaybookRow[];
  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [rows]);

  const patch = (p: Partial<PlaybookFilterState>) => setFilters((prev) => ({ ...prev, ...p }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Playbook Library"
        description="Every setup you trade — codified with rules, checklists, and live performance from your journal & paper trading."
        actions={
          <Button asChild>
            <Link to="/strategies/create"><Plus className="mr-2 h-4 w-4" />New Playbook</Link>
          </Button>
        }
      />

      <PlaybookFilters value={filters} onChange={patch} tagOptions={tagOptions} count={rows.length} />

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl border border-border/50 bg-card/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => (<PlaybookCard key={p.id} pb={p} />))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <BookMarked className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Build your first playbook</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Turn your best setups into repeatable systems: define rules, run a pre-trade checklist, and track exactly how each playbook performs across every trade.
      </p>
      <Button className="mt-5" asChild>
        <Link to="/strategies/create"><Plus className="mr-2 h-4 w-4" />Create playbook</Link>
      </Button>
    </div>
  );
}
