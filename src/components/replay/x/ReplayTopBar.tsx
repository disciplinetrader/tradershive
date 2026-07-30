/**
 * Replay Studio X — Top Toolbar (Phase 1).
 *
 * 38px, single row, no cards. Holds only identity + status + global
 * entry points: title, instrument, timeframe, data status, replay
 * progress, command palette, settings, finish.
 */
import { Camera, CheckCircle2, Command, Settings2, Signal, SignalLow } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useReplay } from "../context";
import { RxToolbar, RxChip, RxDivider, RxIconButton, RxButton, RxMeter } from "./primitives";

export function ReplayTopBar({
  onSnapshot,
  onFinish,
  onCommands,
}: {
  onSnapshot: () => void;
  onFinish: () => void;
  onCommands: () => void;
}) {
  const { session, candles, cursorIdx } = useReplay();
  const pct = candles.length > 1 ? ((cursorIdx + 1) / candles.length) * 100 : 0;
  const hasData = candles.length > 0;

  return (
    <RxToolbar aria-label="Replay workspace toolbar">
      <RxChip tone="accent">Replay</RxChip>
      <span className="max-w-[220px] truncate text-[12px] font-semibold">
        {session?.title ?? "Untitled Session"}
      </span>

      <RxDivider />

      <RxChip>{session?.symbol ?? "—"}</RxChip>
      <RxChip>{session?.timeframe ?? "—"}</RxChip>
      <RxChip className="hidden md:inline-flex">{session?.mode ?? "free"}</RxChip>

      <RxDivider />

      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium"
        style={{ color: hasData ? "var(--rx-long)" : "var(--rx-warn)" }}
        title={hasData ? "Market data loaded" : "Waiting for market data"}
      >
        {hasData ? <Signal className="h-3 w-3" /> : <SignalLow className="h-3 w-3" />}
        {hasData ? "Data" : "No data"}
      </span>

      {/* Replay progress — inline, hairline, no card */}
      <div className="mx-2 hidden min-w-[120px] flex-1 items-center gap-2 lg:flex">
        <RxMeter value={pct} label="Replay progress" />
        <span className="rx-caps shrink-0">{Math.round(pct)}%</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <RxIconButton label="Command palette (⌘K)" size="sm" onClick={onCommands} side="bottom">
          <Command className="h-3.5 w-3.5" />
        </RxIconButton>
        <RxIconButton label="Snapshot chart (S)" size="sm" onClick={onSnapshot} side="bottom">
          <Camera className="h-3.5 w-3.5" />
        </RxIconButton>
        <Link to="/replay/settings" aria-label="Replay settings">
          <RxIconButton label="Replay settings" size="sm" side="bottom">
            <Settings2 className="h-3.5 w-3.5" />
          </RxIconButton>
        </Link>
        <RxButton size="sm" tone="accent" onClick={onFinish} className="ml-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Finish</span>
        </RxButton>
      </div>
    </RxToolbar>
  );
}
