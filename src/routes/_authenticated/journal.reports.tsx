/**
 * JOURNAL REPORTS — /journal/reports
 *
 * Six reports, one dataset, one filter bar. The filters are applied exactly
 * once, in `buildDataset`, and every panel below reads the result. Nothing here
 * re-filters or re-fetches: if two reports could ever disagree about the same
 * trades, the surface stops being worth reading.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useJournalEntries } from "@/lib/journal/source-filter";
import { fetchTags, groupTagsByKind, journalKeys } from "@/lib/journal/api";
import { fetchUserSettings } from "@/lib/journal/settings";
import { detectTimezone, zonedParts, WEEKDAY_LABELS } from "@/lib/analytics/periods";
import {
  EMPTY_REPORT_FILTERS,
  buildDataset,
  buildReports,
  type JournalReportFilters,
} from "@/lib/journal/reports";
import {
  AnatomyReport,
  EquityReport,
  HourReport,
  MistakeCostReport,
  SessionReport,
  SetupReport,
} from "@/components/journal/reports/panels";
import { useAuth } from "@/hooks/use-auth";
import { routeBoundaries } from "@/lib/route-boundaries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/reports")({
  head: () => ({
    meta: [
      { title: "Journal Reports — TradersHIVE" },
      {
        name: "description",
        content: "Six reports over one trade dataset: equity, setups, mistake cost, session, hour of day and win/loss anatomy.",
      },
    ],
  }),
  component: JournalReports,
  ...routeBoundaries({
    label: "Journal reports",
    boundary: "journal_reports_route",
    backHref: "/journal",
    backLabel: "Back to Journal",
  }),
});

const weekdayOf = (epochMs: number, tz: string) => zonedParts(epochMs, tz).weekday;

function JournalReports() {
  const entriesQuery = useJournalEntries();
  const entries = entriesQuery.data ?? [];
  const tagsQuery = useQuery({ queryKey: journalKeys.tags(), queryFn: fetchTags });
  const settingsQuery = useQuery({ queryKey: ["user-settings"], queryFn: fetchUserSettings });

  const { profile } = useAuth();
  const tz = profile?.timezone || detectTimezone();

  const [filters, setFilters] = useState<JournalReportFilters>(EMPTY_REPORT_FILTERS);

  // Applied ONCE. Every panel reads `records`; none of them filter again.
  // The trader's noise threshold reaches every metric through the same single
  // call that decides scope — there is no second place to keep in step.
  const band = Number(settingsQuery.data?.breakeven_band ?? 0);
  const records = useMemo(
    () => buildDataset(entries, filters, tz, weekdayOf, band),
    [entries, filters, tz, band],
  );
  const reports = useMemo(() => buildReports(records, tz, null), [records, tz]);

  const tagGroups = useMemo(() => groupTagsByKind(tagsQuery.data ?? []), [tagsQuery.data]);
  const activeCount =
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.symbol ? 1 : 0) +
    filters.tagValues.length +
    filters.weekdays.length +
    filters.ratings.length;

  const toggle = <K extends "tagValues" | "weekdays" | "ratings">(
    key: K,
    value: JournalReportFilters[K][number],
  ) =>
    setFilters((p) => {
      const list = p[key] as (typeof value)[];
      return {
        ...p,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      } as JournalReportFilters;
    });

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
              className="h-9 w-[150px]"
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
              className="h-9 w-[150px]"
            />
          </Field>
          <Field label="Symbol">
            <Input
              value={filters.symbol}
              onChange={(e) => setFilters((p) => ({ ...p, symbol: e.target.value }))}
              placeholder="e.g. BTC"
              className="h-9 w-[140px]"
            />
          </Field>
          <div className="ml-auto flex items-center gap-2">
            {activeCount > 0 ? (
              <Badge className="bg-primary/20 text-primary">{activeCount} active</Badge>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground"
              onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>

        {/* Day of week is a filter dimension, not a report — it is the weakest
            of the time slices and needs ~100 trades before a bucket separates
            from noise, but it costs nothing as a way to narrow the others. */}
        <Field label="Day of week">
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <Chip key={label} active={filters.weekdays.includes(i)} onClick={() => toggle("weekdays", i)}>
                {label.slice(0, 3)}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Trade rating">
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} active={filters.ratings.includes(n)} onClick={() => toggle("ratings", n)}>
                {"★".repeat(n)}
              </Chip>
            ))}
          </div>
        </Field>

        {tagGroups.map((g) => (
          <Field key={g.kind} label={g.label}>
            <div className="flex flex-wrap gap-1">
              {g.tags.map((t) => (
                <Chip
                  key={t.id}
                  active={filters.tagValues.includes(t.value)}
                  onClick={() => toggle("tagValues", t.value)}
                >
                  {t.name}
                </Chip>
              ))}
            </div>
          </Field>
        ))}
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        {reports.sample} trade{reports.sample === 1 ? "" : "s"} in scope · times in {tz}
        {records.length !== entries.length ? ` · ${entries.length - records.length} excluded by filters or incomplete` : ""}
      </p>

      <EquityReport equity={reports.equity} drawdown={reports.drawdown} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SetupReport rows={reports.setups} />
        <MistakeCostReport rows={reports.mistakes} />
        <SessionReport time={reports.time} />
        <HourReport time={reports.time} timezone={tz} />
      </div>
      <AnatomyReport anatomy={reports.anatomy} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
