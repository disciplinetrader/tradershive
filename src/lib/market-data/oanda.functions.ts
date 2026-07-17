/**
 * OANDA server proxy — the browser calls these server functions so the
 * OANDA v20 API token stays on the server (never shipped to the client)
 * and CORS is not an issue.
 *
 * Env vars (server-only):
 *   OANDA_API_TOKEN    — v20 personal access token
 *   OANDA_ACCOUNT_ID   — v20 account id
 *   OANDA_ENVIRONMENT  — "practice" (default) | "live"
 *
 * When the token is missing every function throws `oanda_not_configured`,
 * which the client provider surfaces as a real error instead of silently
 * degrading to mock data.
 */
import { createServerFn } from "@tanstack/react-start";

const HOSTS = {
  practice: {
    rest: "https://api-fxpractice.oanda.com",
    stream: "https://stream-fxpractice.oanda.com",
  },
  live: {
    rest: "https://api-fxtrade.oanda.com",
    stream: "https://stream-fxtrade.oanda.com",
  },
} as const;

type OandaGranularity = "S5" | "S15" | "S30" | "M1" | "M3" | "M5" | "M15" | "M30" | "H1" | "H2" | "H4" | "D" | "W" | "M";
const TF_TO_GRAN: Record<string, OandaGranularity> = {
  "1m": "M1", "3m": "M3", "5m": "M5", "15m": "M15", "30m": "M30",
  "1H": "H1", "2H": "H2", "4H": "H4", "1D": "D", "1W": "W", "1M": "M",
};

function cfg() {
  const token = process.env.OANDA_API_TOKEN;
  const account = process.env.OANDA_ACCOUNT_ID;
  const envName = (process.env.OANDA_ENVIRONMENT ?? "practice").toLowerCase() as keyof typeof HOSTS;
  if (!token || !account) throw new Error("oanda_not_configured");
  const host = HOSTS[envName] ?? HOSTS.practice;
  return { token, account, host };
}

async function oandaFetch(path: string): Promise<unknown> {
  const { token, host } = cfg();
  const res = await fetch(`${host.rest}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Accept-Datetime-Format": "UNIX" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`oanda_${res.status}:${text.slice(0, 200)}`);
  }
  return res.json();
}

/** List every tradable instrument on the configured account. */
export const oandaInstruments = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { account } = cfg();
    const data = (await oandaFetch(`/v3/accounts/${account}/instruments`)) as {
      instruments: Array<{
        name: string; displayName: string; type: string;
        pipLocation: number; displayPrecision: number;
        marginRate?: string;
      }>;
    };
    return data.instruments.map((i) => {
      const kind = i.type === "CURRENCY" ? "forex"
        : i.type === "METAL" ? "metals"
        : i.type === "CFD" ? "indices"
        : "commodities";
      const [baseAsset, quoteAsset] = i.name.split("_");
      return {
        symbol: i.name.replace("_", ""),
        oandaName: i.name,
        displayName: i.displayName,
        market: kind,
        baseAsset, quoteAsset,
        tickSize: Math.pow(10, i.pipLocation),
        pricePrecision: i.displayPrecision,
      };
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
});

/** Current pricing for one or more instruments (used by the client poller). */
export const oandaPricing = createServerFn({ method: "POST" })
  .inputValidator((input: { instruments: string[] }) => input)
  .handler(async ({ data }) => {
    try {
      const { account } = cfg();
      const names = data.instruments.filter(Boolean).join(",");
      if (!names) return { prices: [] };
      const res = (await oandaFetch(`/v3/accounts/${account}/pricing?instruments=${encodeURIComponent(names)}`)) as {
        prices: Array<{
          instrument: string;
          bids: Array<{ price: string }>;
          asks: Array<{ price: string }>;
          closeoutBid: string; closeoutAsk: string;
          time: string; status?: string;
        }>;
      };
      return {
        prices: res.prices.map((p) => {
          const bid = Number(p.bids?.[0]?.price ?? p.closeoutBid);
          const ask = Number(p.asks?.[0]?.price ?? p.closeoutAsk);
          return {
            instrument: p.instrument,
            symbol: p.instrument.replace("_", ""),
            bid, ask, last: (bid + ask) / 2, spread: ask - bid,
            ts: Number(p.time) ? Math.floor(Number(p.time) * 1000) : Date.now(),
            status: p.status,
          };
        }),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/** Historical candles (mid). */
export const oandaCandles = createServerFn({ method: "POST" })
  .inputValidator((input: { instrument: string; timeframe: string; from?: number; to?: number; count?: number }) => input)
  .handler(async ({ data }) => {
    try {
      const gran = TF_TO_GRAN[data.timeframe];
      if (!gran) throw new Error(`bad_timeframe:${data.timeframe}`);
      const params = new URLSearchParams({ granularity: gran, price: "M" });
      if (data.from && data.to) {
        params.set("from", String(data.from / 1000));
        params.set("to", String(data.to / 1000));
      } else {
        params.set("count", String(Math.min(5000, data.count ?? 500)));
      }
      const res = (await oandaFetch(
        `/v3/instruments/${data.instrument}/candles?${params.toString()}`,
      )) as { candles: Array<{ time: string; volume: number; complete: boolean; mid: { o: string; h: string; l: string; c: string } }> };
      return {
        candles: res.candles.map((c) => ({
          time: Math.floor(Number(c.time) * 1000),
          open: Number(c.mid.o), high: Number(c.mid.h), low: Number(c.mid.l), close: Number(c.mid.c),
          volume: c.volume,
        })),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/** Environment probe used by the client provider on boot. */
export const oandaStatus = createServerFn({ method: "GET" }).handler(async () => {
  try { cfg(); return { configured: true, environment: (process.env.OANDA_ENVIRONMENT ?? "practice") }; }
  catch { return { configured: false }; }
});
