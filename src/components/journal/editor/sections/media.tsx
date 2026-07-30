/**
 * Media section — screenshots and attachments, reusing the journal storage
 * helpers so uploads behave identically to the trade story media strip.
 */
import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { uploadJournalFile } from "@/lib/journal/storage";
import { useTradeEditorContext } from "../TradeEditorProvider";
import { SubHeading } from "../fields";

export function MediaSection() {
  const { entry, setField } = useTradeEditorContext();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const shots = entry.screenshots ?? [];

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10MB`);
          continue;
        }
        const url = await uploadJournalFile(user.id, entry.id, file);
        if (url) urls.push(url);
      }
      if (urls.length) setField({ screenshots: [...shots, ...urls] });
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (url: string) => setField({ screenshots: shots.filter((s) => s !== url) });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SubHeading>Screenshots ({shots.length})</SubHeading>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer.files);
        }}
        className="rounded border border-dashed border-border/60 bg-muted/5 p-2.5"
      >
        {shots.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shots.map((url) => (
              <div key={url} className="group relative overflow-hidden rounded border border-border/50">
                <img src={url} alt="Trade screenshot" loading="lazy" className="h-24 w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove screenshot"
                  onClick={() => remove(url)}
                  className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3 text-danger" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-[11px] text-muted-foreground">
            Drop chart screenshots here, or use Upload. Evidence makes a review worth re-reading.
          </p>
        )}
      </div>
    </div>
  );
}
