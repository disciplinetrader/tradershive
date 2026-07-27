import { Bug } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { useQaMode } from "@/lib/qa-mode";

/**
 * Settings → Developer Mode toggle. Only renders when the current viewer is an
 * admin OR the app is running in dev; the QA Mode panel itself is gated the
 * same way in `QaModePanel`, so ordinary end users never see either surface.
 */
export function QaModeSection() {
  const { available, enabled, toggle } = useQaMode();
  if (!available) return null;
  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Bug className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Developer Mode</h2>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Show a floating QA panel with API response times, render metrics,
              console errors, React warnings, missing images and broken links.
              Only visible to admins and in development builds.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => toggle(v)} aria-label="Toggle Developer Mode" />
      </div>
    </GlassCard>
  );
}
