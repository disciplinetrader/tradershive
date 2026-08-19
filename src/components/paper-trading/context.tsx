import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createAccount, listAccounts } from "@/lib/paper-trading.functions";
import { DEFAULT_MARKET, findSymbol, type PaperMarket, type SymbolMeta } from "@/lib/paper-trading/symbols";

type Account = {
  id: string; name: string; currency: string; balance: number; equity: number;
  starting_balance: number; leverage: number; max_daily_risk_pct: number;
  max_trade_risk_pct: number; is_archived: boolean;
  margin_call_level: number; stop_out_level: number; negative_balance_protection: boolean;
  /** Cost structure of the simulated broker — pre-fills the order ticket. */
  default_commission: number; default_swap: number;
};

type Ctx = {
  accounts: Account[];
  account: Account | null;
  accountId: string | null;
  setAccountId: (id: string) => void;
  symbol: string;
  setSymbol: (s: string) => void;
  symbolMeta: SymbolMeta | null;
  market: PaperMarket;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  loading: boolean;
};

const PaperCtx = createContext<Ctx | null>(null);

const STORAGE = {
  account: "th_paper_account",
  symbol: "th_paper_symbol",
  market: "th_paper_market",
  timeframe: "th_paper_tf",
};

export function PaperTradingProvider({
  children,
  initialAccountId,
}: {
  children: ReactNode;
  initialAccountId?: string;
}) {
  // Idempotent: a nested mount shares the outer context instead of standing up
  // a second, independent one. The battle route wraps the live workspace so
  // BattleStatusBar — which renders outside TradingWorkspace — can read the
  // account, and TradingWorkspace then wraps again with the same id. Two
  // providers meant the status bar and OrderPanel held separate account and
  // symbol state, so the balance on screen was not the balance being traded.
  const existing = useContext(PaperCtx);
  if (existing) return <>{children}</>;

  return <PaperTradingRoot initialAccountId={initialAccountId}>{children}</PaperTradingRoot>;
}

