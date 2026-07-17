/**
 * TradingView Charting Library datafeed adapter.
 *
 * The Lovable build does not ship the proprietary TV Charting Library, but
 * this adapter is the exact interface it expects — drop the library in and
 * point it at `createTradingViewDatafeed()` to get charts backed by the
 * Market Data Engine without any additional wiring.
 */

import { marketData } from "./engine";
import { TIMEFRAME_SECONDS } from "./constants";
import type { Timeframe } from "./types";

const TV_TO_TF: Record<string, Timeframe> = {
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1H", "120": "2H", "240": "4H", "1D": "1D", "1W": "1W", "1M": "1M",
};

export function createTradingViewDatafeed() {
  const subs = new Map<string, { symbol: string; tf: Timeframe; cb: (bar: any) => void; handle: { unsubscribe(): void } }>();

  return {
    onReady(cb: (cfg: any) => void) {
      setTimeout(() => cb({
        supported_resolutions: Object.keys(TV_TO_TF),
        supports_marks: false, supports_time: true, supports_search: true,
      }), 0);
    },
    searchSymbols(userInput: string, _exchange: string, _symbolType: string, onResult: (r: any[]) => void) {
      marketData.searchSymbols({ q: userInput, limit: 30 }).then((rows) => {
        onResult(rows.map((s) => ({
          symbol: s.symbol, full_name: s.displayName, description: s.displayName,
          exchange: s.market.toUpperCase(), ticker: s.symbol, type: s.market,
        })));
      });
    },
    resolveSymbol(symbolName: string, onResolve: (s: any) => void, onError: (e: string) => void) {
      marketData.searchSymbols({ q: symbolName, limit: 1 }).then((rows) => {
        const s = rows[0];
        if (!s) return onError("unknown_symbol");
        onResolve({
          name: s.symbol, ticker: s.symbol, description: s.displayName,
          session: "24x7", timezone: "Etc/UTC", exchange: s.market.toUpperCase(),
          minmov: 1, pricescale: Math.pow(10, s.pricePrecision),
          has_intraday: true, has_daily: true, has_weekly_and_monthly: true,
          supported_resolutions: Object.keys(TV_TO_TF), volume_precision: 0, data_status: "streaming",
        });
      });
    },
    getBars(symbolInfo: any, resolution: string, periodParams: any, onResult: (bars: any[], meta: any) => void, onError: (e: string) => void) {
      const tf = TV_TO_TF[resolution]; if (!tf) return onError("resolution not supported");
      const from = periodParams.from * 1000; const to = periodParams.to * 1000;
      marketData.getCandles({ symbol: symbolInfo.ticker, timeframe: tf, from, to, limit: periodParams.countBack ?? 1000 })
        .then((bars) => onResult(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })), { noData: bars.length === 0 }))
        .catch((e) => onError((e as Error).message));
    },
    subscribeBars(symbolInfo: any, resolution: string, onTick: (bar: any) => void, listenerGuid: string) {
      const tf = TV_TO_TF[resolution] ?? "1m";
      const stepMs = TIMEFRAME_SECONDS[tf] * 1000;
      let current: any = null;
      const handle = marketData.subscribe(symbolInfo.ticker, (q) => {
        const bucket = Math.floor(q.ts / stepMs) * stepMs;
        if (!current || current.time !== bucket) {
          current = { time: bucket, open: q.last, high: q.last, low: q.last, close: q.last, volume: 0 };
        } else {
          current.high = Math.max(current.high, q.last);
          current.low = Math.min(current.low, q.last);
          current.close = q.last;
        }
        onTick({ ...current });
      });
      subs.set(listenerGuid, { symbol: symbolInfo.ticker, tf, cb: onTick, handle });
    },
    unsubscribeBars(listenerGuid: string) {
      const s = subs.get(listenerGuid); if (!s) return;
      s.handle.unsubscribe(); subs.delete(listenerGuid);
    },
  };
}
