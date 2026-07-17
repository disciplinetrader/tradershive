import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { RewardModal, type RewardPayload } from "./RewardModal";

type Ctx = { push: (r: NonNullable<RewardPayload>) => void };
const RewardsCtx = createContext<Ctx | null>(null);

export function RewardsProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<NonNullable<RewardPayload>[]>([]);
  const push = useCallback((r: NonNullable<RewardPayload>) => {
    setQueue((q) => [...q, r]);
  }, []);
  const close = useCallback(() => setQueue((q) => q.slice(1)), []);
  return (
    <RewardsCtx.Provider value={{ push }}>
      {children}
      <RewardModal reward={queue[0] ?? null} onClose={close} />
    </RewardsCtx.Provider>
  );
}
export function useRewards() {
  const ctx = useContext(RewardsCtx);
  if (!ctx) return { push: () => {} };
  return ctx;
}
