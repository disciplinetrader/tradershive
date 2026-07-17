import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { LibraryCard } from "@/components/replay/LibraryCard";
import { listReplaySessions } from "@/lib/replay.functions";
import type { ReplaySession } from "@/lib/replay/types";

export const Route = createFileRoute("/_authenticated/replay/library")({
  component: LibraryPage,
});

const FILTERS = ["all", "active", "paused", "completed", "archived"] as const;

function LibraryPage() {
  const list = useServerFn(listReplaySessions);
  const q = useQuery({ queryKey: ["replay", "sessions"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");

  const items = useMemo(() => {
    const data = ((q.data ?? []) as ReplaySession[]);
    return data.filter((s) => {
      if (f !== "all" && s.status !== f) return false;
      if (search && !`${s.title} ${s.symbol}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [q.data, search, f]);

  return (
    <div className="space-y-4">
      <PageHeader title="Replay Library" description="All your saved replays. Search, filter and resume anytime." />
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search replays…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <div className="flex gap-1 rounded-lg border border-border/40 bg-background/40 p-1">
          {FILTERS.map((v) => (
            <button
              key={v}
              onClick={() => setF(v)}
              className={`rounded-md px-2 py-1 text-xs capitalize ${f === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">No replays match your filters.</GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((s) => <LibraryCard key={s.id} session={s} />)}
        </div>
      )}
    </div>
  );
}
