/**
 * REPLAY STUDIO X — Phase 2 · Floating Order Ticket.
 *
 * The compact precision companion to the ChartOrderLayer. It never
 * dominates the workspace: 200px wide, bottom-right, collapsible to a
 * single Buy/Sell pill. Volume, order type and the advanced knobs live
 * here — price levels are shaped on the chart.
 *
 * All execution flows through the chart-trading context, which in turn
 * calls the untouched replay engine actions.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReplay } from "../context";
import { useChartTrading } from "./chart-trading-context";
import {
  computeTradeMetrics,
  formatMoney,
  formatPrice,
  formatRR,
  validateDraft,
} from "@/lib/replay/chart-trading";
import type { OrderType } from "@/lib/replay/types";

const TYPES: OrderType[] = ["market", "limit", "stop"];

export function FloatingOrderTicket({ className }: { className?: string }) {
  const { settings, updateSettings, openTrades, closeAllPositions } = useReplay();
  const { draft, arm, patchDraft, setOrderType, cancel, confirm, busy, price } = useChartTrading();
  const [advanced, setAdvanced] = useState(false);

  const lot = draft?.lot ?? (settings.defaultLotSize > 0 ? settings.defaultLotSize : 1);
  const metrics = draft
    ? computeTradeMetrics({
        side: draft.side,
        entry: draft.entry,
        sl: draft.sl,
        tp: draft.tp,
        lot: draft.lot,
        commissionPerLot: settings.commissionPerLot,
      })
    : null;
  const check = draft ? validateDraft(draft) : null;

  const setLot = (next: number) => {
    const v = Math.max(0.01, Number(next.toFixed(2)));
    if (draft) patchDraft({ lot: v });
    else updateSettings({ defaultLotSize: v });
  };

  return (
    <div
      className={cn(
        "pointer-events-auto w-[204px] rounded-[var(--rx-radius-md)] border border-[var(--rx-line-strong)] bg-[var(--rx-overlay)] p-1.5 shadow-[var(--rx-shadow-float)]",
        className,
      )}
      aria-label="Order ticket"
    >
      {/* Side buttons */}
      <div className="flex gap-1">
        <SideButton
          tone="long"
          active={draft?.side === "long"}
          onClick={() => arm("long")}
          label="Buy (B)"
        >
          Buy
        </SideButton>
        <SideButton
          tone="short"
          active={draft?.side === "short"}
          onClick={() => arm("short")}
          label="Sell (S)"
        >
          Sell
        </SideButton>
      </div>

      {/* Order type */}
      <div className="mt-1.5 flex rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] p-[1px]">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={!draft}
            onClick={() => setOrderType(t)}
            className={cn(
              "h-[18px] flex-1 rounded-[2px] text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40",
              draft?.orderType === t
                ? "bg-[var(--rx-accent-soft)] text-[var(--rx-text)]"
                : "text-[var(--rx-text-faint)] hover:text-[var(--rx-text-dim)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Volume */}
      <div className="mt-1.5 flex items-center gap-1">
        <span className="rx-caps w-[38px] shrink-0">Vol</span>
        <button type="button" aria-label="Decrease volume" className={stepper} onClick={() => setLot(lot - 0.1)}>–</button>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={lot}
          onChange={(e) => setLot(Number(e.target.value))}
          className="h-[20px] w-full min-w-0 rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] bg-[var(--rx-surface-1)] px-1 text-right text-[11px] tabular-nums outline-none focus:border-[var(--rx-accent)]"
          aria-label="Volume in lots"
        />
        <button type="button" aria-label="Increase volume" className={stepper} onClick={() => setLot(lot + 0.1)}>+</button>
      </div>

      {/* Live read-out */}
      <div className="mt-1.5 space-y-[1px] text-[10px]">
        <Row label="Price" value={formatPrice(price)} />
        {draft && metrics ? (
          <>
            <Row label="Entry" value={formatPrice(draft.entry)} />
            <Row label="R:R" value={formatRR(metrics.rr)} />
            <Row label="Risk" value={formatMoney(metrics.expectedLoss)} tone="short" />
            <Row label="Reward" value={formatMoney(metrics.expectedProfit)} tone="long" />
          </>
        ) : (
          <Row label="Open" value={String(openTrades.length)} />
        )}
      </div>

      {/* Advanced */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="mt-1.5 flex w-full items-center justify-between rounded-[var(--rx-radius-sm)] px-1 py-[2px] text-[9px] font-bold uppercase tracking-wider text-[var(--rx-text-faint)] hover:text-[var(--rx-text-dim)]"
      >
        <span className="inline-flex items-center gap-1"><Settings2 className="h-3 w-3" /> Advanced</span>
        {advanced ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
      {advanced ? (
        <div className="space-y-1 rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] p-1">
          <NumField
            label="Risk %"
            value={settings.defaultRiskPct}
            step={0.1}
            onChange={(v) => updateSettings({ defaultRiskPct: v })}
          />
          <NumField
            label="Comm/lot"
            value={settings.commissionPerLot}
            step={0.5}
            onChange={(v) => updateSettings({ commissionPerLot: v })}
          />
          <NumField
            label="Spread"
            value={settings.spread}
            step={0.0001}
            onChange={(v) => updateSettings({ spread: v })}
          />
          <div className="flex items-center justify-between">
            <span className="rx-caps">Mode</span>
            <button
              type="button"
              onClick={() => updateSettings({ tradingMode: settings.tradingMode === "hedging" ? "netting" : "hedging" })}
              className="h-[18px] rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] px-1.5 text-[9px] font-bold uppercase tracking-wider"
            >
              {settings.tradingMode}
            </button>
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-1.5 flex gap-1">
        {draft ? (
          <>
            <button
              type="button"
              disabled={busy || !check?.ok}
              onClick={() => void confirm()}
              className="h-[22px] flex-1 rounded-[var(--rx-radius-sm)] text-[10px] font-bold uppercase tracking-wider text-black disabled:opacity-40"
              style={{ background: draft.side === "long" ? "var(--rx-long)" : "var(--rx-short)" }}
            >
              {busy ? "Sending…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="h-[22px] rounded-[var(--rx-radius-sm)] border border-[var(--rx-line-strong)] px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--rx-text-dim)]"
            >
              Esc
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!openTrades.length}
            onClick={() => void closeAllPositions()}
            className="h-[22px] w-full rounded-[var(--rx-radius-sm)] border border-[var(--rx-line-strong)] text-[10px] font-semibold uppercase tracking-wider text-[var(--rx-text-dim)] disabled:opacity-40"
          >
            Close all
          </button>
        )}
      </div>
    </div>
  );
}

const stepper =
  "grid h-[20px] w-[20px] shrink-0 place-items-center rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] bg-[var(--rx-surface-1)] text-[11px] leading-none text-[var(--rx-text-dim)] hover:text-[var(--rx-text)]";

function SideButton({
  children,
  tone,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  tone: "long" | "short";
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  const color = tone === "long" ? "var(--rx-long)" : "var(--rx-short)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="h-[26px] flex-1 rounded-[var(--rx-radius-sm)] text-[11px] font-bold uppercase tracking-wider transition-colors"
      style={
        active
          ? { background: color, color: "#000" }
          : { border: `1px solid ${color}`, color }
      }
    >
      {children}
    </button>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--rx-text-faint)]">{label}</span>
      <span
        className="font-medium tabular-nums"
        style={{ color: tone === "long" ? "var(--rx-long)" : tone === "short" ? "var(--rx-short)" : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="rx-caps">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        aria-label={label}
        className="h-[18px] w-[72px] rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] bg-[var(--rx-surface-1)] px-1 text-right text-[10px] tabular-nums outline-none focus:border-[var(--rx-accent)]"
      />
    </div>
  );
}
