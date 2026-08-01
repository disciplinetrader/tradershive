/**
 * Phase 8D · screenshot gallery. Images live in a private bucket, so each
 * thumbnail is fetched through a short-lived signed URL.
 */
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { screenshotUrl } from "@/lib/replay/review/screenshot";

export interface ScreenshotRow {
  id: string;
  storage_path: string;
  caption: string | null;
  captured_ts: string;
  symbol?: string | null;
  timeframe?: string | null;
}

function Shot({ row }: { row: ScreenshotRow }) {
  const { data: url } = useQuery({
    queryKey: ["replay", "screenshot-url", row.storage_path],
    queryFn: () => screenshotUrl(row.storage_path),
    staleTime: 30 * 60_000,
  });
  return (
    <figure className="overflow-hidden rounded-md border border-border/60">
      {url ? (
        <img src={url} alt={row.caption ?? `Replay chart captured ${row.captured_ts}`} loading="lazy" className="w-full" />
      ) : (
        <div className="h-32 animate-pulse bg-muted/40" />
      )}
      <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
        {row.caption ?? new Date(row.captured_ts).toLocaleString()}
      </figcaption>
    </figure>
  );
}

export function ScreenshotGallery({ rows }: { rows: ScreenshotRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-4 text-xs text-muted-foreground">
        No screenshots captured. Use “Capture chart” in the Studio review panel to save the visible bars — future
        candles are never included.
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => <Shot key={r.id} row={r} />)}
    </div>
  );
}
