import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createEntry, journalKeys } from "@/lib/journal/api";
import { MARKET_OPTIONS } from "@/lib/journal/constants";
import { useAuth } from "@/hooks/use-auth";

export function ManualEntryDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <span onClick={() => setOpen(true)} role="button">{trigger}</span>
      ) : (
        <Button onClick={() => setOpen(true)} className="gradient-primary text-primary-foreground shadow-elegant">
          <Plus className="mr-1.5 h-4 w-4" /> Manual Journal
        </Button>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New journal entry</DialogTitle>
        </DialogHeader>
        <ManualForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ManualForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState("forex");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [pnl, setPnl] = useState("");
  const [rr, setRr] = useState("");
  const [closedAt, setClosedAt] = useState<string>(() => new Date().toISOString().slice(0, 16));

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const created = await createEntry({
        user_id: user.id,
        symbol: symbol.trim() || null,
        market,
        direction,
        entry_price: entryPrice ? Number(entryPrice) : null,
        exit_price: exitPrice ? Number(exitPrice) : null,
        pnl: pnl ? Number(pnl) : null,
        rr: rr ? Number(rr) : null,
        closed_at: closedAt ? new Date(closedAt).toISOString() : null,
        status: "draft",
      });
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      toast.success("Journal entry created");
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Pair</Label>
        <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. EUR/USD" required />
      </div>
      <div className="space-y-1.5">
        <Label>Market</Label>
        <Select value={market} onValueChange={setMarket}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MARKET_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Direction</Label>
        <Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Entry</Label>
        <Input type="number" inputMode="decimal" step="any" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Exit</Label>
        <Input type="number" inputMode="decimal" step="any" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>P/L</Label>
        <Input type="number" inputMode="decimal" step="any" value={pnl} onChange={(e) => setPnl(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>RR</Label>
        <Input type="number" inputMode="decimal" step="0.01" value={rr} onChange={(e) => setRr(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Closed at</Label>
        <Input type="datetime-local" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
      </div>
      <DialogFooter className="sm:col-span-2">
        <Button type="submit" disabled={mut.isPending} className="gradient-primary text-primary-foreground">
          {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Create entry
        </Button>
      </DialogFooter>
    </form>
  );
}
