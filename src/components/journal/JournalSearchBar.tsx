/**
 * JournalSearchBar — persistent search + saved views + ⌘K focus.
 *
 * Owns nothing itself; drives the shared filters state. Saved views map
 * to pre-canned filter payloads and are kept intentionally small and
 * opinionated so the trader doesn't spend brain cycles configuring
 * search.
 */
import { useEffect, useMemo, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EMPTY_FILTERS, type JournalFiltersState } from "./JournalFilters";
import { cn } from "@/lib/utils";

type SavedView = {
  id: string;
  label: string;
  filters: Partial<JournalFiltersState>;
};

const SAVED_VIEWS: SavedView[] = [
  { id: "recent", label: "Recent", filters: {} },
  { id: "drafts", label: "Drafts", filters: { q: "" } }, // status handled in parent
  { id: "london", label: "London Session", filters: { session: "london" } },
  { id: "breakouts", label: "Breakouts", filters: { setup: "breakout" } },
  { id: "revenge", label: "Revenge Trades", filters: { emotion: "revenge" } },
  { id: "aplus", label: "A+ Setups", filters: {} }, // grade handled in parent
];

export function JournalSearchBar({
  filters,
  onChange,
  activeView,
  onSelectView,
  totalCount,
  filteredCount,
}: {
  filters: JournalFiltersState;
  onChange: (next: JournalFiltersState) => void;
  activeView: string;
  onSelectView: (id: string) => void;
  totalCount: number;
  filteredCount: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ⌘K / Ctrl+K focuses the search input from anywhere on the page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const combo = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!combo) return;
      // Ignore if the user is already typing inside an editable surface
      // that isn't our own search bar — respect their focus.
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inEditable && target !== inputRef.current) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasQuery = filters.q.length > 0;
  const hint = useMemo(() => {
    if (filteredCount === totalCount) return `${totalCount} entries`;
    return `${filteredCount} of ${totalCount}`;
  }, [filteredCount, totalCount]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="Search symbol, notes, tags, setup, mistake, session…"
          aria-label="Search journal entries"
          className="h-10 pl-9 pr-24"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {hasQuery ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onChange({ ...filters, q: "" })}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <kbd
              className="hidden select-none rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline"
              aria-hidden
            >
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Saved views">
        {SAVED_VIEWS.map((v) => {
          const active = v.id === activeView;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-pressed={active}
              onClick={() => onSelectView(v.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition",
                active
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          );
        })}
        <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">
          {hint}
        </Badge>
      </div>
    </div>
  );
}

/** Resolve a saved-view id to concrete filter/state overrides. */
export function resolveSavedView(id: string): {
  filters: JournalFiltersState;
  statusFilter?: "draft" | "published";
  gradeFilter?: string;
} {
  switch (id) {
    case "drafts":
      return { filters: { ...EMPTY_FILTERS }, statusFilter: "draft" };
    case "london":
      return { filters: { ...EMPTY_FILTERS, session: "london" } };
    case "breakouts":
      return { filters: { ...EMPTY_FILTERS, setup: "breakout" } };
    case "revenge":
      return { filters: { ...EMPTY_FILTERS, emotion: "revenge" } };
    case "aplus":
      return { filters: { ...EMPTY_FILTERS }, gradeFilter: "A+" };
    case "recent":
    default:
      return { filters: { ...EMPTY_FILTERS } };
  }
}

export const SAVED_VIEW_IDS = SAVED_VIEWS.map((v) => v.id);
