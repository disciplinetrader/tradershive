import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { LibraryCard } from "@/components/replay/LibraryCard";
import { CreatorWizard } from "@/components/replay/CreatorWizard";
import { listReplaySessions } from "@/lib/replay.functions";
import type { ReplaySession } from "@/lib/replay/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/library")({
  head: () => ({
    meta: [
      { title: "Saved Sessions — Replay Studio — TradersHIVE Arena" },
      { name: "description", content: "Search, filter, sort, favorite, archive and duplicate every backtest session you've saved." },
    ],
  }),
  component: LibraryPage,
});

const FILTERS = ["all", "active", "paused", "completed", "favorite", "archived"] as const;
const SORTS = [
  { id: "recent", label: "Recent" },
  { id: "duration", label: "Duration" },
  { id: "progress", label: "Progress" },
  { id: "alpha", label: "A–Z" },
] as const;

function LibraryPage() {
  const list = useServerFn(listReplaySessions);
  const q = useQuery({ queryKey: ["replay", "sessions"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("recent");
  const [tag, setTag] = useState<string | null>(null);
  const [wiz, setWiz] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    ((q.data ?? []) as ReplaySession[]).forEach((s) => s.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [q.data]);

  const items = useMemo(() => {
    const data = ((q.data ?? []) as ReplaySession[]);
    const filtered = data.filter((s) => {
      if (f === "favorite" && !s.is_favorite) return false;
      if (f !== "all" && f !== "favorite" && s.status !== f) return false;
      if (tag && !s.tags?.includes(tag)) return false;
      if (search && !`${s.title} ${s.symbol}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === "duration") sorted.sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0));
    else if (sort === "progress") sorted.sort((a, b) => (b.completion_pct ?? 0) - (a.completion_pct ?? 0));
    else if (sort === "alpha") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else sorted.sort((a, b) => new Date(b.last_opened_at ?? b.updated_at).getTime() - new Date(a.last_opened_at ?? a.updated_at).getTime());
    return sorted;
  }, [q.data, search, f, tag, sort]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Saved Sessions"
        description="All your backtest sessions. Search, filter, sort, favorite, archive and duplicate."
        actions={
          <Button size="sm" onClick={() => setWiz(true)}>
            <Sparkles className="mr-2 h-3.5 w-3.5" /> Create Backtest
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border/40 bg-background/40 p-1">
          {FILTERS.map((v) => (
            <button
              key={v}
              onClick={() => setF(v)}
              className={cn(
                "rounded-md px-2 py-1 text-xs capitalize transition",
                f === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-border/40 bg-background/40 p-1 ml-auto">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] transition",
                sort === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Tags</span>
          <button
            onClick={() => setTag(null)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] transition",
              !tag ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t === tag ? null : t)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] transition",
                tag === t ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {q.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/60 h-32 bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <GlassCard className="p-10 text-center space-y-3">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <div className="text-sm text-muted-foreground">No sessions match your filters.</div>
          <Button onClick={() => setWiz(true)}>
            <Sparkles className="mr-2 h-4 w-4" /> Create Backtest
          </Button>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((s) => <LibraryCard key={s.id} session={s} />)}
        </div>
      )}

      <CreatorWizard open={wiz} onOpenChange={setWiz} />
    </div>
  );
}
