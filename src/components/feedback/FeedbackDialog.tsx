/**
 * Feedback submission dialog — supports 5 feedback types (bug / feature / general
 * / question / compliment), automatic metadata capture, screenshot & recording
 * uploads (paste / drop / pick), reproduction steps, and satisfaction rating.
 *
 * Autosaves drafts per-type to localStorage. On success shows a Reference ID
 * (BUG-000123, FR-000123, ...) so users can quote it in support convos.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bug,
  Lightbulb,
  Star,
  HelpCircle,
  Heart,
  ImagePlus,
  Video,
  X,
  Plus,
  Loader2,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  submitBugReport,
  submitFeatureRequest,
  createFeedbackUploadUrl,
} from "@/lib/feedback.functions";
import { supabase } from "@/integrations/supabase/client";

export type FeedbackType = "bug" | "feature" | "general" | "question" | "compliment";

const TYPES: { id: FeedbackType; label: string; Icon: typeof Bug; hint: string }[] = [
  { id: "bug", label: "Report a bug", Icon: Bug, hint: "Something is broken or behaves unexpectedly" },
  { id: "feature", label: "Feature request", Icon: Lightbulb, hint: "Suggest a new capability" },
  { id: "general", label: "General feedback", Icon: Star, hint: "Share thoughts about the product" },
  { id: "question", label: "Ask a question", Icon: HelpCircle, hint: "Get help from the team" },
  { id: "compliment", label: "Compliment", Icon: Heart, hint: "Tell us what you love" },
];

const CATEGORIES = [
  { value: "replay_studio", label: "Replay Studio" },
  { value: "trading_workspace", label: "Trading Workspace" },
  { value: "journal", label: "Journal" },
  { value: "analytics", label: "Analytics" },
  { value: "ai_coach", label: "AI Coach" },
  { value: "performance", label: "Performance" },
  { value: "community", label: "Community" },
  { value: "billing", label: "Billing (future)" },
  { value: "other", label: "Other" },
];

const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024; // 100 MB
const DRAFT_KEY = "th_feedback_draft_v1";
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "beta";

type Attachment = { path: string; name: string; size: number; type: string; kind: "screenshot" | "recording" | "file" };

type Draft = {
  type: FeedbackType;
  title: string;
  description: string;
  expected_behavior: string;
  actual_behavior: string;
  severity: "critical" | "high" | "medium" | "low";
  category?: string;
  reproduction_steps: string[];
  why_valuable: string;
  user_priority: "nice_to_have" | "useful" | "important" | "critical";
  satisfaction_rating?: number;
  rating_comment?: string;
};

const emptyDraft = (type: FeedbackType): Draft => ({
  type,
  title: "",
  description: "",
  expected_behavior: "",
  actual_behavior: "",
  severity: "medium",
  category: undefined,
  reproduction_steps: [""],
  why_valuable: "",
  user_priority: "useful",
  satisfaction_rating: undefined,
  rating_comment: "",
});

function captureMetadata(currentRoute: string) {
  if (typeof window === "undefined") return { app_version: APP_VERSION, current_route: currentRoute };
  const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
  return {
    app_version: APP_VERSION,
    browser: navigator.userAgent.split(") ").at(-1) ?? navigator.userAgent.slice(0, 120),
    os: /Windows/.test(navigator.userAgent)
      ? "Windows"
      : /Mac/.test(navigator.userAgent)
        ? "macOS"
        : /Linux/.test(navigator.userAgent)
          ? "Linux"
          : /Android/.test(navigator.userAgent)
            ? "Android"
            : /iPhone|iPad|iPod/.test(navigator.userAgent)
              ? "iOS"
              : "unknown",
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    theme,
    current_route: currentRoute,
    current_url: window.location.href,
    user_agent: navigator.userAgent.slice(0, 500),
  };
}

export function FeedbackDialog({
  open,
  onOpenChange,
  initialType = "bug",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialType?: FeedbackType;
}) {
  const currentRoute = useRouterState({ select: (s) => s.location.pathname });
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialType));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ reference: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitBug = useServerFn(submitBugReport);
  const submitFeature = useServerFn(submitFeatureRequest);
  const createUpload = useServerFn(createFeedbackUploadUrl);

  // Load per-type draft when the type or dialog changes.
  useEffect(() => {
    if (!open) return;
    setConfirmation(null);
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}_${initialType}`);
      if (raw) setDraft({ ...emptyDraft(initialType), ...(JSON.parse(raw) as Draft), type: initialType });
      else setDraft(emptyDraft(initialType));
    } catch {
      setDraft(emptyDraft(initialType));
    }
    setAttachments([]);
  }, [open, initialType]);

  // Autosave draft
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(`${DRAFT_KEY}_${draft.type}`, JSON.stringify(draft));
      } catch { /* ignore quota errors */ }
    }, 400);
    return () => window.clearTimeout(id);
  }, [draft, open]);

  const setType = (type: FeedbackType) => {
    setDraft((d) => ({ ...emptyDraft(type), ...d, type }));
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}_${type}`);
      if (raw) setDraft({ ...emptyDraft(type), ...(JSON.parse(raw) as Draft), type });
    } catch { /* ignore */ }
  };

  const uploadFile = useCallback(
    async (file: File, kind: Attachment["kind"]) => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast.error(`File too large — max ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)}MB`);
        return;
      }
      setUploading(true);
      try {
        const { path, token } = await createUpload({
          data: { filename: file.name, content_type: file.type || "application/octet-stream", size: file.size },
        });
        const { error } = await supabase.storage
          .from("feedback-attachments")
          .uploadToSignedUrl(path, token, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw error;
        setAttachments((prev) => [...prev, { path, name: file.name, size: file.size, type: file.type, kind }]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [createUpload],
  );

  // Paste image support
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) void uploadFile(file, "screenshot");
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, uploadFile]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      for (const f of files) {
        const kind: Attachment["kind"] = f.type.startsWith("video/")
          ? "recording"
          : f.type.startsWith("image/")
            ? "screenshot"
            : "file";
        void uploadFile(f, kind);
      }
    },
    [uploadFile],
  );

  const handleSubmit = async () => {
    if (draft.title.trim().length < 3) {
      toast.error("Title is too short");
      return;
    }
    if (draft.description.trim().length < 1) {
      toast.error("Description is required");
      return;
    }
    setSubmitting(true);
    try {
      const metadata = captureMetadata(currentRoute);
      let result: { reference_code: string };
      if (draft.type === "feature") {
        result = (await submitFeature({
          data: {
            title: draft.title.trim(),
            description: draft.description.trim(),
            why_valuable: draft.why_valuable.trim(),
            user_priority: draft.user_priority,
            category: draft.category as any,
            attachments,
            metadata,
          },
        })) as any;
      } else {
        result = (await submitBug({
          data: {
            type: draft.type,
            title: draft.title.trim(),
            description: draft.description.trim(),
            expected_behavior: draft.expected_behavior.trim(),
            actual_behavior: draft.actual_behavior.trim(),
            severity: draft.severity,
            category: draft.category as any,
            reproduction_steps: draft.reproduction_steps.map((s) => s.trim()).filter(Boolean),
            satisfaction_rating: draft.satisfaction_rating,
            rating_comment: draft.rating_comment?.trim() || undefined,
            attachments,
            metadata,
          },
        })) as any;
      }
      localStorage.removeItem(`${DRAFT_KEY}_${draft.type}`);
      setConfirmation({ reference: result.reference_code });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const showBugFields = draft.type === "bug" || draft.type === "general" || draft.type === "question";
  const showFeatureFields = draft.type === "feature";
  const showRating = draft.type === "compliment" || draft.type === "general";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Help us make TradersHIVE better. Press <kbd className="rounded bg-muted px-1 text-xs">Ctrl</kbd>+
            <kbd className="rounded bg-muted px-1 text-xs">Shift</kbd>+<kbd className="rounded bg-muted px-1 text-xs">B</kbd> to open this anytime.
          </DialogDescription>
        </DialogHeader>

        {confirmation ? (
          <ConfirmationView reference={confirmation.reference} onClose={() => onOpenChange(false)} />
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-5 space-y-5">
              {/* Type picker */}
              <Tabs value={draft.type} onValueChange={(v) => setType(v as FeedbackType)}>
                <TabsList className="grid grid-cols-5 h-auto p-1 gap-1">
                  {TYPES.map(({ id, Icon, label }) => (
                    <TabsTrigger key={id} value={id} className="flex flex-col items-center gap-1 py-2 text-xs">
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">{label.split(" ")[0]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground -mt-3">
                {TYPES.find((t) => t.id === draft.type)?.hint}
              </p>

              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="fb-title">Title *</Label>
                <Input
                  id="fb-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={draft.type === "bug" ? "Chart TP handle doesn't update after drag" : "Short summary"}
                  maxLength={200}
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="fb-desc">Description *</Label>
                <Textarea
                  id="fb-desc"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={4}
                  maxLength={5000}
                  placeholder={
                    draft.type === "compliment"
                      ? "Tell us what you love…"
                      : "What happened? What were you trying to do?"
                  }
                />
              </div>

              {/* Category + severity/priority */}
              {(showBugFields || showFeatureFields) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select
                      value={draft.category ?? ""}
                      onValueChange={(v) => setDraft({ ...draft, category: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select a module" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {showBugFields && (
                    <div className="space-y-1.5">
                      <Label>Severity</Label>
                      <Select
                        value={draft.severity}
                        onValueChange={(v) => setDraft({ ...draft, severity: v as Draft["severity"] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical — blocks work</SelectItem>
                          <SelectItem value="high">High — major issue</SelectItem>
                          <SelectItem value="medium">Medium — annoying</SelectItem>
                          <SelectItem value="low">Low — minor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {showFeatureFields && (
                    <div className="space-y-1.5">
                      <Label>Priority for you</Label>
                      <Select
                        value={draft.user_priority}
                        onValueChange={(v) => setDraft({ ...draft, user_priority: v as Draft["user_priority"] })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nice_to_have">Nice to have</SelectItem>
                          <SelectItem value="useful">Useful</SelectItem>
                          <SelectItem value="important">Important</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Bug-specific fields */}
              {draft.type === "bug" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="fb-exp">Expected behavior</Label>
                      <Textarea
                        id="fb-exp"
                        rows={3}
                        maxLength={2000}
                        value={draft.expected_behavior}
                        onChange={(e) => setDraft({ ...draft, expected_behavior: e.target.value })}
                        placeholder="What should have happened?"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fb-act">Actual behavior</Label>
                      <Textarea
                        id="fb-act"
                        rows={3}
                        maxLength={2000}
                        value={draft.actual_behavior}
                        onChange={(e) => setDraft({ ...draft, actual_behavior: e.target.value })}
                        placeholder="What actually happened?"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Steps to reproduce</Label>
                    {draft.reproduction_steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                        <Input
                          value={step}
                          maxLength={500}
                          onChange={(e) => {
                            const next = [...draft.reproduction_steps];
                            next[i] = e.target.value;
                            setDraft({ ...draft, reproduction_steps: next });
                          }}
                          placeholder={i === 0 ? "Open Trading Workspace" : `Step ${i + 1}`}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove step ${i + 1}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              reproduction_steps: draft.reproduction_steps.filter((_, idx) => idx !== i),
                            })
                          }
                          disabled={draft.reproduction_steps.length <= 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft({ ...draft, reproduction_steps: [...draft.reproduction_steps, ""] })}
                      disabled={draft.reproduction_steps.length >= 20}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add step
                    </Button>
                  </div>
                </>
              )}

              {/* Feature-specific */}
              {showFeatureFields && (
                <div className="space-y-1.5">
                  <Label htmlFor="fb-why">Why is this valuable?</Label>
                  <Textarea
                    id="fb-why"
                    rows={3}
                    maxLength={2000}
                    value={draft.why_valuable}
                    onChange={(e) => setDraft({ ...draft, why_valuable: e.target.value })}
                    placeholder="What problem does this solve for you?"
                  />
                </div>
              )}

              {/* Rating */}
              {showRating && (
                <div className="space-y-2">
                  <Label>How satisfied are you?</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Rate ${n} out of 5`}
                        onClick={() => setDraft({ ...draft, satisfaction_rating: n })}
                        className="rounded p-1 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <Star
                          className={cn(
                            "h-6 w-6",
                            (draft.satisfaction_rating ?? 0) >= n
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Attachments</Label>
                  <span className="text-xs text-muted-foreground">Drop / paste / pick — up to 100 MB</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <ImagePlus className="h-4 w-4 mr-1" /> Screenshot / file
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const el = document.createElement("input");
                      el.type = "file";
                      el.accept = "video/*";
                      el.onchange = () => {
                        const f = el.files?.[0];
                        if (f) void uploadFile(f, "recording");
                      };
                      el.click();
                    }}
                    disabled={uploading}
                  >
                    <Video className="h-4 w-4 mr-1" /> Screen recording
                  </Button>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFile(f, f.type.startsWith("image/") ? "screenshot" : "file");
                    e.target.value = "";
                  }}
                />
                {attachments.length > 0 && (
                  <ul className="space-y-1">
                    {attachments.map((a) => (
                      <li key={a.path} className="flex items-center justify-between text-sm rounded border border-border px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="secondary" className="text-[10px] uppercase">{a.kind}</Badge>
                          <span className="truncate">{a.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(a.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${a.name}`}
                          onClick={() => setAttachments((prev) => prev.filter((x) => x.path !== a.path))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Auto-attached context notice */}
              <div className="text-xs text-muted-foreground rounded border border-dashed border-border p-2">
                We auto-attach your browser, OS, viewport, timezone, theme, and current route ({currentRoute}) to
                help us reproduce issues. No passwords or trade data are included.
              </div>
            </div>
          </ScrollArea>
        )}

        {!confirmation && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || uploading}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit feedback
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmationView({ reference, onClose }: { reference: string; onClose: () => void }) {
  return (
    <div className="p-10 flex flex-col items-center text-center gap-4">
      <div className="h-14 w-14 rounded-full bg-success/15 grid place-items-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Thank you!</h3>
        <p className="text-sm text-muted-foreground">We've received your feedback and the team will review it.</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex items-center gap-3">
        <span className="text-xs uppercase text-muted-foreground">Reference ID</span>
        <code className="font-mono text-sm">{reference}</code>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Copy reference ID"
          onClick={() => {
            void navigator.clipboard.writeText(reference);
            toast.success("Copied");
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}
