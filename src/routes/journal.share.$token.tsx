import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Lock } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSharedEntry, type JournalEntry } from "@/lib/journal/api";
import { batchSignUrls, JOURNAL_IMAGES_BUCKET } from "@/lib/journal/storage";
import { GRADE_COLOR } from "@/lib/journal/constants";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "@/lib/journal/format";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export const Route = createFileRoute("/journal/share/$token")({
  head: () => ({
    meta: [
      { title: `Shared trade — ${APP_NAME}` },
      { name: "description", content: "A publicly shared trade review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedTradePage,
});

function SharedTradePage() {
  const { token } = Route.useParams();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const e = await fetchSharedEntry(token);
        if (!mounted) return;
        if (!e) {
          setError("This shared trade is unavailable or has been revoked.");
        } else {
          setEntry(e);
          if (e.screenshots?.length) {
            const map = await batchSignUrls(JOURNAL_IMAGES_BUCKET, e.screenshots);
            if (mounted) setUrls(map);
          }
        }
      } catch (err) {
        if (mounted) setError((err as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] gradient-radial-glow opacity-40" />
      <div className="relative mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm">
            <a href="/"><ArrowLeft className="mr-1.5 h-4 w-4" /> {APP_NAME}</a>
          </Button>
          <Badge variant="outline">Public share</Badge>
        </div>

        {loading ? (
          <GlassCard className="p-8 text-center text-sm text-muted-foreground">Loading…</GlassCard>
        ) : error ? (
          <GlassCard className="p-8 text-center text-sm text-rose-300">
            <Lock className="mx-auto mb-3 h-5 w-5" />
            {error}
          </GlassCard>
        ) : entry ? (
          <SharedEntry entry={entry} urls={urls} />
        ) : null}
      </div>
    </div>
  );
}

function SharedEntry({ entry, urls }: { entry: JournalEntry; urls: Record<string, string> }) {
  const pnl = Number(entry.pnl ?? 0);
  const primary = entry.screenshots?.[0] ? urls[entry.screenshots[0]] : null;
  return (
    <>
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{entry.symbol ?? "Trade"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(entry.closed_at ?? entry.created_at)}
              {entry.duration_seconds ? ` · ${formatDuration(entry.duration_seconds)}` : ""}
              {entry.direction ? ` · ${entry.direction.toUpperCase()}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className={cn("font-mono text-xl font-bold", pnl > 0 && "text-emerald-400", pnl < 0 && "text-rose-400")}>
              {entry.pnl != null ? formatCurrency(pnl) : "—"}
            </p>
            {entry.rr != null ? <p className="text-xs text-muted-foreground">{formatNumber(Number(entry.rr), 2)}R</p> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.grade ? <Badge className={cn("border font-semibold", GRADE_COLOR[entry.grade])}>{entry.grade}</Badge> : null}
          {entry.setup ? <Badge variant="outline">{entry.setup.replace(/_/g, " ")}</Badge> : null}
          {entry.session ? <Badge variant="outline" className="capitalize">{entry.session}</Badge> : null}
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        {primary ? (
          <img src={primary} alt="Trade screenshot" className="w-full object-contain" />
        ) : (
          <div className="grid h-64 place-items-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Camera className="h-5 w-5" />
              No screenshot shared
            </div>
          </div>
        )}
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2">
        {(entry.screenshots ?? []).slice(1).map((path) => (
          <img key={path} src={urls[path]} alt="Screenshot" className="w-full rounded-2xl object-cover" />
        ))}
      </div>

      {entry.notes_html ? (
        <GlassCard className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Notes</h2>
          <div
            className="prose prose-invert prose-sm mt-3 max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitize(entry.notes_html) }}
          />
        </GlassCard>
      ) : null}

      {entry.emotions?.length || entry.mistakes?.length ? (
        <GlassCard className="p-6">
          {entry.emotions?.length ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Emotions</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.emotions.map((e) => (
                  <span key={e} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{e.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          ) : null}
          {entry.mistakes?.length ? (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Mistakes</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.mistakes.map((m) => (
                  <span key={m} className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">{m.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          ) : null}
        </GlassCard>
      ) : null}

      <p className="pb-8 text-center text-xs text-muted-foreground">
        Sensitive account information has been hidden. Powered by {APP_NAME}.
      </p>
    </>
  );
}

/** Very small allowlist sanitizer for shared HTML notes. */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "")
    .replace(/ on[a-z]+='[^']*'/gi, "");
}
