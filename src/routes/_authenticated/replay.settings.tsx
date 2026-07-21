import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Keyboard, Layers, Palette, Settings2, RotateCcw } from "lucide-react";
import { useReplaySettings, type TradingMode } from "@/lib/replay/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/settings")({
  component: ReplaySettingsPage,
});

const SHORTCUTS = [
  ["Space", "Play / Pause"],
  ["→", "Next candle"],
  ["←", "Previous candle"],
  ["Shift + →", "Skip forward"],
  ["Shift + ←", "Skip back"],
  ["Ctrl + S", "Save Replay"],
  ["Ctrl + B", "Bookmark"],
];

function ReplaySettingsPage() {
  const { settings, updateSettings, resetSettings } = useReplaySettings();

  const modes: { key: TradingMode; title: string; desc: string }[] = [
    { key: "hedging", title: "Hedging", desc: "Multiple positions per symbol — long & short can co-exist." },
    { key: "netting", title: "Netting", desc: "One net position per symbol — opposite orders reduce/flip exposure." },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Replay Settings" description="Execution behavior, provider status and keyboard shortcuts." />

      <div className="grid gap-3 md:grid-cols-2">
        <GlassCard className="p-5 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4" /> Trading Mode</div>
            <Button size="sm" variant="ghost" onClick={resetSettings} className="h-7 px-2 text-xs">
              <RotateCcw className="mr-1 h-3 w-3" /> Reset defaults
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => updateSettings({ tradingMode: m.key })}
                className={cn(
                  "text-left rounded-xl border px-4 py-3 transition",
                  settings.tradingMode === m.key
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/50 bg-background/40 hover:border-border",
                )}
              >
                <div className="text-sm font-semibold">{m.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 pt-2">
            <div>
              <Label className="text-[11px]">Default Lot Size</Label>
              <Input type="number" step="0.01" min={0} value={settings.defaultLotSize}
                onChange={(e) => updateSettings({ defaultLotSize: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-[11px]">Default Risk %</Label>
              <Input type="number" step="0.1" min={0} value={settings.defaultRiskPct}
                onChange={(e) => updateSettings({ defaultRiskPct: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-[11px]">Spread (price)</Label>
              <Input type="number" step="0.00001" min={0} value={settings.spread}
                onChange={(e) => updateSettings({ spread: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label className="text-[11px]">Commission / Lot</Label>
              <Input type="number" step="0.01" min={0} value={settings.commissionPerLot}
                onChange={(e) => updateSettings({ commissionPerLot: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Changes apply immediately to any active Replay session — settings persist locally across reloads.
          </p>
        </GlassCard>

        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> Data Provider</div>
          <p className="text-xs text-muted-foreground">
            Replay uses a pluggable Market Data Provider layer. The current default is a deterministic synthetic
            provider so every replay of the same date/symbol looks identical.
          </p>
          <div className="rounded-lg bg-background/40 border border-border/40 px-3 py-2 text-xs">
            <span className="font-medium">Active provider:</span> synthetic
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> Appearance</div>
          <p className="text-xs text-muted-foreground">
            Replay Workspace follows the TradersHIVE Arena design system and reacts to your global theme.
          </p>
        </GlassCard>

        <GlassCard className="p-5 md:col-span-2">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3"><Keyboard className="h-4 w-4" /> Keyboard Shortcuts</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-background/40 border border-border/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{v}</span>
                <kbd className="rounded bg-background px-2 py-0.5 text-[10px] font-mono">{k}</kbd>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
