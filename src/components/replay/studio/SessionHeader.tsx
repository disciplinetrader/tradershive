/**
 * Phase 8B · Studio header — identity, dataset provenance, autosave, lifecycle.
 * Read-only projection of engine selectors; no state of its own.
 */
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CloudOff, Database, Loader2, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useReplayStudio } from "./context";

function relative(ts: number): string {
  if (!ts) return "not yet";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

export function AutosaveIndicator() {
  const { view } = useReplayStudio();
  if (!view) return null;
  const { state, savedAt, revision } = view.autosave;
  const map = {
    idle: { icon: CheckCircle2, text: "Saved", tone: "text-emerald-500" },
    dirty: { icon: Save, text: "Unsaved changes", tone: "text-muted-foreground" },
    saving: { icon: Loader2, text: "Saving…", tone: "text-primary" },
    error: { icon: CloudOff, text: "Save failed — retrying", tone: "text-destructive" },
  } as const;
  const { icon: Icon, text, tone } = map[state];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${tone}`}>
          <Icon className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`} />
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Revision {revision} · last saved {relative(savedAt)}
      </TooltipContent>
    </Tooltip>
  );
}

export function SessionHeader() {
  const { view, saveNow, finish, warnings, resumed, resumedAtCursor } = useReplayStudio();
  if (!view) return null;
  const d = view.dataset;
  const lifecycle = view.transport.lifecycle;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-card/40 px-3 py-2">
      <Link to="/replay/library" className="text-xs text-muted-foreground hover:text-foreground">
        ← Library
      </Link>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{view.meta.title}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Database className="h-3 w-3" />
          <span>{d.label}</span>
          <span>· {d.provider}</span>
          <span>· {d.bars.toLocaleString()} bars</span>
          <span>· {d.timezone}</span>
          <span className="font-mono">#{d.checksum}</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {d.isSynthetic ? <Badge variant="destructive">Synthetic data</Badge> : null}
        {d.gaps > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="gap-1">
                <TriangleAlert className="h-3 w-3" /> {d.gaps} gap{d.gaps === 1 ? "" : "s"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {warnings[0] ?? "Missing bars detected across the range."}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {resumed ? (
          <Badge variant="outline" className="gap-1">
            <RefreshCw className="h-3 w-3" /> Resumed at {resumedAtCursor.toLocaleString()}
          </Badge>
        ) : null}
        <Badge variant="outline" className="capitalize">{lifecycle}</Badge>
        <AutosaveIndicator />
        <Button size="sm" variant="ghost" onClick={saveNow}>Save</Button>
        <Button size="sm" variant="secondary" onClick={finish} disabled={lifecycle === "completed"}>
          Finish
        </Button>
      </div>
    </header>
  );
}
