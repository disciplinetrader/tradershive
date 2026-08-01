/**
 * Phase 8B / Phase A · Studio top strip — identity, dataset provenance, live
 * account HUD, autosave and lifecycle. Read-only projection of engine
 * selectors; no state of its own beyond the exit dialog.
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, CloudOff, Database, Loader2, LogOut, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountHud } from "./AccountHud";
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
  const { icon: Icon, text, tone } = map[state as keyof typeof map] ?? map.idle;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${tone}`}>
          <Icon className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`} />
          <span className="hidden xl:inline">{text}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Revision {revision} · last saved {relative(savedAt)}
      </TooltipContent>
    </Tooltip>
  );
}

export function SessionHeader() {
  const { view, saveNow, finish, warnings, resumed, resumedAtCursor, pause } = useReplayStudio();
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  const confirmExit = async () => {
    setExiting(true);
    try {
      pause();
      saveNow();
    } finally {
      setExiting(false);
      setExitOpen(false);
      // The session stays saved and resumable — we simply hand the trader
      // straight to their stats for the backtest they just left.
      void navigate({ to: "/replay/performance" });
    }
  };

  if (!view) return null;
  const d = view.dataset;
  const lifecycle = view.transport.lifecycle;

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border/60 bg-card/50 px-3">
      <Link
        to="/replay/library"
        className="shrink-0 text-[11px] text-muted-foreground transition hover:text-foreground"
      >
        ← Library
      </Link>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="truncate text-[13px] font-semibold">{d.label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Database className="h-3 w-3" />
              {d.provider}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {view.meta.title} · {d.bars.toLocaleString()} bars · {d.timezone} · checksum #{d.checksum}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="mx-auto shrink-0">
        <AccountHud />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {d.isSynthetic ? <Badge variant="destructive" className="h-5 text-[10px]">Synthetic</Badge> : null}
        {d.gaps > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="h-5 gap-1 text-[10px]">
                <TriangleAlert className="h-3 w-3" /> {d.gaps}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {warnings[0] ?? "Missing bars detected across the range."}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {resumed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                <RefreshCw className="h-3 w-3" /> Resumed
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom">Resumed at observation {resumedAtCursor.toLocaleString()}</TooltipContent>
          </Tooltip>
        ) : null}
        <Badge variant="outline" className="h-5 text-[10px] capitalize">{lifecycle}</Badge>
        <AutosaveIndicator />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={saveNow}>Save</Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[11px]"
          onClick={finish}
          disabled={lifecycle === "completed"}
        >
          Finish
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => setExitOpen(true)}>
          <LogOut className="h-3.5 w-3.5" /> Exit
        </Button>
      </div>

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit this replay session?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress is saved. The session stays in Saved Sessions and you can resume exactly
              where you left off. We'll take you to Performance so you can review this backtest now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep trading</AlertDialogCancel>
            <AlertDialogAction disabled={exiting} onClick={(e) => { e.preventDefault(); void confirmExit(); }}>
              Save &amp; exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
