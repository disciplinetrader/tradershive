import { useEffect, useRef, useState } from "react";
import { Command, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline expandable search field.
 *
 * Desktop (sm+): renders as a full-width pill that opens the command palette
 * on click (keeps ⌘K muscle memory).
 * Mobile: renders as a compact icon that expands into an inline text input
 * with autofocus, and collapses when emptied and blurred. Typing calls
 * `onQuery(term)`; submitting (Enter) calls `onSubmit(term)` and finally
 * opens the full command palette so users can pick a result.
 */
export function InlineSearch({
  onOpenPalette,
  onQuery,
  placeholder = "Search trades, journals, users…",
  isMac,
}: {
  onOpenPalette: () => void;
  onQuery?: (q: string) => void;
  placeholder?: string;
  isMac?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) {
      // Focus next frame so the width transition doesn't fight the keyboard.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [expanded]);

  const handleBlur = () => {
    if (!term.trim()) setExpanded(false);
  };

  return (
    <>
      {/* Desktop pill (opens palette) */}
      <button
        onClick={onOpenPalette}
        aria-label="Open search"
        className="group hidden min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-surface focus:outline-none focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/40 sm:flex sm:h-11"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{placeholder}</span>
        <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-md border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground sm:inline-flex">
          <Command className="h-3 w-3" aria-hidden />
          {isMac ? "K" : "Ctrl K"}
        </span>
      </button>

      {/* Mobile expandable */}
      <div
        className={cn(
          "flex min-w-0 items-center transition-all duration-200 sm:hidden",
          expanded ? "flex-1" : "flex-none",
        )}
      >
        {expanded ? (
          <div className="flex h-11 w-full items-center gap-1 rounded-xl border border-border bg-surface/70 px-2 focus-within:border-primary/50">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                onQuery?.(e.target.value);
              }}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onOpenPalette();
                }
                if (e.key === "Escape") {
                  setTerm("");
                  setExpanded(false);
                }
              }}
              enterKeyHint="search"
              inputMode="search"
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none focus-visible:outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTerm("");
                setExpanded(false);
              }}
              aria-label="Close search"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Search"
            className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface/60 text-muted-foreground transition hover:text-foreground"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </>
  );
}
