import { runImport } from "../src/lib/market-data/historical/pipeline.server";
const to = Date.now();
const from = to - 20 * 86400_000;
const targets = [
  { symbol: "BTC/USDT", tf: "5m" },
  { symbol: "EUR/USD", tf: "5m" },
  { symbol: "XAU/USD", tf: "5m" },
  { symbol: "US30", tf: "1D" },
  { symbol: "AAPL", tf: "5m" },
];
for (const t of targets) {
  try {
    const r = await runImport({
      symbol: t.symbol, nativeSymbol: "", sourceCode: "",
      timeframe: t.tf as any, from, to, triggeredBy: "validation", maxRetries: 0,
    });
    console.log("OK", t.symbol, t.tf, JSON.stringify(r));
  } catch (e) {
    console.log("FAIL", t.symbol, t.tf, (e as Error).message.slice(0, 300));
  }
}
