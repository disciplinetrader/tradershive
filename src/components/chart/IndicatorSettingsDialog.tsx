/**
 * Per-indicator settings dialog — TradingView-style "Inputs" panel.
 *
 * Edits are staged locally and only committed on Apply so the chart doesn't
 * recompute on every keystroke.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDICATOR_PARAM_SCHEMA, clampParam, hoursToHHMM, hhmmToHours } from "@/lib/chart/indicator-schema";
import type { IndicatorKey } from "@/lib/chart/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  indicatorKey: IndicatorKey | null;
  label: string;
  values: Record<string, number>;
  defaults: Record<string, number>;
  onApply: (params: Record<string, number>) => void;
}

export function IndicatorSettingsDialog({
  open, onOpenChange, indicatorKey, label, values, defaults, onApply,
}: Props) {
  const specs = indicatorKey ? INDICATOR_PARAM_SCHEMA[indicatorKey] ?? [] : [];
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const s of specs) {
      const raw = values[s.key] ?? defaults[s.key] ?? s.min;
      next[s.key] = s.type === "time" ? hoursToHHMM(raw) : String(raw);
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, indicatorKey]);

  const commit = () => {
    const out: Record<string, number> = {};
    for (const s of specs) {
      const raw = draft[s.key] ?? "";
      out[s.key] = clampParam(s, s.type === "time" ? hhmmToHours(raw) : Number(raw));
    }
    onApply(out);
    onOpenChange(false);
  };

  const reset = () => {
    const next: Record<string, string> = {};
    for (const s of specs) {
      const raw = defaults[s.key] ?? s.min;
      next[s.key] = s.type === "time" ? hoursToHHMM(raw) : String(raw);
    }
    setDraft(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{label} — Inputs</DialogTitle>
          <DialogDescription className="text-xs">
            Adjust the calculation parameters. Changes apply to this chart and are remembered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {specs.length === 0 && (
            <p className="text-xs text-muted-foreground">This indicator has no configurable inputs.</p>
          )}
          {specs.map((s) => (
            <div key={s.key} className="grid grid-cols-[1fr_7rem] items-center gap-3">
              <div>
                <Label htmlFor={`ind-${s.key}`} className="text-xs">{s.label}</Label>
                {s.hint && <p className="text-[10px] text-muted-foreground">{s.hint}</p>}
              </div>
              {s.type === "time" ? (
                <Input
                  id={`ind-${s.key}`}
                  type="time"
                  step={60}
                  value={draft[s.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                  className="h-8 text-right text-xs tabular-nums"
                />
              ) : (
                <Input
                  id={`ind-${s.key}`}
                  type="number"
                  inputMode="decimal"
                  min={s.min}
                  max={s.max}
                  step={s.step ?? 1}
                  value={draft[s.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                  className="h-8 text-right text-xs tabular-nums"
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={reset} className="text-xs">Reset defaults</Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">Cancel</Button>
          <Button size="sm" onClick={commit} className="text-xs" disabled={specs.length === 0}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
