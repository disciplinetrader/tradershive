import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STRATEGY_CATEGORIES, STRATEGY_STATUS } from "@/lib/strategy/constants";

export type FilterState = {
  q: string;
  category: string;
  status: string;
  favoritesOnly: boolean;
  sort: "recent" | "name" | "favorite" | "version";
};

export function StrategyFilters({ value, onChange }: { value: FilterState; onChange: (v: FilterState) => void }) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={value.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search strategies…" className="pl-8 h-9" />
      </div>
      <select value={value.category} onChange={(e) => set({ category: e.target.value })}
        className="h-9 rounded-md border border-border/60 bg-background/40 px-2 text-xs">
        <option value="">All categories</option>
        {STRATEGY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={value.status} onChange={(e) => set({ status: e.target.value })}
        className="h-9 rounded-md border border-border/60 bg-background/40 px-2 text-xs">
        <option value="">All status</option>
        {STRATEGY_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={value.favoritesOnly} onChange={(e) => set({ favoritesOnly: e.target.checked })} />
        Favorites
      </label>
      <div className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" /> Sort
        <select value={value.sort} onChange={(e) => set({ sort: e.target.value as any })}
          className="h-8 rounded-md border border-border/60 bg-background/40 px-2 text-xs">
          <option value="recent">Recent</option>
          <option value="favorite">Favorites first</option>
          <option value="name">Name</option>
          <option value="version">Version</option>
        </select>
      </div>
    </div>
  );
}
