import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { useReplay } from "./context";

export function NotesPanel() {
  const { notes, addNote, removeNote, cursorTs } = useReplay();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const list = notes.filter((n) => !q || n.body.toLowerCase().includes(q.toLowerCase()));

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Notes</div>
      <div className="flex gap-2">
        <Input
          placeholder={`Note @ ${new Date(cursorTs).toISOString().slice(11, 16)}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && text.trim()) {
              await addNote(text);
              setText("");
            }
          }}
        />
        <Button
          size="sm"
          onClick={async () => { if (text.trim()) { await addNote(text); setText(""); } }}
        >
          Add
        </Button>
      </div>
      <Input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {list.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="group flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 p-2 text-xs"
            >
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground">
                  {new Date(n.note_ts).toISOString().replace("T", " ").slice(0, 16)}
                </div>
                <div>{n.body}</div>
              </div>
              <button onClick={() => removeNote(n.id)} className="opacity-0 group-hover:opacity-100 text-rose-400" aria-label="Delete note">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
          {list.length === 0 ? <div className="text-xs text-muted-foreground">No notes yet.</div> : null}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
