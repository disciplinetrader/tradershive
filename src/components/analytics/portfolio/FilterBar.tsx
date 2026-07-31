/**
 * §13 Filter bar — the single shared filter surface.
 *
 * Every control writes into the one filter object owned by the provider, which
 * mirrors it into the URL. There is no per-widget filter state anywhere.
 */

import { useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GlassCard } from "@/components/ui/glass-card";
import { activeFilterCount } from "@/lib/analytics/selectors";
import type { AnalyticsFilters, Resolution } from "@/lib/analytics";
import { useAnalyticsWorkspace } from "./provider";

function MultiSelect({
  label, values, options, onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 justify-start gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          {values.length ? <Badge variant="secondary" className="h-4 px-1 text-[10px]">{values.length}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-64 w-56 overflow-y-auto p-1">
        {options.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Nothing to filter yet.</p>
        ) : (
          options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="truncate">{o}</span>
              {values.includes(o) ? <span className="text-primary">✓</span> : null}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            "rounded-sm px-2 py-1 text-[11px] font-medium transition " +
            (value === o.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const toDateInput = (ms: number | null) => (ms == null ? "" : new Date(ms).toISOString().slice(0, 10));

export function AnalyticsFilterBar() {
  const { filters, setFilters, resetFilters, options, resolution, setResolution, result } = useAnalyticsWorkspace();
  const count = activeFilterCount(filters);
  const patch = (p: Partial<AnalyticsFilters>) => setFilters((prev) => ({ ...prev, ...p }));

  return (
    <GlassCard className="flex flex-wrap items-center gap-2 p-3">
      <div className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Filters
        {count ? <Badge variant="secondary" className="h-4 px-1 text-[10px]">{count}</Badge> : null}
      </div>

      <Input
        type="date"
        aria-label="From date"
        className="h-8 w-[140px] text-xs"
        value={toDateInput(filters.from)}
        onChange={(e) => patch({ from: e.target.value ? new Date(`${e.target.value}T00:00:00`).getTime() : null })}
      />
      <Input
        type="date"
        aria-label="To date"
        className="h-8 w-[140px] text-xs"
        value={toDateInput(filters.to)}
        onChange={(e) => patch({ to: e.target.value ? new Date(`${e.target.value}T23:59:59`).getTime() : null })}
      />

      <MultiSelect
        label="Account"
        values={filters.accounts}
        options={options.accounts.map((a) => a.id)}
        onChange={(accounts) => patch({ accounts })}
      />
      <MultiSelect label="Symbol" values={filters.symbols} options={options.symbols} onChange={(symbols) => patch({ symbols })} />
      <MultiSelect label="Asset" values={filters.assetClasses} options={options.assetClasses} onChange={(assetClasses) => patch({ assetClasses })} />
      <MultiSelect label="Direction" values={filters.directions} options={["long", "short"]} onChange={(directions) => patch({ directions })} />
      <MultiSelect label="Setup" values={filters.setups} options={options.setups} onChange={(setups) => patch({ setups })} />
      <MultiSelect label="Playbook" values={filters.playbooks} options={options.playbooks} onChange={(playbooks) => patch({ playbooks })} />
      <MultiSelect label="Session" values={filters.sessions} options={options.sessions} onChange={(sessions) => patch({ sessions })} />
      <MultiSelect label="Order type" values={filters.orderTypes} options={options.orderTypes} onChange={(orderTypes) => patch({ orderTypes })} />
      <MultiSelect label="Close reason" values={filters.closeReasons} options={options.closeReasons} onChange={(closeReasons) => patch({ closeReasons })} />
      <MultiSelect label="Journal" values={filters.journalStatuses} options={options.journalStatuses} onChange={(journalStatuses) => patch({ journalStatuses })} />
      <MultiSelect label="Tags" values={filters.tags} options={options.tags} onChange={(tags) => patch({ tags })} />

      <Segmented
        value={filters.outcome}
        options={[
          { value: "all", label: "All" },
          { value: "profit", label: "Profit" },
          { value: "loss", label: "Loss" },
          { value: "breakeven", label: "B/E" },
        ]}
        onChange={(outcome) => patch({ outcome })}
      />
      <Segmented
        value={filters.archived}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
          { value: "both", label: "Both" },
        ]}
        onChange={(archived) => patch({ archived })}
      />
      <Segmented
        value={filters.excludeFees ? "gross" : "net"}
        options={[
          { value: "net", label: "Net" },
          { value: "gross", label: "Gross" },
        ]}
        onChange={(v) => patch({ excludeFees: v === "gross" })}
      />
      <Segmented<Resolution>
        value={resolution}
        options={[
          { value: "trade", label: "Trade" },
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ]}
        onChange={setResolution}
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {result.records.length} of {result.totalRecords} trades · {result.timezone}
        </span>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={resetFilters} disabled={count === 0}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </div>
    </GlassCard>
  );
}
