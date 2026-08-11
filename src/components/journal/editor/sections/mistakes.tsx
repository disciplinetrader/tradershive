/**
 * Mistakes section — tag an error, then say how bad it was, what it cost and
 * where the evidence is. Tags stay in the legacy `mistakes` array; the detail
 * for each tag lives in `mistake_flags`.
 */
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MISTAKE_CATALOG,
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABEL,
  mistakeCatalogLabel,
  readMistakeDetails,
  type MistakeDetail,
  type MistakeSeverity,
} from "@/lib/journal/editor/model";
import { useTradeEditorContext } from "../TradeEditorProvider";
import { Chip, NumberField, SubHeading, TextAreaField } from "../fields";

const SEVERITIES: { value: MistakeSeverity; label: string; cls: string }[] = [
  { value: "low", label: "Low", cls: "border-sky-400/50 bg-sky-400/10 text-sky-300" },
  { value: "medium", label: "Medium", cls: "border-amber-400/50 bg-amber-400/10 text-amber-300" },
  { value: "high", label: "High", cls: "border-rose-400/50 bg-rose-400/10 text-rose-300" },
];

export function MistakesSection() {
  const { entry, setField, setTagValues } = useTradeEditorContext();
  const details = useMemo(() => readMistakeDetails(entry), [entry]);
  const selected = entry.mistakes ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    const nextDetails = { ...details };
    if (!next.includes(value)) delete nextDetails[value];
    else nextDetails[value] = { severity: "medium", source: "user", confirmed: true, ...details[value] };
    // mistakes[] is projected from journal_entry_tags by trigger; only the
    // per-mistake detail blob is a column this editor owns.
    setField({ mistake_flags: nextDetails as never });
    void setTagValues("mistake", next);
    setExpanded(next.includes(value) ? value : null);
  };

  const patchDetail = (value: string, patch: Partial<MistakeDetail>) => {
    setField({
      mistake_flags: { ...details, [value]: { ...details[value], ...patch } } as never,
    });
  };

  const totalCost = selected.reduce((sum, v) => sum + (Number(details[v]?.cost) || 0), 0);

  return (
    <div className="space-y-3">
      {MISTAKE_CATEGORIES.map((cat) => {
        const items = MISTAKE_CATALOG.filter((m) => m.category === cat);
        return (
          <div key={cat} className="space-y-1.5">
            <SubHeading>{MISTAKE_CATEGORY_LABEL[cat]}</SubHeading>
            <div className="flex flex-wrap gap-1">
              {items.map((m) => (
                <Chip key={m.value} tone="danger" active={selected.includes(m.value)} onClick={() => toggle(m.value)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}

      {selected.length ? (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between">
            <SubHeading>Detail</SubHeading>
            {totalCost ? (
              <span className="font-mono text-[11px] tabular-nums text-danger">
                Estimated cost {totalCost.toFixed(2)}
              </span>
            ) : null}
          </div>

          {selected.map((v) => {
            const d = details[v] ?? {};
            const open = expanded === v;
            return (
              <div key={v} className="rounded border border-border/50 bg-muted/5">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : v)}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left"
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-2 text-[12px] text-foreground">
                    {mistakeCatalogLabel(v)}
                    {d.severity ? (
                      <span
                        className={cn(
                          "rounded border px-1 text-[9px] uppercase",
                          SEVERITIES.find((s) => s.value === d.severity)?.cls,
                        )}
                      >
                        {d.severity}
                      </span>
                    ) : null}
                    {d.source && d.source !== "user" && !d.confirmed ? (
                      <span className="rounded border border-violet-400/40 bg-violet-400/10 px-1 text-[9px] uppercase text-violet-300">
                        {d.source === "ai" ? "AI suggested" : "Rule"}
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition", open && "rotate-180")} />
                </button>

                {open ? (
                  <div className="space-y-2 border-t border-border/40 p-2.5">
                    <div className="flex items-center gap-1">
                      {SEVERITIES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => patchDetail(v, { severity: s.value })}
                          className={cn(
                            "rounded border px-2 py-0.5 text-[11px] transition",
                            d.severity === s.value ? s.cls : "border-border/60 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                      {d.source && d.source !== "user" && !d.confirmed ? (
                        <button
                          type="button"
                          onClick={() => patchDetail(v, { confirmed: true })}
                          className="ml-auto rounded border border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                        >
                          Confirm
                        </button>
                      ) : null}
                    </div>
                    <NumberField
                      label="Estimated cost"
                      value={d.cost ?? null}
                      step="0.01"
                      onCommit={(x) => patchDetail(v, { cost: x })}
                      hint="How much this specific error cost, in account currency."
                    />
                    <TextAreaField
                      label="Evidence / note"
                      value={d.note ?? ""}
                      rows={2}
                      placeholder="What exactly happened, and where you can see it on the chart."
                      onCommit={(x) => patchDetail(v, { note: x })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded border border-dashed border-border/50 bg-muted/5 px-2.5 py-3 text-center text-[11px] text-muted-foreground">
          No mistakes tagged. A clean trade is a valid answer — only tag what actually went wrong.
        </p>
      )}
    </div>
  );
}
