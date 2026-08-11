/**
 * NOTEBOOK — /journal/notebook
 *
 * Notes that are not about one trade: folders, templates, search, and an
 * optional attachment to either an entry or a date range (never both — see
 * `lib/journal/notebook.ts`).
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pin, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useJournalEntries } from "@/lib/journal/source-filter";
import {
  NOTE_TEMPLATES,
  UNFILED,
  attachmentOf,
  attachmentPatch,
  deleteNote,
  fetchNotes,
  folderOf,
  foldersOf,
  notebookKeys,
  searchNotes,
  upsertNote,
  type Note,
} from "@/lib/journal/notebook";
import { routeBoundaries } from "@/lib/route-boundaries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/notebook")({
  head: () => ({
    meta: [
      { title: "Notebook — TradersHIVE" },
      { name: "description", content: "Folders, templates and searchable notes — for the thinking that is not about one trade." },
    ],
  }),
  component: Notebook,
  ...routeBoundaries({
    label: "Notebook",
    boundary: "journal_notebook_route",
    backHref: "/journal",
    backLabel: "Back to Journal",
  }),
});

function Notebook() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const notesQuery = useQuery({ queryKey: notebookKeys.list(), queryFn: fetchNotes });
  const entries = useJournalEntries().data ?? [];

  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const notes = notesQuery.data ?? [];
  const folders = useMemo(() => foldersOf(notes), [notes]);
  const visible = useMemo(() => {
    const searched = searchNotes(notes, q);
    return folder ? searched.filter((n) => folderOf(n) === folder) : searched;
  }, [notes, q, folder]);

  const open = notes.find((n) => n.id === openId) ?? null;

  const save = useMutation({
    mutationFn: (n: Partial<Note> & { id?: string }) => {
      if (!user) throw new Error("Not signed in");
      // Built explicitly rather than spread-and-cast: `upsertNote` needs
      // user_id/title/content present, and a cast here would hide the day one
      // of them stops being supplied.
      return upsertNote({
        ...n,
        id: n.id,
        user_id: user.id,
        title: n.title ?? "Untitled",
        content: n.content ?? "",
      });
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: notebookKeys.list() });
      setOpenId(n.id);
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Could not save"),
  });

  const remove = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notebookKeys.list() });
      setOpenId(null);
      toast.success("Note deleted");
    },
  });

  const create = (templateId: string) => {
    const t = NOTE_TEMPLATES.find((x) => x.id === templateId) ?? NOTE_TEMPLATES[2];
    save.mutate({
      title: t.id === "blank" ? "Untitled" : t.label,
      content: t.body,
      template: t.id,
      folder: folder ?? null,
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <GlassCard className="space-y-3 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" className="pl-9" />
          </div>
          <Select onValueChange={create}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="New note from template…" />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5" /> {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1">
            <FolderChip active={folder === null} onClick={() => setFolder(null)}>All</FolderChip>
            {[...folders, UNFILED].map((f) => (
              <FolderChip key={f} active={folder === f} onClick={() => setFolder(f)}>{f}</FolderChip>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-2">
          {visible.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {notes.length === 0 ? "No notes yet — start from a template above." : "Nothing matches."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {visible.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(n.id)}
                    className={cn(
                      "w-full px-2 py-2 text-left transition-colors hover:bg-accent/40",
                      openId === n.id && "bg-accent/60",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {n.pinned ? <Pin className="h-3 w-3 text-warning" /> : null}
                      <span className="truncate">{n.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {folderOf(n)} · {new Date(n.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {open ? (
        <NoteEditor
          key={open.id}
          note={open}
          entries={entries}
          onSave={(patch) => save.mutate({ ...patch, id: open.id })}
          onDelete={() => remove.mutate(open.id)}
          saving={save.isPending}
        />
      ) : (
        <GlassCard className="p-8">
          <EmptyState
            icon={FileText}
            title="Nothing open"
            description="Pick a note, or start one from a template. Notes here are for the thinking that is not about a single trade — weekly recaps, rules, post-mortems."
          />
        </GlassCard>
      )}
    </div>
  );
}

function NoteEditor({
  note,
  entries,
  onSave,
  onDelete,
  saving,
}: {
  note: Note;
  entries: { id: string; symbol: string | null; closed_at: string | null }[];
  onSave: (patch: Partial<Note>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [folder, setFolder] = useState(note.folder ?? "");
  const att = attachmentOf(note);
  const [kind, setKind] = useState<"none" | "entry" | "range">(att.kind);
  const [entryId, setEntryId] = useState(att.kind === "entry" ? att.entryId : "");
  const [start, setStart] = useState(att.kind === "range" ? att.start : "");
  const [end, setEnd] = useState(att.kind === "range" ? att.end : "");

  const submit = () =>
    onSave({
      title: title.trim() || "Untitled",
      content,
      folder: folder.trim() || null,
      ...attachmentPatch(
        kind === "entry" && entryId
          ? { kind: "entry", entryId }
          : kind === "range" && start && end
            ? { kind: "range", start, end }
            : { kind: "none" },
      ),
    });

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 flex-1 text-sm font-semibold" />
        <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder" className="h-9 w-[140px]" />
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onSave({ pinned: !note.pinned })} aria-label="Pin note">
          <Pin className={cn("h-4 w-4", note.pinned && "fill-warning text-warning")} />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-danger" onClick={onDelete} aria-label="Delete note">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">About</span>
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nothing specific</SelectItem>
            <SelectItem value="entry">A trade</SelectItem>
            <SelectItem value="range">A date range</SelectItem>
          </SelectContent>
        </Select>
        {kind === "entry" ? (
          <Select value={entryId} onValueChange={setEntryId}>
            <SelectTrigger className="h-8 w-[240px]"><SelectValue placeholder="Pick a trade" /></SelectTrigger>
            <SelectContent>
              {entries.slice(0, 50).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.symbol ?? "Untitled"} · {e.closed_at?.slice(0, 10) ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {kind === "range" ? (
          <>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-[150px]" />
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-[150px]" />
          </>
        ) : null}
        {att.kind === "entry" ? (
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link to="/journal/$entryId" params={{ entryId: att.entryId }}>Open trade</Link>
          </Button>
        ) : null}
      </div>

      <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[420px] font-mono text-xs" />

      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving} className="gradient-primary text-primary-foreground">
          {saving ? "Saving…" : "Save note"}
        </Button>
      </div>
    </GlassCard>
  );
}

function FolderChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
