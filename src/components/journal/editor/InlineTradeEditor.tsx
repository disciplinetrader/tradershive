/**
 * Inline editing mode — the same editor brain rendered in-page, scoped to a
 * single section. Used where a full sheet would be overkill (e.g. reviewing a
 * trade directly inside a list or the story page).
 */
import { useState } from "react";
import { ChevronDown, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EDITOR_SECTIONS, type SectionId } from "@/lib/journal/editor/model";
import { TradeEditorProvider, useTradeEditorContext } from "./TradeEditorProvider";
import { openTradeEditor } from "./store";
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

function InlineBody({ section }: { section: SectionId }) {
  const { status, dirty, entry } = useTradeEditorContext();
  const Body = SECTION_COMPONENT[section];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {status === "saving" ? "Saving…" : dirty ? "Unsaved…" : "Saved"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 text-[11px]"
          onClick={() => openTradeEditor(entry.id, "full", section)}
        >
          <PencilLine className="h-3 w-3" /> Open full editor
        </Button>
      </div>
      <Body />
    </div>
  );
}

export function InlineTradeEditor({
  entryId,
  section,
  defaultOpen = false,
  className,
}: {
  entryId: string;
  section: SectionId;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const def = EDITOR_SECTIONS.find((s) => s.id === section)!;

  return (
    <div className={cn("rounded border border-border/50 bg-muted/5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[12px] font-medium text-foreground">Edit {def.label.toLowerCase()}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t border-border/40 p-3">
          <TradeEditorProvider entryId={entryId} initialSection={section}>
            <InlineBody section={section} />
          </TradeEditorProvider>
        </div>
      ) : null}
    </div>
  );
}
