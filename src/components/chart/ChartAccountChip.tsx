import { usePaper } from "@/components/paper-trading/context";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";

interface Props {
  showAll: boolean;
  onToggleShowAll: (v: boolean) => void;
}

/**
 * Compact account indicator shown top-right on the chart. Users can switch
 * to "All accounts" to see positions across every simulation account.
 */
export function ChartAccountChip({ showAll, onToggleShowAll }: Props) {
  const { accounts, account, setAccountId } = usePaper();
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-1 rounded-md border bg-background/85 px-2 py-1 text-[11px] shadow backdrop-blur">
      <span className="text-muted-foreground">Account</span>
      <select
        value={account?.id ?? ""}
        onChange={(e) => setAccountId(e.target.value)}
        className="rounded border bg-background px-1 py-0.5 font-semibold"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {account ? (
        <span className="font-mono text-muted-foreground">
          {formatCurrency(Number(account.equity ?? account.balance ?? 0), account.currency ?? "USD")}
        </span>
      ) : null}
      <button
        onClick={() => onToggleShowAll(!showAll)}
        className={cn(
          "ml-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase transition",
          showAll ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted",
        )}
        title="Show positions from every account"
      >
        {showAll ? "All" : "One"}
      </button>
    </div>
  );
}
