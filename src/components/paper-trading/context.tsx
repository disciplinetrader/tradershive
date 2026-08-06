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
  setMarket: (m: PaperMarket) => void;
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
  initialAccountId 
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
      if (s) setSymbolState(s);
      const m = localStorage.getItem(STORAGE.market) as PaperMarket | null;
      if (meta) setMarketState(meta.market);
      else if (m) setMarketState(m);
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
    }

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE.account) : null;
    const match = accounts.find((a) => a.id === stored);
    setAccountIdState(match?.id ?? accounts[0].id);
  }, [accounts, initialAccountId]);


  const setAccountId = (id: string) => {
    setAccountIdState(id);
    try { localStorage.setItem(STORAGE.account, id); } catch { /* ignore */ }
  };
  const setSymbol = (s: string) => {
    setSymbolState(s);
    const meta = findSymbol(s);
    if (meta) setMarketState(meta.market);
    try {
      localStorage.setItem(STORAGE.symbol, s);
      if (meta) localStorage.setItem(STORAGE.market, meta.market);
    } catch { /* ignore */ }
  };
  const setMarket = (m: PaperMarket) => {
    setMarketState(m);
    try { localStorage.setItem(STORAGE.market, m); } catch { /* ignore */ }
  };
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
    setMarket,
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
