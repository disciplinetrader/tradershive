import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar as CalendarIcon,
  Download,
  Import,
  LayoutGrid,
  LineChart,
  List as ListIcon,
  Plus,
  Rows,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import {
  deleteEntry,
  disableShare,
  duplicateEntry,
  enableShare,
  fetchAllEntryTagLinks,
  fetchEntries,
  fetchTags,
  fetchTaxonomy,
  journalKeys,
  updateEntry,
  type JournalEntry,
} from "@/lib/journal/api";
import { batchSignUrls, JOURNAL_IMAGES_BUCKET } from "@/lib/journal/storage";
import { JOURNAL_FEATURES, JOURNAL_STORAGE_KEYS } from "@/lib/journal/constants";
import {
  applyFilters,
  EMPTY_FILTERS,
  JournalFilters,
  loadStoredFilters,
  type JournalFiltersState,
} from "@/components/journal/JournalFilters";
import { JournalStats } from "@/components/journal/JournalStats";
import { TradeCard } from "@/components/journal/TradeCard";
import { TradeTable } from "@/components/journal/TradeTable";
import { CalendarView } from "@/components/journal/CalendarView";
import { TimelineView } from "@/components/journal/TimelineView";
import { JournalDrawer } from "@/components/journal/JournalDrawer";
import { ManualEntryDialog } from "@/components/journal/ManualEntryDialog";
import { cn } from "@/lib/utils";
import { routeBoundaries } from "@/lib/route-boundaries";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — TradersHIVE Arena" },
      { name: "description", content: "Review every trade, log psychology and mistakes, and build your edge." },
    ],
  }),
  component: JournalPage,
  ...routeBoundaries({
    label: "Journal",
    boundary: "journal_route",
    backHref: "/dashboard",
    backLabel: "Back to Dashboard",
  }),
});

type ViewMode = "card" | "table" | "calendar" | "timeline";

function loadView(): ViewMode {
  if (typeof window === "undefined") return "card";
  const v = localStorage.getItem(JOURNAL_STORAGE_KEYS.view);
  if (v === "card" || v === "table" || v === "calendar" || v === "timeline") return v;
  return "card";
}

function JournalPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>(loadView());
  const [filters, setFilters] = useState<JournalFiltersState>(EMPTY_FILTERS);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [dayFilterIds, setDayFilterIds] = useState<Set<string> | null>(null);

  useEffect(() => setFilters(loadStoredFilters()), []);
  useEffect(() => {
    try { localStorage.setItem(JOURNAL_STORAGE_KEYS.view, view); } catch { /* ignore */ }
  }, [view]);

  const entriesQuery = useQuery({
    queryKey: journalKeys.list(),
    queryFn: fetchEntries,
    staleTime: 30_000,
  });
  const tagsQuery = useQuery({ queryKey: journalKeys.tags(), queryFn: fetchTags });
  const tagLinksQuery = useQuery({
    queryKey: ["journal", "entryTagLinks"],
    queryFn: fetchAllEntryTagLinks,
  });
  const taxonomyQuery = useQuery({
    queryKey: journalKeys.taxonomy(),
    queryFn: fetchTaxonomy,
  });

  const entryTagMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (tagLinksQuery.data ?? []).forEach((r) => {
      const s = map.get(r.entry_id) ?? new Set();
      s.add(r.tag_id);
      map.set(r.entry_id, s);
    });
    return map;
  }, [tagLinksQuery.data]);

  const filtered = useMemo(() => {
    const source = entriesQuery.data ?? [];
    const applied = applyFilters(source, filters, entryTagMap);
    if (!dayFilterIds) return applied;
    return applied.filter((e) => dayFilterIds.has(e.id));
  }, [entriesQuery.data, filters, entryTagMap, dayFilterIds]);

  // Signed URLs for card / timeline thumbnails
  const allScreenshotPaths = useMemo(() => {
    const out = new Set<string>();
    (entriesQuery.data ?? []).forEach((e) => {
      const p = e.screenshots?.[0];
      if (p) out.add(p);
    });
    return Array.from(out);
  }, [entriesQuery.data]);

  const screenshotUrlsQuery = useQuery({
    queryKey: ["journal", "thumb-urls", allScreenshotPaths.length, allScreenshotPaths.slice(0, 20).join(",")],
    queryFn: () => batchSignUrls(JOURNAL_IMAGES_BUCKET, allScreenshotPaths),
    enabled: allScreenshotPaths.length > 0,
  });

  const drawerEntry = useMemo(
    () => (drawerId ? (entriesQuery.data ?? []).find((e) => e.id === drawerId) ?? null : null),
    [drawerId, entriesQuery.data],
  );
  const drawerTagIds = useMemo(
    () => (drawerEntry ? Array.from(entryTagMap.get(drawerEntry.id) ?? []) : []),
    [drawerEntry, entryTagMap],
  );

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      toast.success("Entry deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateMut = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const src = (entriesQuery.data ?? []).find((e) => e.id === id);
      if (!src) throw new Error("Entry not found");
      return duplicateEntry(user.id, src);
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      toast.success("Entry duplicated");
      setDrawerId(entry.id);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const favoriteMut = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) =>
      updateEntry(id, { is_favorite: next }),
    onSuccess: (entry) => {
      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (prev) =>
        prev ? prev.map((e) => (e.id === entry.id ? entry : e)) : prev,
      );
    },
  });

  const shareMut = useMutation({
    mutationFn: async (id: string) => {
      const target = (entriesQuery.data ?? []).find((e) => e.id === id);
      if (!target) throw new Error("Entry not found");
      if (target.is_public) {
        await disableShare(id);
        return { public: false as const, id };
      }
      const { token } = await enableShare(id);
      return { public: true as const, id, token };
    },
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      if (result.public) {
        const url = `${window.location.origin}/journal/share/${result.token}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success("Public link copied");
      } else {
        toast.success("Share link disabled");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isLoading = entriesQuery.isLoading || tagsQuery.isLoading || tagLinksQuery.isLoading;
  const isEmpty = !isLoading && (entriesQuery.data ?? []).length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal"
        description="Review your trades, improve your consistency and build your edge."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <ManualEntryDialog />
            {JOURNAL_FEATURES.importTrade ? (
              <Button variant="outline" size="sm" className="min-h-touch flex-1 sm:flex-none">
                <Import className="mr-1.5 h-4 w-4" />
                <span className="truncate">Import</span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="min-h-touch flex-1 sm:flex-none"
              onClick={() => exportEntries(filtered)}
              disabled={!filtered.length}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
          </div>
        }
      />

      {isEmpty ? (
        <GlassCard className="p-8">
          <EmptyState
            icon={LineChart}
            title="Start documenting your trading journey"
            description="Create your first journal entry to improve your trading discipline and unlock performance insights."
          />
          <div className="mt-4 grid place-items-center">
            <ManualEntryDialog
              trigger={<Button className="gradient-primary text-primary-foreground"><Plus className="mr-1.5 h-4 w-4" /> Create Journal</Button>}
            />
          </div>
        </GlassCard>
      ) : (
        <>
          <JournalStats entries={filtered} />

          <GlassCard className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <JournalFilters
                filters={filters}
                onChange={setFilters}
                tags={tagsQuery.data ?? []}
                taxonomy={taxonomyQuery.data ?? []}
              />
              <ViewSwitcher value={view} onChange={setView} />
            </div>
            {dayFilterIds ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                <span>Filtered to {dayFilterIds.size} trade{dayFilterIds.size === 1 ? "" : "s"} from selected day.</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDayFilterIds(null)}>
                  Clear
                </Button>
              </div>
            ) : null}
          </GlassCard>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-3xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <GlassCard className="p-8">
              <EmptyState
                icon={LineChart}
                title="No entries match"
                description="Try clearing filters or widening the date range."
                action={{ label: "Reset filters", onClick: () => setFilters(EMPTY_FILTERS) }}
              />
            </GlassCard>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {view === "card" ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((entry) => {
                      const tagIds = Array.from(entryTagMap.get(entry.id) ?? []);
                      const tags = (tagsQuery.data ?? []).filter((t) => tagIds.includes(t.id));
                      const path = entry.screenshots?.[0];
                      const url = path ? screenshotUrlsQuery.data?.[path] ?? null : null;
                      return (
                        <TradeCard
                          key={entry.id}
                          entry={entry}
                          tags={tags}
                          screenshotUrl={url}
                          onView={() => setDrawerId(entry.id)}
                          onEdit={() => setDrawerId(entry.id)}
                          onDuplicate={() => duplicateMut.mutate(entry.id)}
                          onDelete={() => deleteMut.mutate(entry.id)}
                          onShare={() => shareMut.mutate(entry.id)}
                          onFavorite={() => favoriteMut.mutate({ id: entry.id, next: !entry.is_favorite })}
                        />
                      );
                    })}
                  </div>
                ) : null}

                {view === "table" ? (
                  <GlassCard className="p-4">
                    <TradeTable
                      entries={filtered}
                      onView={setDrawerId}
                      onEdit={setDrawerId}
                      onDuplicate={(id) => duplicateMut.mutate(id)}
                      onShare={(id) => shareMut.mutate(id)}
                      onDelete={(id) => {
                        if (window.confirm("Delete this journal entry? The linked trade is preserved.")) {
                          deleteMut.mutate(id);
                        }
                      }}
                    />
                  </GlassCard>
                ) : null}

                {view === "calendar" ? (
                  <CalendarView
                    entries={entriesQuery.data ?? []}
                    onDayClick={(_key, ids) => {
                      setDayFilterIds(new Set(ids));
                      if (ids.length === 1) setDrawerId(ids[0]);
                    }}
                  />
                ) : null}

                {view === "timeline" ? (
                  <TimelineView
                    entries={filtered}
                    onView={setDrawerId}
                    screenshotUrls={screenshotUrlsQuery.data ?? {}}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          )}
        </>
      )}

      <JournalDrawer
        entry={drawerEntry}
        open={!!drawerEntry}
        onOpenChange={(v) => !v && setDrawerId(null)}
        allTags={tagsQuery.data ?? []}
        entryTagIds={drawerTagIds}
        taxonomy={taxonomyQuery.data ?? []}
      />

      {/* Keep TS happy for occasional unused imports on route mount */}
      <span className="sr-only"><Link to="/paper-trading">Paper Trading</Link></span>
    </div>
  );
}

function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { v: ViewMode; label: string; icon: React.ReactNode }[] = [
    { v: "card", label: "Cards", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    { v: "table", label: "Table", icon: <Rows className="h-3.5 w-3.5" /> },
    { v: "calendar", label: "Calendar", icon: <CalendarIcon className="h-3.5 w-3.5" /> },
    { v: "timeline", label: "Timeline", icon: <ListIcon className="h-3.5 w-3.5" /> },
  ];
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ViewMode)}>
      <TabsList className="h-9">
        {items.map((it) => (
          <TabsTrigger key={it.v} value={it.v} className={cn("gap-1 text-xs")} aria-label={it.label} title={it.label}>
            {it.icon}
            <span className="hidden sm:inline">{it.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function exportEntries(entries: JournalEntry[]) {
  const cols = [
    "id","date","symbol","market","direction","entry","exit","rr","pnl","duration_sec",
    "setup","strategy","session","grade","status","emotions","mistakes","notes",
  ];
  const rows = entries.map((e) => [
    e.id,
    e.closed_at ?? e.created_at,
    e.symbol ?? "",
    e.market ?? "",
    e.direction ?? "",
    e.entry_price ?? "",
    e.exit_price ?? "",
    e.rr ?? "",
    e.pnl ?? "",
    e.duration_seconds ?? "",
    e.setup ?? "",
    e.strategy ?? "",
    e.session ?? "",
    e.grade ?? "",
    e.status,
    (e.emotions ?? []).join("|"),
    (e.mistakes ?? []).join("|"),
    (e.notes_text ?? "").replace(/\s+/g, " "),
  ]);
  const csv = [cols.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `journal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
