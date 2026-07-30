/**
 * TradeEditorShell — the one visual container for editing a trade.
 *
 * Full mode  : right-side sheet, section rail, everything editable.
 * Quick mode : compact centred dialog with the fields traders actually touch
 *              right after a trade, plus a one-click escalation to Full.
 * Both modes render the same section components from the same provider.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Maximize2,
  Search,
  X,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { EDITOR_SECTIONS, ORIGIN_LABEL, type SectionId } from "@/lib/journal/editor/model";
import { issueCounts } from "@/lib/journal/editor/validation";
import { generateJournalTitle } from "@/lib/journal/auto-title";
import { useTradeEditorContext } from "./TradeEditorProvider";
import { closeTradeEditor, setTradeEditorMode, type EditorMode } from "./store";
import { TradeSection, PlanSection, ExecutionSection, ReviewSection, AdvancedSection } from "./sections/core";
import { PsychologySection } from "./sections/psychology";
import { PlaybookSection } from "./sections/playbook";
import { MistakesSection } from "./sections/mistakes";
import { MediaSection } from "./sections/media";
import { NarrativeSection } from "./sections/narrative";

const SECTION_COMPONENT: Record<SectionId, () => React.ReactElement> = {
  trade: TradeSection,
  plan: PlanSection,
  execution: ExecutionSection,
  review: ReviewSection,
  psychology: PsychologySection,
  playbook: PlaybookSection,
  mistakes: MistakesSection,
  media: MediaSection,
  narrative: NarrativeSection,
  advanced: AdvancedSection,
};

/* ------------------------------------------------------------------ */

function SaveIndicator() {
  const { status, dirty, lastSavedAt } = useTradeEditorContext();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-danger">
        <AlertTriangle className="h-3 w-3" /> Not saved
      </span>
    );
  }
  if (dirty) return <span className="text-[11px] text-muted-foreground">Unsaved changes…</span>;
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3 text-emerald-400" />
      {lastSavedAt ? `Saved ${relative(lastSavedAt)}` : "All changes saved"}
    </span>
  );
}

function relative(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function ConflictBanner() {
  const { conflict, resolveConflict } = useTradeEditorContext();
  if (!conflict) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2">
      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
      <span className="text-[11px] text-foreground">
        This trade changed elsewhere (broker sync or another tab) while you were editing.
      </span>
      <div className="ml-auto flex gap-1.5">
        <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => void resolveConflict("theirs")}>
          Use their version
        </Button>
        <Button size="sm" className="h-6 text-[11px]" onClick={() => void resolveConflict("mine")}>
          Keep my changes
        </Button>
      </div>
    </div>
  );
}

function IssueSummary() {
  const { issues, setSection } = useTradeEditorContext();
  const counts = useMemo(() => issueCounts(issues), [issues]);
  if (!issues.length) return null;
  const first = issues.find((i) => i.level === "error") ?? issues[0];
  return (
    <button
      type="button"
      onClick={() => setSection(first.section)}
      className="flex w-full items-center gap-2 border-b border-border/50 bg-muted/10 px-3 py-1.5 text-left hover:bg-muted/20"
    >
      {counts.error ? (
        <Badge variant="outline" className="h-4 border-danger/50 bg-danger/10 px-1 text-[10px] text-danger">
          {counts.error} error{counts.error > 1 ? "s" : ""}
        </Badge>
      ) : null}
      {counts.warning + counts.calc ? (
        <Badge variant="outline" className="h-4 border-warning/50 bg-warning/10 px-1 text-[10px] text-warning">
          {counts.warning + counts.calc} to check
        </Badge>
      ) : null}
      {counts.missing ? (
        <span className="text-[10px] text-muted-foreground">{counts.missing} missing</span>
      ) : null}
      <span className="truncate text-[11px] text-muted-foreground">{first.message}</span>
      <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

/* ------------------------------------------------------------------ */

function SectionRail() {
  const { section, setSection, issues } = useTradeEditorContext();
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return EDITOR_SECTIONS;
    return EDITOR_SECTIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(term) ||
        s.hint.toLowerCase().includes(term) ||
        s.keywords.some((k) => k.includes(term)),
    );
  }, [q]);

  return (
    <div className="flex w-[168px] shrink-0 flex-col border-r border-border/50 bg-muted/5">
      <div className="relative p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a field"
          aria-label="Find a field"
          className="h-7 pl-7 text-[11px]"
        />
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-0.5 p-1.5 pt-0">
          {visible.map((s) => {
            const errs = issues.filter((i) => i.section === s.id && i.level === "error").length;
            const warns = issues.filter((i) => i.section === s.id && i.level !== "error" && i.level !== "missing").length;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[12px] transition",
                  section === s.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                )}
              >
                <span className="truncate">{s.label}</span>
                {errs ? (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-label={`${errs} errors`} />
                ) : warns ? (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-label={`${warns} warnings`} />
                ) : null}
              </button>
            );
          })}
          {!visible.length ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">No matching section.</p>
          ) : null}
        </nav>
      </ScrollArea>
    </div>
  );
}

