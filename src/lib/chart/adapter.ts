/**
 * ChartAdapter — renderer-agnostic contract.
 *
 * The chart workspace, order-line overlay, drawing tools, and screenshot
 * pipeline all talk to this interface. The concrete rendering library is
 * pluggable: today `lightweight-charts` powers it; tomorrow the official
 * TradingView Advanced Charts library can drop into `adapters/tradingview.ts`
 * without touching any consumer.
 *
 * All market data reaches the adapter via `setCandles` / `updateLastCandle`
 * from callers that themselves consume the MarketDataEngine — the adapter
 * never fetches its own data and never speaks to a provider directly.
 */

import type { Candle } from "@/lib/market-data/types";
import type { ChartSettings, ChartType, IndicatorConfig } from "./types";

export interface ChartMountOptions {
  container: HTMLElement;
  settings: ChartSettings;
  onCrosshair?: (info: { price: number | null; time: number | null }) => void;
  onVisibleRangeChanged?: (range: { from: number; to: number }) => void;
}

export interface ChartAdapter {
  /** Renderer identifier (e.g. "lightweight-charts", "tradingview"). */
  readonly kind: string;

  /** Push a full candle history — replaces whatever the chart holds. */
  setCandles(candles: Candle[]): void;
  /** Update the trailing candle in-place (live tick). */
  updateLastCandle(candle: Candle): void;

  /** React to setting changes without a full remount. */
  applySettings(settings: ChartSettings): void;
  setChartType(type: ChartType): void;

  /** Indicator overlays drawn on the price pane. */
  syncOverlayIndicators(indicators: IndicatorConfig[], candles: Candle[]): void;
  /** Oscillators drawn in their own stacked sub-panes (RSI / MACD / ATR / Stoch). */
  syncSubPaneIndicators(indicators: IndicatorConfig[], candles: Candle[]): void;
  /** Volume histogram in the bottom scale margin. */
  setVolumeVisible(visible: boolean, candles: Candle[]): void;

  /** Coordinate transforms — used by DOM overlays (order lines, drawings). */
  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
  timeToX(timeMs: number): number | null;
  xToTime(x: number): number | null;

  /** Screenshot the current viewport as PNG. */
  screenshot(): Promise<Blob | null>;
  fitContent(): void;
  resetPriceScale(): void;

  /**
   * Add a horizontal price line pinned to the price series (entry, SL, TP,
   * bookmark levels…). Returns a handle for later removal / mutation.
   */
  addPriceLine(opts: PriceLineOptions): PriceLineHandle;

  /**
   * Replace the "external" marker set attached to the price series — used
   * for things like Replay bookmarks. Kept separate from the SMC / indicator
   * marker plugins so callers don't stomp on each other.
   */
  setExternalMarkers(markers: ExternalMarker[]): void;

  /** Tear down and release GPU/canvas resources. */
  destroy(): void;
}

export interface PriceLineOptions {
  price: number;
  color: string;
  title?: string;
  /** 0 solid, 1 dotted, 2 dashed, 3 large dashed, 4 sparse dotted */
  lineStyle?: number;
  lineWidth?: 1 | 2 | 3 | 4;
  axisLabelVisible?: boolean;
}

export interface PriceLineHandle {
  remove(): void;
  applyOptions(opts: Partial<PriceLineOptions>): void;
}

export interface ExternalMarker {
  timeMs: number;
  position: "aboveBar" | "belowBar" | "inBar";
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  color: string;
  text?: string;
}


export type ChartAdapterFactory = (opts: ChartMountOptions) => ChartAdapter;
