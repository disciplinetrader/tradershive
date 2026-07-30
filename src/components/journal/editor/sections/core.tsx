/**
 * Sections 1–4 + 10: Trade, Plan, Execution, Review, Advanced.
 * Every field routes through the provider, so quick/full/inline share logic.
 */
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DIRECTION_OPTIONS,
  GRADE_OPTIONS,
  MARKET_OPTIONS,
  RESULT_OPTIONS,
  SESSION_OPTIONS,
  STATUS_OPTIONS,
  DEFAULT_SETUPS,
} from "@/lib/journal/constants";
import {
  computeDurationSeconds,
  EXIT_REASONS,
  ORIGIN_LABEL,
  type SectionId,
} from "@/lib/journal/editor/model";
import { issuesForSection } from "@/lib/journal/editor/validation";
import { formatDuration } from "@/lib/journal/format";
import { useTradeEditorContext } from "../TradeEditorProvider";
import {
  DateTimeField,
  Grid,
  NumberField,
  RatingField,
  ReadOnlyValue,
  SelectField,
  SubHeading,
  TextAreaField,
  TextField,
} from "../fields";

function useSectionIssues(section: SectionId) {
  const { issues } = useTradeEditorContext();
  return useMemo(() => issuesForSection(issues, section), [issues, section]);
}

const forField = (list: ReturnType<typeof issuesForSection>, field: string) =>
  list.filter((i) => i.field === field);

/* ------------------------------------------------------------------ */

