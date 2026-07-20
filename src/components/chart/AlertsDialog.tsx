import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listAlerts, saveAlert, deleteAlert } from "@/lib/chart/storage";
import type { AlertCondition, AlertType, ChartAlertRow } from "@/lib/chart/types";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; symbol: string; }

const ALERT_TYPES: AlertType[] = ["price_cross","indicator_cross","trend_line_break","volume_spike","session_open"];
const CONDITIONS: AlertCondition[] = ["above","below","cross_up","cross_down"];

export function AlertsDialog({ open, onOpenChange, symbol }: Props) {
  const [alerts, setAlerts] = useState<ChartAlertRow[]>([]);
  const [alertType, setAlertType] = useState<AlertType>("price_cross");
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [price, setPrice] = useState("");

  useEffect(() => { if (open) listAlerts().then(setAlerts); }, [open]);

  async function create() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const row = await saveAlert({
      user_id: data.user.id, symbol, alert_type: alertType, condition,
      target_price: price ? Number(price) : null, is_active: true,
    });
    if (row) { setAlerts((prev) => [row, ...prev]); toast.success("Alert created"); setPrice(""); }
  }
  async function remove(id: string) {
    await deleteAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Alerts · {symbol}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Type</Label>
            <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{ALERT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Condition</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as AlertCondition)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label className="text-xs">Target Price</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 1.0850" />
          </div>
        </div>
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded border border-border/60 p-2">
          {alerts.length ? alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-background/50">
              <span>{a.symbol} · {a.alert_type} {a.condition} {a.target_price ?? ""}</span>
              <button onClick={() => remove(a.id)} className="text-xs text-danger hover:underline">Delete</button>
            </div>
          )) : <div className="p-4 text-center text-xs text-muted-foreground">No alerts yet</div>}
        </div>
        <DialogFooter><Button onClick={create}>Create Alert</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
