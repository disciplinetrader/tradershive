/**
 * Position Actions — modify SL/TP, partial close, break-even, reverse,
 * trailing stop attachment. Wraps OrderManager and returns immediately.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrderManager } from "@/lib/order-management";
import type { Position } from "@/lib/trading-engine";

export type PositionActionsProps = {
  manager: OrderManager;
  position: Position;
  onChange?: () => void;
};

export function PositionActions({ manager, position, onChange }: PositionActionsProps) {
  const [sl, setSl] = useState<number | "">(position.stop_loss ?? "");
  const [tp, setTp] = useState<number | "">(position.take_profit ?? "");
  const [trailDist, setTrailDist] = useState<number>(0.0020);

  function refresh(): void { onChange?.(); }

  return (
    <div className="space-y-2 rounded-md border bg-card p-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Stop Loss</Label>
          <Input type="number" step="0.00001" value={sl}
            onChange={(e) => setSl(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-[10px]">Take Profit</Label>
          <Input type="number" step="0.00001" value={tp}
            onChange={(e) => setTp(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
      </div>
      <Button size="sm" variant="secondary" className="w-full"
        onClick={() => { manager.modifyStops(position.id, {
          stop_loss: sl === "" ? null : Number(sl),
          take_profit: tp === "" ? null : Number(tp),
        }); refresh(); }}
      >Update Stops</Button>

      <div className="grid grid-cols-4 gap-1">
        {[0.25, 0.50, 0.75, 1.0].map((f) => (
          <Button key={f} size="sm" variant="outline"
            onClick={() => { manager.partialClose(position.id, f); refresh(); }}
          >{Math.round(f * 100)}%</Button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1">
        <Button size="sm" variant="outline" onClick={() => { manager.breakEven(position.id); refresh(); }}>
          Break Even
        </Button>
        <Button size="sm" variant="outline" onClick={() => { manager.reverse(position.id); refresh(); }}>
          Reverse
        </Button>
        <Button size="sm" variant="destructive" onClick={() => { manager.close(position.id); refresh(); }}>
          Close
        </Button>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-[10px]">Trailing (distance)</Label>
          <Input type="number" step="0.0001" value={trailDist}
            onChange={(e) => setTrailDist(Number(e.target.value))} />
        </div>
        <Button size="sm" variant="outline"
          onClick={() => manager.attachTrailing(position.id, { method: "distance", distance: trailDist })}
        >Attach</Button>
      </div>
    </div>
  );
}
