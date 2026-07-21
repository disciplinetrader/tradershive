import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createEntry, journalKeys } from "@/lib/journal/api";
import { MARKET_OPTIONS } from "@/lib/journal/constants";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export function ManualEntryDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const openButton = trigger ? (
    <span onClick={() => setOpen(true)} role="button">{trigger}</span>
  ) : (
    <Button onClick={() => setOpen(true)} className="min-h-touch gradient-primary text-primary-foreground shadow-elegant">
      <Plus className="mr-1.5 h-4 w-4" /> Manual Journal
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {openButton}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="flex h-[92dvh] flex-col gap-0 rounded-t-2xl p-0 safe-bottom"
          >
            <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
              <SheetTitle>New journal entry</SheetTitle>
            </SheetHeader>
            <ManualForm onCreated={() => setOpen(false)} sticky />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openButton}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New journal entry</DialogTitle>
        </DialogHeader>
        <ManualForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ManualForm({ onCreated, sticky = false }: { onCreated: () => void; sticky?: boolean }) {
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
      return createEntry({
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      toast.success("Journal entry created");
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const fields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Pair</Label>
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. EUR/USD"
          required
          autoCapitalize="characters"
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Market</Label>
        <Select value={market} onValueChange={setMarket}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MARKET_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Direction</Label>
        <Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Entry</Label>
        <Input type="number" inputMode="decimal" step="any" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label>Exit</Label>
        <Input type="number" inputMode="decimal" step="any" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label>P/L</Label>
        <Input type="number" inputMode="decimal" step="any" value={pnl} onChange={(e) => setPnl(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label>RR</Label>
        <Input type="number" inputMode="decimal" step="0.01" value={rr} onChange={(e) => setRr(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Closed at</Label>
        <Input type="datetime-local" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} className="h-11" />
      </div>
    </div>
  );

  if (sticky) {
    return (
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{fields}</div>
        <div className="sticky bottom-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
          <Button
            type="submit"
            disabled={mut.isPending}
            className="min-h-touch w-full gradient-primary text-primary-foreground"
          >
            {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Create entry
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      {fields}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={mut.isPending} className="gradient-primary text-primary-foreground">
          {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Create entry
        </Button>
      </div>
    </form>
  );
}
