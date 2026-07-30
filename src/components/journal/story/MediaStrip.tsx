/**
 * Screenshot filmstrip. Upload, paste and drag-drop reuse the existing
 * journal storage helpers; there is no new annotation engine here.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { updateEntry, journalKeys, type JournalEntry } from "@/lib/journal/api";
import { uploadJournalImage } from "@/lib/journal/storage";
import { MissingData } from "./primitives";
import { cn } from "@/lib/utils";

export function MediaStrip({
  entry,
  userId,
  urls,
  uploadRef,
}: {
  entry: JournalEntry;
  userId: string | null;
  urls: Record<string, string>;
  uploadRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const paths = entry.screenshots ?? [];

  if (uploadRef) uploadRef.current = () => inputRef.current?.click();

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!userId) throw new Error("You need to be signed in to upload.");
      const added: string[] = [];
      for (const f of files.slice(0, 6)) {
        const res = await uploadJournalImage(userId, entry.id, f);
        added.push(res.path);
      }
      await updateEntry(entry.id, { screenshots: [...paths, ...added] });
      return added.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} screenshot${count === 1 ? "" : "s"} added`);
      qc.invalidateQueries({ queryKey: journalKeys.entry(entry.id) });
    },
    onError: (e) => toast.error((e as Error)?.message ?? "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: (path: string) => updateEntry(entry.id, { screenshots: paths.filter((p) => p !== path) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: journalKeys.entry(entry.id) }),
    onError: (e) => toast.error((e as Error)?.message ?? "Could not remove screenshot"),
  });

  const reorder = useMutation({
    mutationFn: (next: string[]) => updateEntry(entry.id, { screenshots: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: journalKeys.entry(entry.id) }),
  });

  const move = (path: string, dir: -1 | 1) => {
    const i = paths.indexOf(path);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= paths.length) return;
    const next = [...paths];
    [next[i], next[j]] = [next[j], next[i]];
    reorder.mutate(next);
  };

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) upload.mutate(files);
    },
    [upload],
  );

  return (
    <div
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length) upload.mutate(files);
      }}
      className={cn("space-y-2 rounded-md", dragOver && "outline-dashed outline-1 outline-primary/50")}
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) upload.mutate(files);
          e.target.value = "";
        }}
      />

      {paths.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {paths.map((p, i) => (
            <div key={p} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => urls[p] && setLightbox(urls[p])}
                className="block h-20 w-32 overflow-hidden rounded border border-border/50 bg-muted/20"
              >
                {urls[p] ? (
                  <img src={urls[p]} alt={`Screenshot ${i + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">Loading…</span>
                )}
              </button>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/80 px-1 text-[9px] opacity-0 transition group-hover:opacity-100">
                <span className="text-muted-foreground">{i === 0 ? "Before entry" : i === paths.length - 1 ? "Exit" : `Slot ${i + 1}`}</span>
                <span className="flex gap-0.5">
                  <button type="button" onClick={() => move(p, -1)} aria-label="Move earlier">←</button>
                  <button type="button" onClick={() => move(p, 1)} aria-label="Move later">→</button>
                  <button type="button" className="text-danger" onClick={() => remove.mutate(p)} aria-label="Remove"><X className="h-3 w-3" /></button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <MissingData
          label="No screenshots. Paste, drop or upload one — the chart moment is the evidence."
          action={
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => inputRef.current?.click()}>
              <Camera className="mr-1 h-3 w-3" /> Add
            </Button>
          }
        />
      )}

      {paths.length ? (
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1 h-3 w-3" /> {upload.isPending ? "Uploading…" : "Add screenshot"}
        </Button>
      ) : null}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl border-border/60 bg-background/95 p-3">
          {lightbox ? <img src={lightbox} alt="Screenshot" className="max-h-[80vh] w-full rounded object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
