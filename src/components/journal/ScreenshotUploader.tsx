/**
 * Journal V2 — Multi-screenshot uploader.
 *
 * Handles drag-drop, paste, and click-to-add. Each screenshot supports a
 * caption ("Before entry", "After exit"…) and category tag. Order is
 * preserved via `sort_order` on the DB row.
 *
 * The uploader defers the actual upload until the parent has an entry id;
 * for the create flow it stages files client-side and returns them via
 * `onStagedChange`. For the edit flow it uploads immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadJournalImage } from "@/lib/journal/storage";

export type StagedScreenshot = {
  id: string;         // client-side id
  file: File;
  previewUrl: string; // object URL for preview
  caption: string;
  category: string;
};

export const SCREENSHOT_CATEGORIES = [
  { value: "context", label: "Higher timeframe context" },
  { value: "setup", label: "Setup / signal" },
  { value: "entry", label: "Entry" },
  { value: "management", label: "In-trade management" },
  { value: "exit", label: "Exit" },
  { value: "post_mortem", label: "Post-mortem" },
  { value: "other", label: "Other" },
] as const;

const MAX_FILES = 8;
const MAX_SIZE = 15 * 1024 * 1024;

export function ScreenshotUploader({
  staged,
  onStagedChange,
  disabled = false,
}: {
  staged: StagedScreenshot[];
  onStagedChange: (next: StagedScreenshot[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Revoke object URLs when unmounting or when files change.
  useEffect(() => {
    return () => staged.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const room = MAX_FILES - staged.length;
      if (room <= 0) {
        toast.error(`Up to ${MAX_FILES} screenshots per entry`);
        return;
      }
      const toAdd: StagedScreenshot[] = [];
      for (const f of arr.slice(0, room)) {
        if (!f.type.startsWith("image/")) { toast.error(`${f.name}: not an image`); continue; }
        if (f.size > MAX_SIZE) { toast.error(`${f.name}: over 15 MB`); continue; }
        toAdd.push({
          id: `stg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
          caption: "",
          category: "setup",
        });
      }
      if (toAdd.length) onStagedChange([...staged, ...toAdd]);
    },
    [staged, onStagedChange],
  );

  // Support paste-from-clipboard while the uploader is mounted.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files: File[] = [];
      for (const item of e.clipboardData?.items ?? []) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f && f.type.startsWith("image/")) files.push(f);
        }
      }
      if (files.length) addFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  function updateField(id: string, patch: Partial<StagedScreenshot>) {
    onStagedChange(staged.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function remove(id: string) {
    const target = staged.find((s) => s.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onStagedChange(staged.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/60 hover:bg-accent/40",
          disabled ? "pointer-events-none opacity-50" : "",
        ].join(" ")}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <div>
          <span className="font-medium text-foreground">Drop screenshots</span>
          <span className="text-muted-foreground"> · click to browse · paste from clipboard</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Up to {MAX_FILES} images · 15 MB each · {staged.length}/{MAX_FILES} added
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {staged.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {staged.map((s, idx) => (
            <li key={s.id} className="flex gap-3 rounded-md border border-border/60 bg-card/60 p-2">
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded bg-muted">
                <img src={s.previewUrl} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">
                  {idx + 1}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input
                  value={s.caption}
                  onChange={(e) => updateField(s.id, { caption: e.target.value })}
                  placeholder="Caption (optional)"
                  className="h-8 text-xs"
                  maxLength={140}
                />
                <div className="flex items-center gap-2">
                  <Select value={s.category} onValueChange={(v) => updateField(s.id, { category: v })}>
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCREENSHOT_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(s.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-danger"
                    aria-label="Remove screenshot"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Upload staged screenshots and persist attachment rows in order. */
export async function persistStagedScreenshots(
  userId: string,
  entryId: string,
  staged: StagedScreenshot[],
): Promise<void> {
  if (!staged.length) return;
  const { recordAttachment } = await import("@/lib/journal/api");
  let sortOrder = 0;
  for (const s of staged) {
    try {
      const uploaded = await uploadJournalImage(userId, entryId, s.file);
      await recordAttachment({
        entry_id: entryId,
        user_id: userId,
        bucket: uploaded.bucket,
        path: uploaded.path,
        kind: "image",
        mime_type: s.file.type || null,
        size_bytes: s.file.size,
        caption: s.caption || null,
        category: s.category || null,
        sort_order: sortOrder,
      });
      sortOrder += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(`${s.file.name}: ${message}`);
    }
  }
}

/** Small utility used by loader indicator. */
export function UploadingIndicator({ label = "Uploading screenshots…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> {label}
    </div>
  );
}
