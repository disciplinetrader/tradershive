/**
 * Symbol-scoped quick notes for the Trading Workspace 3.0 side panel.
 * Persisted to localStorage — no network round-trips.
 */
import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export function WorkspaceNotes({ symbol }: { symbol: string }) {
  const key = `thive.workspace.notes.${symbol}`;
  const [value, setValue] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setValue(window.localStorage.getItem(key) ?? "");
    } catch { /* ignore */ }
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(key, value);
        setSavedAt(new Date());
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [key, value]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider">
          <StickyNote className="h-3.5 w-3.5" /> Notes · {symbol}
        </span>
        {savedAt && (
          <span className="tabular-nums text-[10px]">
            Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Thoughts, bias, plan for ${symbol}…\nAutosaved to this device.`}
        className="min-h-0 flex-1 resize-none text-sm leading-relaxed"
      />
    </div>
  );
}
