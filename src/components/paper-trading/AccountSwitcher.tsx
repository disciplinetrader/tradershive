import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Check, Plus, RefreshCcw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createAccount, deleteAccount, resetAccount, updateAccount } from "@/lib/paper-trading.functions";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { usePaper } from "./context";

const PRESET_BALANCES = [10000, 25000, 50000, 100000, 250000];

export function AccountSwitcher() {
  const qc = useQueryClient();
  const { accounts, accountId, setAccountId, account } = usePaper();
  const [openCreate, setOpenCreate] = useState(false);
  const [openReset, setOpenReset] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openManage, setOpenManage] = useState(false);

  const [name, setName] = useState("");
  const [balance, setBalance] = useState<number>(10000);
  const [leverage, setLeverage] = useState<number>(100);
  const [marginCall, setMarginCall] = useState<number>(100);
  const [stopOut, setStopOut] = useState<number>(50);
  const [nbp, setNbp] = useState<boolean>(true);

  const createFn = useServerFn(createAccount);
  const resetFn = useServerFn(resetAccount);
  const deleteFn = useServerFn(deleteAccount);
  const updateFn = useServerFn(updateAccount);

  const createMut = useMutation({
    mutationFn: (input: { name: string; starting_balance: number; leverage: number; margin_call_level: number; stop_out_level: number; negative_balance_protection: boolean }) =>
      createFn({ data: { ...input, currency: "USD", max_daily_risk_pct: 5, max_trade_risk_pct: 2 } }),
    onSuccess: () => {
      toast.success("Account created");
      setOpenCreate(false);
      qc.invalidateQueries({ queryKey: ["paper", "accounts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { id: accountId! } }),
    onSuccess: () => {
      toast.success("Account reset");
      setOpenReset(false);
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: accountId! } }),
    onSuccess: () => {
      toast.success("Account archived");
      setOpenDelete(false);
      qc.invalidateQueries({ queryKey: ["paper", "accounts"] });
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Select value={accountId ?? ""} onValueChange={setAccountId}>
        <SelectTrigger className="h-9 min-w-[220px]">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="font-medium">{a.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {formatCurrency(Number(a.balance), a.currency)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Account actions">
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1.5">
          <button
            onClick={() => setOpenCreate(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> New account
          </button>
          <button
            onClick={() => setOpenManage(true)}
            disabled={!account}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
          >
            <Settings2 className="h-4 w-4" /> Rename / edit
          </button>
          <button
            onClick={() => setOpenReset(true)}
            disabled={!account}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
          >
            <RefreshCcw className="h-4 w-4" /> Reset account
          </button>
          <button
            onClick={() => setOpenDelete(true)}
            disabled={!account}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger hover:bg-accent disabled:opacity-40"
          >
            <Archive className="h-4 w-4" /> Archive account
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New paper account</DialogTitle>
            <DialogDescription>Practice with a fresh balance — zero real risk.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="acct-name">Name</Label>
              <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prop Firm Sim" />
            </div>
            <div>
              <Label>Starting balance</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PRESET_BALANCES.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBalance(b)}
                    className={"rounded-md border px-3 py-1.5 text-sm transition " +
                      (balance === b ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}
                  >
                    ${b.toLocaleString()}
                  </button>
                ))}
                <Input type="number" min={100} value={balance}
                  onChange={(e) => setBalance(Number(e.target.value) || 0)} className="w-32" />
              </div>
            </div>
            <div>
              <Label htmlFor="acct-lev">Leverage</Label>
              <Select value={String(leverage)} onValueChange={(v) => setLeverage(Number(v))}>
                <SelectTrigger id="acct-lev"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 10, 20, 30, 50, 100, 200, 500].map((l) => (
                    <SelectItem key={l} value={String(l)}>1:{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Margin call %</Label>
                <Input type="number" min={0} step="1" value={marginCall} onChange={(e) => setMarginCall(Number(e.target.value))} />
                <p className="mt-1 text-[11px] text-muted-foreground">Banner threshold — no auto-close.</p>
              </div>
              <div>
                <Label>Stop-out %</Label>
                <Input type="number" min={0} step="1" value={stopOut} onChange={(e) => setStopOut(Number(e.target.value))} />
                <p className="mt-1 text-[11px] text-muted-foreground">Auto-close biggest loser first.</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nbp} onChange={(e) => setNbp(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Negative balance protection — floor balance at $0
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate({
                name: name.trim() || `Account ${accounts.length + 1}`,
                starting_balance: balance, leverage,
                margin_call_level: marginCall, stop_out_level: stopOut,
                negative_balance_protection: nbp,
              })}
              disabled={createMut.isPending || balance <= 0 || marginCall < stopOut}
              className="gradient-primary text-primary-foreground"
            >
              <Check className="mr-1.5 h-4 w-4" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageDialog open={openManage} onOpenChange={setOpenManage} onSaved={() => qc.invalidateQueries({ queryKey: ["paper", "accounts"] })} update={updateFn} />

      <AlertDialog open={openReset} onOpenChange={setOpenReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this account?</AlertDialogTitle>
            <AlertDialogDescription>
              Balance resets to the starting amount, open trades are archived, and stats are cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetMut.mutate()}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this account?</AlertDialogTitle>
            <AlertDialogDescription>
              The account is hidden but trade history is preserved for your journal and stats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate()}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManageDialog({
  open, onOpenChange, onSaved, update,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void; update: ReturnType<typeof useServerFn<typeof updateAccount>> }) {
  const { account } = usePaper();
  const [name, setName] = useState(account?.name ?? "");
  const [lev, setLev] = useState<number>(account?.leverage ?? 100);
  const [daily, setDaily] = useState<number>(Number(account?.max_daily_risk_pct ?? 5));
  const [perTrade, setPerTrade] = useState<number>(Number(account?.max_trade_risk_pct ?? 2));
  const [marginCall, setMarginCall] = useState<number>(Number(account?.margin_call_level ?? 100));
  const [stopOut, setStopOut] = useState<number>(Number(account?.stop_out_level ?? 50));
  const [nbp, setNbp] = useState<boolean>(account?.negative_balance_protection ?? true);

  if (!account) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (v) {
        setName(account.name); setLev(account.leverage);
        setDaily(Number(account.max_daily_risk_pct)); setPerTrade(Number(account.max_trade_risk_pct));
        setMarginCall(Number(account.margin_call_level ?? 100));
        setStopOut(Number(account.stop_out_level ?? 50));
        setNbp(account.negative_balance_protection ?? true);
      }
    }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit account</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Leverage</Label>
              <Select value={String(lev)} onValueChange={(v) => setLev(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 10, 20, 30, 50, 100, 200, 500].map((l) => <SelectItem key={l} value={String(l)}>1:{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Daily risk %</Label><Input type="number" step="0.1" value={daily} onChange={(e) => setDaily(Number(e.target.value))} /></div>
            <div><Label>Per-trade risk %</Label><Input type="number" step="0.1" value={perTrade} onChange={(e) => setPerTrade(Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Margin call %</Label><Input type="number" step="1" value={marginCall} onChange={(e) => setMarginCall(Number(e.target.value))} /></div>
            <div><Label>Stop-out %</Label><Input type="number" step="1" value={stopOut} onChange={(e) => setStopOut(Number(e.target.value))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={nbp} onChange={(e) => setNbp(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Negative balance protection
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              try {
                await update({ data: {
                  id: account.id, name, leverage: lev,
                  max_daily_risk_pct: daily, max_trade_risk_pct: perTrade,
                  margin_call_level: marginCall, stop_out_level: stopOut,
                  negative_balance_protection: nbp,
                } });
                toast.success("Account updated");
                onSaved(); onOpenChange(false);
              } catch (e) { toast.error((e as Error).message); }
            }}
            disabled={marginCall < stopOut}
            className="gradient-primary text-primary-foreground"
          >Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
