import { useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { BOOKMARK_CATEGORIES } from "@/lib/replay/constants";
import type { BookmarkCategory } from "@/lib/replay/types";
import { useReplay } from "./context";

export function BookmarksPanel() {
  const { bookmarks, addBookmark, removeBookmark, setCursorIdx, candles } = useReplay();
  const [label, setLabel] = useState("");
  const [cat, setCat] = useState<BookmarkCategory>("good_setup");

  const jump = (ts: string) => {
    const t = new Date(ts).getTime();
    const idx = candles.findIndex((c) => c.time >= t);
    if (idx >= 0) setCursorIdx(idx);
  };

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Bookmarks</div>
      <div className="grid grid-cols-3 gap-1">
        {BOOKMARK_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className="rounded-md px-1 py-1 text-[10px] font-medium border transition"
            style={{
              borderColor: cat === c.id ? c.color : "transparent",
              background: cat === c.id ? c.color + "20" : "transparent",
              color: cat === c.id ? c.color : "rgb(148,163,184)",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button
          size="sm"
          onClick={async () => {
            if (label.trim()) { await addBookmark(label, cat); setLabel(""); }
            else { await addBookmark(BOOKMARK_CATEGORIES.find((b) => b.id === cat)!.label, cat); }
          }}
        >
          <Bookmark className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
        {bookmarks.map((b) => {
          const meta = BOOKMARK_CATEGORIES.find((c) => c.id === b.category);
          return (
            <div key={b.id} className="group flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: meta?.color ?? "#94a3b8" }} />
              <button onClick={() => jump(b.bookmark_ts)} className="flex-1 truncate text-left hover:text-primary">
                {b.label}
              </button>
              <span className="text-[10px] text-muted-foreground">{new Date(b.bookmark_ts).toISOString().slice(11, 16)}</span>
              <button onClick={() => removeBookmark(b.id)} className="opacity-0 group-hover:opacity-100 text-danger">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {bookmarks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-3 py-4 text-center">
            <div className="text-xs font-medium text-foreground">No bookmarks yet</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Pick a category, then click the bookmark button to pin this candle. Jump back anytime from the timeline.
            </div>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
