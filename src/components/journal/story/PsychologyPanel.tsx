/**
 * Psychology across three stages. Language stays associative — observed
 * patterns only, never claimed causation.
 */
import type { JournalEntry } from "@/lib/journal/api";
import { MissingData } from "./primitives";
import { cn } from "@/lib/utils";

type Row = { label: string; value: number | string | null };

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
  return x == null || Number.isNaN(x) ? null : x;
};

export function PsychologyPanel({ entry }: { entry: JournalEntry }) {
  const tagged = (v: string) => ((entry.emotions ?? []).includes(v) ? "tagged" : null);

  const before: Row[] = [
    { label: "Confidence", value: num(entry.confidence) },
    { label: "FOMO", value: tagged("fomo") },
    { label: "Patience", value: num(entry.patience) },
    { label: "Calm", value: tagged("calm") },
  ];
  const during: Row[] = [
    { label: "Discipline", value: num(entry.discipline) },
    { label: "Execution", value: num(entry.execution) },
    { label: "Hesitation", value: tagged("hesitation") },
    { label: "Greed", value: tagged("greed") },
  ];
  const after: Row[] = [
    { label: "Revenge urge", value: tagged("revenge") },
    { label: "Fear", value: tagged("fear") },
    { label: "Frustration", value: tagged("frustration") },
    { label: "Risk management", value: num(entry.risk_mgmt) },
  ];


  const filled = [...before, ...during, ...after].filter((r) => r.value != null);
  if (!filled.length) return <MissingData label="No psychology data captured for this trade." />;

  return (
    <div className="space-y-2">
      <Stage title="Before trade" rows={before} />
      <Stage title="During trade" rows={during} />
      <Stage title="After trade" rows={after} />
      <p className="text-[10px] text-muted-foreground">
        These states are associated with the trade, not proven causes of the result.
      </p>
    </div>
  );
}

function Stage({ title, rows }: { title: string; rows: Row[] }) {
  const present = rows.filter((r) => r.value != null);
  return (
    <div>
      <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">{title}</p>
      {present.length ? (
        <div className="grid grid-cols-2 gap-1.5">
          {present.map((r) => (
            <div key={r.label} className="rounded border border-border/40 px-2 py-1">
              <p className="text-[9px] text-muted-foreground">{r.label}</p>
              <p className={cn("text-[12px] font-medium tabular-nums capitalize")}>{String(r.value)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Not recorded.</p>
      )}
    </div>
  );
}