function PaperTradingRoot({
  children,
  initialAccountId,
}: {
  children: ReactNode;
  initialAccountId?: string;
}) {
  const qc = useQueryClient();

  const fetchAccounts = useServerFn(listAccounts);
  const createAcct = useServerFn(createAccount);
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["paper", "accounts"],
    queryFn: () => fetchAccounts() as unknown as Promise<Account[]>,
    staleTime: 30_000,
  });
  const bootstrappedRef = useRef(false);

  // Auto-create a default demo account on first load so Buy/Sell is usable
  // immediately without forcing the user to visit the account switcher.
  useEffect(() => {
    if (isLoading) return;
    if (accounts && accounts.length > 0) return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    (async () => {
      try {
        await createAcct({
          data: {
            name: "Demo Account",
            currency: "USD",
            starting_balance: 10000,
            leverage: 100,
            max_daily_risk_pct: 5,
            max_trade_risk_pct: 2,
          },
        });
        qc.invalidateQueries({ queryKey: ["paper", "accounts"] });
      } catch {
        // Silent — the user can create an account manually from settings
        // if auto-bootstrap fails (e.g. offline or first render race).
        bootstrappedRef.current = false;
      }
    })();
  }, [accounts, isLoading, createAcct, qc]);


  const [accountId, setAccountIdState] = useState<string | null>(null);
  const [symbol, setSymbolState] = useState<string>("BTC/USDT");
  const [market, setMarketState] = useState<PaperMarket>("crypto");
  const [timeframe, setTimeframeState] = useState("1H");

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE.symbol);
      const meta = s ? findSymbol(s) : null;
      // Same rule as `setSymbol`, for the same reason: a stored symbol the
      // catalog cannot resolve is not restored at all. Restoring it and
      // falling back to the stored market is precisely the half-applied state
      // that made this invisible — and it would survive every reload, because
      // the bad pair keeps rewriting itself.
      if (s && !meta) {
        console.error(
          `[paper] ignoring stored symbol "${s}": not in the trading catalog. ` +
            `Falling back to the default rather than pairing it with a stale market.`,
        );
      }
      if (meta) {
        setSymbolState(s as string);
        setMarketState(meta.market);
      }
      const t = localStorage.getItem(STORAGE.timeframe);
      if (t) setTimeframeState(t);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!accounts?.length) return;
    
    if (initialAccountId) {
      const match = accounts.find((a) => a.id === initialAccountId);
      if (match) {
        setAccountIdState(match.id);
        return;
      }
      // Requested account isn't in the list yet — almost always a battle
      // account that join_battle created moments ago, before this query
      // (staleTime 30s) refetched.
      //
      // Deliberately do NOT fall through to the stored/first account. Silently
      // selecting a personal account inside a battle points Buy/Sell at it, and
      // because battle_id is derived by a BEFORE INSERT trigger from
      // paper_accounts.battle_id, the trade is written as an ordinary trade
      // with battle_id NULL: no rule enforcement, no leaderboard, no error.
      // Waiting for the refetch is always better than trading the wrong book.
      return;
    }

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE.account) : null;
    const match = accounts.find((a) => a.id === stored);
    setAccountIdState(match?.id ?? accounts[0].id);
  }, [accounts, initialAccountId]);


  const setAccountId = (id: string) => {
    setAccountIdState(id);
    try { localStorage.setItem(STORAGE.account, id); } catch { /* ignore */ }
  };
  /**
   * Change the traded instrument, or refuse — never half of it.
   *
   * This used to write the symbol UNCONDITIONALLY and the market only
   * `if (meta)`. An unresolvable symbol therefore landed with the PREVIOUS
   * symbol's market still attached, and `market` is the provider routing hint:
   * `ChartEngine` passes it to `marketData.getCandles(..., settings.market)`.
   * So a symbol the catalog does not know got its candles fetched from
   * whatever venue the last symbol used — an index asked of Binance, which
   * returns nothing, under a header naming the index.
   *
   * The damage was not the wrong market. It was that the state was half
   * applied and silent: the symbol changed, so the UI looked switched, and the
   * failure surfaced later as "this instrument doesn't load" rather than as
   * "that switch failed". Refuse instead. A loud failure someone can report
   * beats a quiet one that reappears three weeks later wearing another face.
   *
   * Every symbol the picker offers comes from `SYMBOL_CATALOG`, which is what
   * `findSymbol` resolves against, so this branch is unreachable from the UI.
   * It exists for the paths that are not the picker: a stale or hand-edited
   * `localStorage` value, a deep link, or a future caller passing a symbol
   * that only exists in `historical_symbols`.
   */
  const setSymbol = (s: string) => {
    const meta = findSymbol(s);
    if (!meta) {
      console.error(
        `[paper] refusing to switch to "${s}": not in the trading catalog. ` +
          `Symbol and market must change together — applying one without the ` +
          `other routes market data to the previous instrument's provider.`,
      );
      return;
    }
    setSymbolState(s);
    setMarketState(meta.market);
    try {
      localStorage.setItem(STORAGE.symbol, s);
      localStorage.setItem(STORAGE.market, meta.market);
    } catch { /* ignore */ }
  };
  /**
   * There is deliberately NO `setMarket`.
   *
   * `market` is the provider routing hint and it is a FUNCTION of the symbol —
   * `findSymbol(s).market`. Exposing a way to set it independently is what
   * allowed BTC/USDT to sit paired with `forex`: two market-tab controls
   * (`SymbolSearch` and `TopToolbar`) called it directly, so browsing markets
   * silently re-routed the current instrument's data to a venue that does not
   * carry it. `ChartEngine` then refetched the OLD symbol from the NEW venue,
   * got nothing, and — because the symbol had not changed — skipped its
   * teardown and left the previous instrument's candles on the canvas.
   *
   * Removing the setter makes that state unreachable rather than merely
   * discouraged. Market changes only as a consequence of `setSymbol`.
   */
  const setTimeframe = (tf: string) => {
    setTimeframeState(tf);
    try { localStorage.setItem(STORAGE.timeframe, tf); } catch { /* ignore */ }
  };

  const account = accounts?.find((a) => a.id === accountId) ?? null;
  const symbolMeta = useMemo(() => findSymbol(symbol) ?? null, [symbol]);

  const value: Ctx = {
    accounts: accounts ?? [],
    account,
    accountId,
    setAccountId,
    symbol,
    setSymbol,
    symbolMeta,
    market,
    timeframe,
    setTimeframe,
    loading: isLoading,
  };

  return <PaperCtx.Provider value={value}>{children}</PaperCtx.Provider>;
}

export function usePaper() {
  const ctx = useContext(PaperCtx);
  if (!ctx) throw new Error("usePaper must be used within <PaperTradingProvider>");
  return ctx;
}
