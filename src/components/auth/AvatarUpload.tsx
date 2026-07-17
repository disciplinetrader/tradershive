import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { uploadAvatar } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function AvatarUpload({
  fallbackText,
  size = 96,
}: {
  fallbackText: string;
  size?: number;
}) {
  const { profile, user, refresh } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File | null | undefined) => {
    if (!file || !user) return;
    setBusy(true);
    try {
      const { url } = await uploadAvatar(user.id, file);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Avatar updated");
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => handleFile(e.target.files?.[0]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Avatar removed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative rounded-full transition-all",
          dragOver && "ring-2 ring-primary ring-offset-4 ring-offset-background",
        )}
        style={{ width: size, height: size }}
      >
        <Avatar className="h-full w-full border border-border shadow-elegant">
          <AvatarImage src={profile?.avatar_url ?? undefined} alt="Avatar" />
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-2xl font-bold text-primary-foreground">
            {fallbackText}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-0"
          aria-label="Change avatar"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </button>
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm font-semibold">Profile picture</p>
        <p className="text-xs text-muted-foreground">
          Drag &amp; drop an image, or click below. PNG or JPG, up to 5&nbsp;MB.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="glass"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </Button>
          {profile?.avatar_url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onChange}
      />
    </div>
  );
}
