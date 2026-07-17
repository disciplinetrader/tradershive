import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Keyboard, Layers, Palette } from "lucide-react";

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
  return (
    <div className="space-y-4">
      <PageHeader title="Replay Settings" description="Preferences, provider status and keyboard shortcuts." />

      <div className="grid gap-3 md:grid-cols-2">
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4" /> Data Provider</div>
          <p className="text-xs text-muted-foreground">
            Replay uses a pluggable Market Data Provider layer. The current default is a deterministic synthetic
            provider so every replay of the same date/symbol looks identical. TradingView Replay API, broker feeds,
            tick-by-tick and DOM providers can be plugged in without touching the engine or UI.
          </p>
          <div className="rounded-lg bg-background/40 border border-border/40 px-3 py-2 text-xs">
            <span className="font-medium">Active provider:</span> synthetic
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> Appearance</div>
          <p className="text-xs text-muted-foreground">
            Replay Workspace is dark-mode only and follows the TradersHIVE Arena design system.
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