function EditorHeader({ mode }: { mode: EditorMode }) {
  const { entry, origin, flush } = useTradeEditorContext();
  const title = useMemo(() => generateJournalTitle(entry), [entry]);

  return (
    <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-[13px] font-semibold text-foreground">{title}</h2>
          <Badge variant="outline" className="h-4 shrink-0 border-border/60 px-1 text-[9px] uppercase text-muted-foreground">
            {ORIGIN_LABEL[origin]}
          </Badge>
        </div>
        <SaveIndicator />
      </div>
      <div className="ml-auto flex items-center gap-1">
        {mode === "quick" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => setTradeEditorMode("full")}
          >
            <Maximize2 className="h-3 w-3" /> Full edit
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="Close editor"
          onClick={() => { void flush().finally(closeTradeEditor); }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const QUICK_SECTIONS: SectionId[] = ["review", "mistakes", "psychology", "narrative"];

function QuickBody() {
  const { section, setSection } = useTradeEditorContext();
  const active = QUICK_SECTIONS.includes(section) ? section : "review";
  const Body = SECTION_COMPONENT[active];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-border/50 px-3 py-1.5">
        {QUICK_SECTIONS.map((id) => {
          const def = EDITOR_SECTIONS.find((s) => s.id === id)!;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                "rounded px-2 py-1 text-[11px] transition",
                active === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {def.label}
            </button>
          );
        })}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <Body />
        </div>
      </ScrollArea>
    </div>
  );
}

function FullBody() {
  const { section } = useTradeEditorContext();
  const Body = SECTION_COMPONENT[section];
  const def = EDITOR_SECTIONS.find((s) => s.id === section)!;
  return (
    <div className="flex min-h-0 flex-1">
      <SectionRail />
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <div>
            <h3 className="text-[12px] font-semibold text-foreground">{def.label}</h3>
            <p className="text-[11px] text-muted-foreground">{def.hint}</p>
          </div>
          <Body />
        </div>
      </ScrollArea>
    </div>
  );
}

export function TradeEditorShell({ mode }: { mode: EditorMode }) {
  const { flush } = useTradeEditorContext();

  const close = () => {
    void flush().finally(closeTradeEditor);
  };

  const content = (
    <>
      <EditorHeader mode={mode} />
      <ConflictBanner />
      <IssueSummary />
      {mode === "quick" ? <QuickBody /> : <FullBody />}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          Everything autosaves. Esc closes.
        </span>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={close}>
          Done
        </Button>
      </div>
    </>
  );

  if (mode === "quick") {
    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="flex h-[80vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="flex w-full max-w-[860px] flex-col gap-0 p-0 sm:max-w-[860px]">
        {content}
      </SheetContent>
    </Sheet>
  );
}
