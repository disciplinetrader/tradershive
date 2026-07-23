import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Save,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { wordCount, stripHtml } from "@/lib/journal/format";

type Status = "idle" | "saving" | "saved";

/**
 * Lightweight rich-text notes editor using contentEditable + document.execCommand.
 * Emits debounced onSave with { html, text, words }.
 */
export function NotesEditor({
  initialHtml,
  onSave,
  minHeight = 220,
  placeholder = "Write your trade notes. What worked, what didn't, what to do next time…",
}: {
  initialHtml: string | null;
  onSave: (payload: { html: string; text: string; words: number }) => Promise<void> | void;
  minHeight?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [words, setWords] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootedRef = useRef(false);
  const savedSelectionRef = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (bootedRef.current) return;
    if (ref.current) {
      ref.current.innerHTML = initialHtml ?? "";
      setWords(wordCount(stripHtml(ref.current.innerHTML)));
      bootedRef.current = true;
    }
  }, [initialHtml]);

  const flush = useCallback(async () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    const text = stripHtml(html);
    setStatus("saving");
    try {
      await onSave({ html, text, words: wordCount(text) });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1600);
    } catch {
      setStatus("idle");
    }
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 900);
  }, [flush]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    handleInput();
  };

  const handleInput = () => {
    if (!ref.current) return;
    setWords(wordCount(stripHtml(ref.current.innerHTML)));
    scheduleSave();
  };

  const openLinkDialog = () => {
    const sel = window.getSelection();
    savedSelectionRef.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    setLinkUrl("");
    setLinkError(null);
    setLinkOpen(true);
  };

  const confirmLink = () => {
    const raw = linkUrl.trim();
    if (!raw) {
      setLinkError("Enter a URL to link to.");
      return;
    }
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      // eslint-disable-next-line no-new
      new URL(normalized);
    } catch {
      setLinkError("That doesn't look like a valid URL.");
      return;
    }
    ref.current?.focus();
    const saved = savedSelectionRef.current;
    if (saved) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(saved);
    }
    document.execCommand("createLink", false, normalized);
    handleInput();
    setLinkOpen(false);
  };

  const insertCodeBlock = () => {
    const sel = window.getSelection();
    const text = sel?.toString() || "code";
    document.execCommand(
      "insertHTML",
      false,
      `<pre><code>${escapeHtml(text)}</code></pre><p></p>`,
    );
    handleInput();
  };

  const insertHeader = (level: 1 | 2) => exec("formatBlock", `H${level}`);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="rounded-2xl border border-border/60 bg-surface/40">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 p-2">
        <ToolbarBtn label="Bold" onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Italic" onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Heading 1" onClick={() => insertHeader(1)}><Heading1 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Heading 2" onClick={() => insertHeader(2)}><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Bullet list" onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Ordered list" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Quote" onClick={() => exec("formatBlock", "BLOCKQUOTE")}><Quote className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Code block" onClick={insertCodeBlock}><Code2 className="h-3.5 w-3.5" /></ToolbarBtn>
        <ToolbarBtn label="Link" onClick={insertLink}><Link2 className="h-3.5 w-3.5" /></ToolbarBtn>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{words} word{words === 1 ? "" : "s"}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
              status === "saving" && "bg-primary/10 text-primary",
              status === "saved" && "bg-success/10 text-success",
              status === "idle" && "bg-muted/40 text-muted-foreground",
            )}
            aria-live="polite"
          >
            {status === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {status === "saving" ? "Saving" : status === "saved" ? "Saved" : "Autosave"}
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={flush} type="button">
            Save now
          </Button>
        </div>
      </div>

      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label="Trade notes"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={flush}
        data-placeholder={placeholder}
        className={cn(
          "prose prose-invert prose-sm max-w-none px-4 py-3 outline-none",
          "prose-headings:mt-4 prose-headings:font-semibold",
          "prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1",
          "prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground",
          "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5",
          "prose-pre:rounded-lg prose-pre:bg-muted/60 prose-pre:p-3",
          "prose-a:text-primary",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}

function ToolbarBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
