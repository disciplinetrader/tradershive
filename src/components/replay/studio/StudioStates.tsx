/**
 * Phase 8B · Studio states — loading, unavailable dataset, refused dataset,
 * discarded snapshot and completion. Never a blank screen, never fake data.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Database, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useReplayStudio } from "./context";

export function StudioLoading() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verifying dataset and restoring session state…
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="min-h-0 flex-1" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

export function StudioBlockedView() {
  const { blocked, retry } = useReplayStudio();
  if (!blocked) return null;
  return (
    <div className="m-6 max-w-xl space-y-4 rounded-md border border-border/60 bg-card/40 p-6">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-destructive" />
        <h1 className="text-base font-medium">{blocked.title}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{blocked.message}</p>
      {blocked.errors.length ? (
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {blocked.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={retry}>Retry</Button>
        <Button asChild variant="secondary"><Link to="/replay/library">Back to library</Link></Button>
      </div>
    </div>
  );
}

/** Shown when a saved snapshot existed but could not be trusted. */
export function SnapshotDiscardedNotice() {
  const { discarded } = useReplayStudio();
  if (!discarded) return null;
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Saved progress could not be restored</AlertTitle>
      <AlertDescription>{discarded.message} The session restarted from the first bar.</AlertDescription>
    </Alert>
  );
}

export function SessionCompleteNotice() {
  const { view, trades } = useReplayStudio();
  if (view?.transport.lifecycle !== "completed") return null;
  return (
    <Alert className="rounded-none border-x-0 border-t-0">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Session complete</AlertTitle>
      <AlertDescription>
        {trades.length} closed trade{trades.length === 1 ? "" : "s"} recorded. State is saved and resumable on any device.
      </AlertDescription>
    </Alert>
  );
}
