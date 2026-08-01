/**
 * Stage 3 (licence-gated) — Advanced Charts proof of concept.
 *
 * This route ships NO TradingView proprietary code. It only attempts to load a
 * licensed Advanced Charts distribution if one has been placed under
 * `public/charting_library/`. When it is absent — which is the case today — the
 * route explains the licence requirement and changes nothing about production.
 *
 * The production chart remains Lightweight Charts (see docs/charting-audit.md).
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GlassCard } from "@/components/ui/glass-card";
import { loadTradingViewLibrary } from "@/lib/chart/tv-loader";
import { createTradingViewDatafeed } from "@/lib/market-data/tv-datafeed";

export const Route = createFileRoute("/_authenticated/trading/tv-poc")({
  head: () => ({
    meta: [
      { title: "Advanced Charts PoC — TradersHIVE" },
      { name: "description", content: "Internal proof of concept wiring TradingView Advanced Charts to the TradersHIVE Market Data Engine." },
      { property: "og:title", content: "Advanced Charts PoC — TradersHIVE" },
      { property: "og:description", content: "Internal licence-gated charting proof of concept." },
    ],
  }),
  component: TvPoc,
});

type Status = "loading" | "missing" | "ready" | "error";

function TvPoc() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    let disposed = false;
    let widget: { remove?: () => void } | null = null;

    (async () => {
      const tv = await loadTradingViewLibrary();
      if (disposed) return;
      if (!tv?.widget || !hostRef.current) {
        setStatus("missing");
        return;
      }
      try {
        widget = new tv.widget({
          container: hostRef.current,
          library_path: "/charting_library/",
          symbol: "BTC/USDT",
          interval: "5",
          locale: "en",
          autosize: true,
          timezone: "Etc/UTC",
          theme: "dark",
          datafeed: createTradingViewDatafeed(),
          // Trading panels intentionally disabled — TradersHIVE owns execution.
          disabled_features: ["trading_account_manager", "order_panel", "use_localstorage_for_settings"],
        }) as { remove?: () => void };
        setStatus("ready");
      } catch (e) {
        setStatus("error");
        setDetail(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      disposed = true;
      try {
        widget?.remove?.();
      } catch {
        /* widget torn down before init completed */
      }
    };
  }, []);

  return (
    <div className="flex h-full min-h-[70dvh] w-full flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-sm font-semibold">Advanced Charts — proof of concept</h1>
        <span className="text-xs text-muted-foreground">
          Internal only. Production charting is unchanged.
        </span>
      </header>

      {status === "missing" ? (
        <GlassCard className="max-w-2xl space-y-3 p-5 text-sm">
          <p className="font-medium">No licensed Advanced Charts distribution is installed.</p>
          <p className="text-muted-foreground">
            Advanced Charts is not on npm. It is granted free of charge by TradingView after an
            application and a signed licence agreement, and delivered through a private repository.
            Once that copy exists, place it at <code>public/charting_library/</code> and this route
            will boot it against the existing Market Data Engine datafeed — no other code changes.
          </p>
          <p className="text-muted-foreground">
            Until then the Trading Workspace keeps using Lightweight Charts 5.2.0 (Apache-2.0), and no
            unofficial build will be added.
          </p>
        </GlassCard>
      ) : null}

      {status === "error" ? (
        <GlassCard className="max-w-2xl p-5 text-sm">
          <p className="font-medium text-danger">Advanced Charts failed to initialise.</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
        </GlassCard>
      ) : null}

      <div
        ref={hostRef}
        data-testid="tv-poc-host"
        className={status === "ready" ? "min-h-0 flex-1 rounded-[4px] border border-border/60" : "hidden"}
      />
    </div>
  );
}
