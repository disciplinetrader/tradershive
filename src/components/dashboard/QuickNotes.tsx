import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { deleteNote, listNotes, upsertNote } from "@/lib/dashboard.functions";
import { cn } from "@/lib/utils";

const MAX = 5000;

export function QuickNotes() {
  const qc = useQueryClient();
  const fetch = useServerFn(listNotes);
  const save = useServerFn(upsertNote);
  const del = useServerFn(deleteNote);

  const { data, isLoading } = useQuery({ queryKey: ["quick_notes"], queryFn: () => fetch() });
  const notes = data ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!activeId && notes.length > 0) {
      const first = notes[0];
      setActiveId(first.id);
      setTitle(first.title);
      setContent(first.content);
      setPinned(first.pinned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.length]);

  const saveMut = useMutation({
    mutationFn: (v: { id?: string; title: string; content: string; pinned: boolean }) =>
      save({ data: v }),
    onSuccess: (r) => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
      if (!activeId && r?.id) setActiveId(r.id);
      qc.invalidateQueries({ queryKey: ["quick_notes"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      setActiveId(null);
      setTitle("");
      setContent("");
      setPinned(false);
      qc.invalidateQueries({ queryKey: ["quick_notes"] });
    },
  });

  function scheduleAutosave(next: { title?: string; content?: string; pinned?: boolean }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveMut.mutate({
        id: activeId ?? undefined,
        title: next.title ?? title,
        content: next.content ?? content,
        pinned: next.pinned ?? pinned,
      });
    }, 700);
  }

  function openNote(id: string) {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    setActiveId(n.id);
    setTitle(n.title);
    setContent(n.content);
    setPinned(n.pinned);
  }

  function newNote() {
    setActiveId(null);
    setTitle("");
    setContent("");
    setPinned(false);
  }

  return (
    <div className="grid gap-3 md:grid-cols-[180px_1fr]">
      <div className="space-y-1">
        <Button size="sm" className="w-full justify-start gradient-primary text-primary-foreground" onClick={newNote}>
          <Plus className="mr-2 h-4 w-4" /> New note
        </Button>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)
          ) : notes.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No notes yet</p>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => openNote(n.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition",
                  activeId === n.id ? "bg-primary/10 text-primary" : "hover:bg-surface/60",
                )}
              >
                {n.pinned ? <Pin className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">{n.title || "Untitled"}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleAutosave({ title: e.target.value });
            }}
            placeholder="Note title"
            className="flex-1"
            maxLength={120}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              const v = !pinned;
              setPinned(v);
              scheduleAutosave({ pinned: v });
            }}
            aria-label={pinned ? "Unpin note" : "Pin note"}
          >
            {pinned ? <Pin className="h-4 w-4 text-primary" /> : <PinOff className="h-4 w-4" />}
          </Button>
          {activeId ? (
            <Button size="icon" variant="ghost" onClick={() => delMut.mutate(activeId)} aria-label="Delete note">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          ) : null}
        </div>
        <Textarea
          value={content}
          onChange={(e) => {
            const v = e.target.value.slice(0, MAX);
            setContent(v);
            scheduleAutosave({ content: v });
          }}
          placeholder="Write your setup, mistakes, lessons... Markdown supported."
          className="mt-2 min-h-[160px] font-mono text-sm"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{savedFlash ? "Saved" : saveMut.isPending ? "Saving…" : "Autosaves"}</span>
          <span className="font-mono tabular-nums">{content.length} / {MAX}</span>
        </div>
        {isLoading && notes.length === 0 ? (
          <EmptyState title="Loading notes" description="" className="mt-4" />
        ) : null}
      </div>
    </div>
  );
}