export function TradeSection() {
  const { entry, setField, setExtras, extras, sourceOf, lockedOf, origin } = useTradeEditorContext();
  const issues = useSectionIssues("trade");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="h-5 border-border/60 px-1.5 text-[10px] text-muted-foreground">
          {ORIGIN_LABEL[origin]}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {origin === "manual"
            ? "Everything here is yours to edit."
            : "Execution facts come from the source record and are protected."}
        </span>
      </div>

      <Grid cols={3}>
        <TextField
          label="Symbol"
          value={entry.symbol}
          source={sourceOf("symbol")}
          locked={lockedOf("symbol")}
          issues={forField(issues, "symbol")}
          onCommit={(v) => setField({ symbol: v })}
        />
        <SelectField
          label="Direction"
          value={entry.direction}
          options={DIRECTION_OPTIONS}
          source={sourceOf("direction")}
          locked={lockedOf("direction")}
          issues={forField(issues, "direction")}
          onCommit={(v) => setField({ direction: v })}
        />
        <SelectField
          label="Status"
          value={entry.status}
          options={STATUS_OPTIONS}
          allowClear={false}
          onCommit={(v) => v && setField({ status: v as typeof entry.status })}
        />
        <SelectField
          label="Asset class"
          value={extras.asset_class ?? entry.market ?? null}
          options={MARKET_OPTIONS}
          onCommit={(v) => { setField({ market: v }); setExtras({ asset_class: v ?? undefined }); }}
        />
        <TextField
          label="Account"
          value={extras.account_label ?? null}
          placeholder="e.g. FTMO 100k"
          onCommit={(v) => setExtras({ account_label: v ?? undefined })}
        />
        <SelectField
          label="Session"
          value={entry.session as string | null}
          options={SESSION_OPTIONS}
          onCommit={(v) => setField({ session: v as typeof entry.session, session_auto_detected: false })}
        />
        <DateTimeField
          label="Entry time"
          value={entry.opened_at}
          source={sourceOf("opened_at")}
          locked={lockedOf("opened_at")}
          onCommit={(v) => setField({ opened_at: v })}
        />
        <DateTimeField
          label="Exit time"
          value={entry.closed_at}
          source={sourceOf("closed_at")}
          locked={lockedOf("closed_at")}
          onCommit={(v) => setField({ closed_at: v, duration_seconds: computeDurationSeconds(entry.opened_at, v) })}
        />
        <ReadOnlyValue
          label="Duration"
          value={entry.duration_seconds ? formatDuration(entry.duration_seconds) : "—"}
        />
        <SelectField
          label="Setup"
          value={entry.setup}
          options={DEFAULT_SETUPS}
          issues={forField(issues, "setup")}
          onCommit={(v) => setField({ setup: v })}
        />
        <TextField
          label="Strategy"
          value={entry.strategy}
          onCommit={(v) => setField({ strategy: v })}
        />
      </Grid>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PlanSection() {
  const { entry, extras, setField, setExtras, sourceOf, lockedOf } = useTradeEditorContext();
  const issues = useSectionIssues("plan");

  const impliedRr = useMemo(() => {
    const e = Number(extras.planned_entry ?? entry.entry_price);
    const sl = Number(entry.stop_loss);
    const tp = Number(entry.take_profit);
    if (!Number.isFinite(e) || !Number.isFinite(sl) || !Number.isFinite(tp)) return null;
    const risk = Math.abs(e - sl);
    if (!risk) return null;
    return Math.abs(tp - e) / risk;
  }, [extras.planned_entry, entry.entry_price, entry.stop_loss, entry.take_profit]);

  return (
    <div className="space-y-3">
      <Grid cols={3}>
        <NumberField
          label="Planned entry"
          value={extras.planned_entry ?? null}
          onCommit={(v) => setExtras({ planned_entry: v })}
        />
        <NumberField
          label="Stop loss"
          value={entry.stop_loss}
          issues={forField(issues, "stop_loss")}
          source={sourceOf("stop_loss")}
          locked={lockedOf("stop_loss")}
          onCommit={(v) => setField({ stop_loss: v })}
        />
        <NumberField
          label="Take profit"
          value={entry.take_profit}
          issues={forField(issues, "take_profit")}
          onCommit={(v) => setField({ take_profit: v })}
        />
        <NumberField
          label="Risk amount"
          value={extras.risk_amount ?? null}
          onCommit={(v) => setExtras({ risk_amount: v })}
        />
        <NumberField
          label="Risk"
          suffix="%"
          value={entry.risk_pct}
          issues={forField(issues, "risk_pct")}
          onCommit={(v) => setField({ risk_pct: v })}
        />
        <NumberField
          label="R:R recorded"
          value={entry.rr}
          step="0.01"
          source={sourceOf("rr")}
          locked={lockedOf("rr")}
          issues={forField(issues, "rr")}
          hint="Calculated from your levels — unlock corrections in Advanced to override."
          onCommit={(v) => setField({ rr: v })}
        />
        <ReadOnlyValue
          label="R:R from levels"
          value={impliedRr == null ? "—" : `${impliedRr.toFixed(2)}R`}
          hint="Derived from planned entry, stop and target."
        />
        <RatingField
          label="Confidence"
          value={entry.confidence}
          onCommit={(v) => setField({ confidence: v })}
        />
      </Grid>

      <TextAreaField
        label="Entry conditions"
        value={extras.entry_conditions ?? ""}
        rows={2}
        placeholder="What had to be true before you clicked."
        onCommit={(v) => setExtras({ entry_conditions: v })}
      />
      <Grid>
        <TextAreaField
          label="Invalidation"
          value={extras.invalidation ?? ""}
          rows={2}
          placeholder="What would prove the idea wrong."
          onCommit={(v) => setExtras({ invalidation: v })}
        />
        <TextAreaField
          label="Management plan"
          value={extras.management_plan ?? ""}
          rows={2}
          placeholder="Break-even, partials, trailing rules."
          onCommit={(v) => setExtras({ management_plan: v })}
        />
      </Grid>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ExecutionSection() {
  const { entry, setField, sourceOf, lockedOf, origin, correctionsUnlocked } = useTradeEditorContext();
  const issues = useSectionIssues("execution");

  const gross = useMemo(() => {
    const pnl = entry.pnl == null ? null : Number(entry.pnl);
    if (pnl == null) return null;
    return pnl + Number(entry.commission ?? 0) + Number(entry.swap ?? 0);
  }, [entry.pnl, entry.commission, entry.swap]);

  return (
    <div className="space-y-3">
      {origin !== "manual" && !correctionsUnlocked ? (
        <p className="flex items-start gap-1.5 rounded border border-border/50 bg-muted/10 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
          These facts come from the {ORIGIN_LABEL[origin].toLowerCase()} record. Enable manual corrections in Advanced if a value is genuinely wrong.
        </p>
      ) : null}

      <Grid cols={3}>
        <NumberField label="Actual entry" value={entry.entry_price} source={sourceOf("entry_price")} locked={lockedOf("entry_price")} onCommit={(v) => setField({ entry_price: v })} />
        <NumberField label="Actual exit" value={entry.exit_price} source={sourceOf("exit_price")} locked={lockedOf("exit_price")} onCommit={(v) => setField({ exit_price: v })} />
        <NumberField label="Quantity" value={entry.lot_size} source={sourceOf("lot_size")} locked={lockedOf("lot_size")} issues={forField(issues, "lot_size")} onCommit={(v) => setField({ lot_size: v })} />
        <NumberField label="Commission" value={entry.commission} step="0.01" source={sourceOf("commission")} locked={lockedOf("commission")} onCommit={(v) => setField({ commission: v })} />
        <NumberField label="Swap / financing" value={entry.swap} step="0.01" source={sourceOf("swap")} locked={lockedOf("swap")} onCommit={(v) => setField({ swap: v })} />
        <ReadOnlyValue label="Gross P/L" value={gross == null ? "—" : gross.toFixed(2)} hint="Net P/L plus fees and swap." />
        <NumberField label="Net P/L" value={entry.pnl} step="0.01" source={sourceOf("pnl")} locked={lockedOf("pnl")} issues={forField(issues, "pnl")} onCommit={(v) => setField({ pnl: v })} />
        <ReadOnlyValue label="Reward %" value={entry.reward_pct == null ? "—" : `${Number(entry.reward_pct).toFixed(2)}%`} />
        <ReadOnlyValue label="Duration" value={entry.duration_seconds ? formatDuration(entry.duration_seconds) : "—"} />
      </Grid>

      <div className="space-y-1.5">
        <SubHeading>Position history</SubHeading>
        <p className="rounded border border-dashed border-border/50 bg-muted/5 px-2.5 py-2 text-[11px] text-muted-foreground">
          Scale-ins, partial closes and stop moves are recorded on the source trade and shown on the
          Trade Story execution timeline. They stay read-only here so a journal edit can never rewrite
          what actually filled.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ReviewSection() {
  const { entry, extras, setField, setExtras, setNarrative } = useTradeEditorContext();
  const narrative = useMemo(() => readNarrative(entry), [entry]);

  return (
    <div className="space-y-3">
      <Grid cols={3}>
        <SelectField
          label="Grade"
          value={entry.grade as string | null}
          options={GRADE_OPTIONS}
          onCommit={(v) => setField({ grade: v as typeof entry.grade })}
        />
        <SelectField
          label="Result"
          value={extras.result ?? null}
          options={RESULT_OPTIONS}
          onCommit={(v) => setExtras({ result: v ?? undefined })}
        />
        <SelectField
          label="Exit reason"
          value={extras.exit_reason ?? null}
          options={EXIT_REASONS}
          onCommit={(v) => setExtras({ exit_reason: v ?? undefined })}
        />
      </Grid>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <RatingField label="Discipline" value={entry.discipline} onCommit={(v) => setField({ discipline: v })} />
        <RatingField label="Execution" value={entry.execution} onCommit={(v) => setField({ execution: v })} />
        <RatingField label="Risk management" value={entry.risk_mgmt} onCommit={(v) => setField({ risk_mgmt: v })} />
        <RatingField label="Patience" value={entry.patience} onCommit={(v) => setField({ patience: v })} />
        <RatingField label="Entry quality" value={entry.entry_quality} onCommit={(v) => setField({ entry_quality: v })} />
        <RatingField label="Exit quality" value={entry.exit_quality} onCommit={(v) => setField({ exit_quality: v })} />
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        These are your self-ratings. Calculated metrics (R, efficiency, adherence) live on the Trade Story and
        are never editable here.
      </p>

      <Grid>
        <TextAreaField label="What went well" value={narrative.well ?? ""} rows={2} onCommit={(v) => setNarrative({ well: v })} />
        <TextAreaField label="What went wrong" value={narrative.wrong ?? ""} rows={2} onCommit={(v) => setNarrative({ wrong: v })} />
        <TextAreaField label="What I learned" value={narrative.learned ?? ""} rows={2} onCommit={(v) => setNarrative({ learned: v })} />
        <TextAreaField label="Next-time rule" value={narrative.rule ?? ""} rows={2} onCommit={(v) => setNarrative({ rule: v })} />
      </Grid>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AdvancedSection() {
  const {
    entry,
    extras,
    setExtras,
    origin,
    correctionsUnlocked,
    setCorrectionsUnlocked,
    setField,
    issues,
  } = useTradeEditorContext();

  return (
    <div className="space-y-3">
      <Grid cols={3}>
        <ReadOnlyValue label="Entry ID" value={entry.id} />
        <ReadOnlyValue label="Source record" value={entry.trade_id ?? "—"} />
        <ReadOnlyValue label="Origin" value={ORIGIN_LABEL[origin]} />
        <TextField label="Broker reference" value={extras.broker_ref ?? null} onCommit={(v) => setExtras({ broker_ref: v ?? undefined })} />
        <TextField label="Timezone" value={extras.timezone ?? entry.opened_tz ?? null} placeholder="e.g. Europe/London" onCommit={(v) => setExtras({ timezone: v ?? undefined })} />
        <TextField label="Currency" value={extras.currency ?? null} placeholder="e.g. USD" onCommit={(v) => setExtras({ currency: v ?? undefined })} />
      </Grid>

      <div className="rounded border border-warning/30 bg-warning/5 p-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label className="text-[11px] font-semibold text-warning">Manual execution corrections</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Unlocks broker/replay-owned values (entry, exit, quantity, P/L). A later sync can overwrite
              your correction — record why below.
            </p>
          </div>
          <Switch
            checked={correctionsUnlocked}
            onCheckedChange={setCorrectionsUnlocked}
            aria-label="Enable manual execution corrections"
          />
        </div>
        {correctionsUnlocked ? (
          <div className="mt-2">
            <TextAreaField
              label="Why this correction"
              value={extras.corrections_note ?? ""}
              rows={2}
              placeholder="e.g. broker reported the wrong fill price; corrected from the statement."
              onCommit={(v) => setExtras({ corrections_note: v })}
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <SubHeading>Data quality</SubHeading>
        {issues.length ? (
          <ul className="space-y-1">
            {issues.map((i) => (
              <li key={i.id} className="flex items-start gap-1.5 text-[11px]">
                <span
                  className={
                    i.level === "error"
                      ? "text-danger"
                      : i.level === "warning" || i.level === "calc"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }
                >
                  •
                </span>
                <span className="text-muted-foreground">{i.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">No data quality warnings.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => setField({ is_favorite: !entry.is_favorite })}
        >
          {entry.is_favorite ? "Remove from favourites" : "Mark as favourite"}
        </Button>
      </div>
    </div>
  );
}
