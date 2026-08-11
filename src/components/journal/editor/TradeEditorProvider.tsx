/**
 * TradeEditorProvider — the single editing brain.
 *
 * Owns: local draft state, changed-field tracking, debounced autosave via the
 * shared `useAutosave` hook, stale-version (conflict) detection, validation,
 * source awareness and the active section. Quick, full and inline surfaces all
 * consume this context, so they can never diverge.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAutosave, type AutosaveStatus } from "@/hooks/use-autosave";
import {
  journalKeys,
  recordHistory,
  setEntryTagValues,
  updateEntry,
  type EntryUpdate,
  type JournalEntry,
} from "@/lib/journal/api";
import {
  entryOrigin,
  extrasPatch,
  fieldSource,
  isFieldLocked,
  narrativePatch,
  readExtras,
  type EditorExtras,
  type EntryOrigin,
  type FieldSource,
  type SectionId,
} from "@/lib/journal/editor/model";
import { validateEntry, type ValidationIssue } from "@/lib/journal/editor/validation";
import { derivedPatch } from "@/lib/journal/derive";
import type { Narrative } from "@/lib/journal/story";
import {
  clearLocalDraft,
  loadLastSection,
  loadLocalDraft,
  saveLastSection,
  saveLocalDraft,
} from "./store";

type Patch = Record<string, unknown>;

type Conflict = {
  remoteUpdatedAt: string;
  pending: Patch;
} | null;

type Ctx = {
  entry: JournalEntry;
  /** Draft = server row + everything typed but not yet acknowledged. */
  origin: EntryOrigin;
  status: AutosaveStatus;
  lastSavedAt: number | null;
  dirty: boolean;
  issues: ValidationIssue[];
  section: SectionId;
  setSection: (s: SectionId) => void;
  correctionsUnlocked: boolean;
  setCorrectionsUnlocked: (v: boolean) => void;
  /** Write one or more journal_entries columns. */
  setField: (patch: EntryUpdate) => void;
  /**
   * Write the entry's tags of one kind.
   *
   * `emotions[]`, `mistakes[]` and `strategy_tags[]` are trigger-maintained
   * projections of `journal_entry_tags` — writing them through `setField`
   * would be overwritten by the trigger on the next tag change. Tag edits go
   * through the join table and the arrays repaint themselves.
   */
  setTagValues: (kind: "setup" | "mistake" | "emotion", values: string[]) => Promise<void>;
  /** Write narrative jsonb sections (keeps legacy columns mirrored). */
  setNarrative: (patch: Narrative) => void;
  /** Write structured plan/review values stored inside narrative.x */
  setExtras: (patch: EditorExtras) => void;
  extras: EditorExtras;
  flush: () => Promise<void>;
  sourceOf: (field: string) => FieldSource;
  lockedOf: (field: string) => boolean;
  conflict: Conflict;
  resolveConflict: (choice: "mine" | "theirs") => Promise<void>;
};

const TradeEditorContext = createContext<Ctx | null>(null);

export function useTradeEditorContext(): Ctx {
  const ctx = useContext(TradeEditorContext);
  if (!ctx) throw new Error("useTradeEditorContext must be used inside TradeEditorProvider");
  return ctx;
}

export function TradeEditorProvider({
  entryId,
  initialSection,
  children,
}: {
  entryId: string;
  initialSection?: SectionId;
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // Reuse the row already in cache when a page fetched it — no extra refetch.
  const entryQuery = useQuery({
    queryKey: journalKeys.entry(entryId),
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_entries").select("*").eq("id", entryId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as JournalEntry | null;
    },
    staleTime: 30_000,
  });

  const server = entryQuery.data ?? null;

  const [local, setLocal] = useState<JournalEntry | null>(null);
  const [section, setSectionState] = useState<SectionId>(() => initialSection ?? loadLastSection());
  const [correctionsUnlocked, setCorrectionsUnlocked] = useState(false);
  const [conflict, setConflict] = useState<Conflict>(null);
  const [dirty, setDirty] = useState(false);

  const baselineRef = useRef<string | null>(null);
  const changedRef = useRef<Patch>({});

  // Hydrate local draft from the server row, restoring any unsaved text left
  // behind by a crash / refresh.
  useEffect(() => {
    if (!server) return;
    setLocal((prev) => {
      if (prev && prev.id === server.id) {
        // Server refreshed underneath us — keep unsaved fields on top.
        return { ...server, ...changedRef.current } as JournalEntry;
      }
      const recovered = loadLocalDraft(server.id);
      if (recovered && Object.keys(recovered).length) {
        changedRef.current = recovered;
        setDirty(true);
        toast.info("Restored unsaved changes from your last session");
        return { ...server, ...recovered } as JournalEntry;
      }
      return server;
    });
    if (!baselineRef.current) baselineRef.current = server.updated_at;
  }, [server]);

  const setSection = useCallback((s: SectionId) => {
    setSectionState(s);
    saveLastSection(s);
  }, []);

  /* ---------------- autosave ---------------- */

  const writePatch = useCallback(
    async (patch: Patch) => {
      if (!Object.keys(patch).length) return;

      // Stale-version guard: someone (broker sync, replay, another tab) may
      // have written since we loaded. Never overwrite blindly.
      const { data: head } = await supabase
        .from("journal_entries")
        .select("updated_at")
        .eq("id", entryId)
        .maybeSingle();
      const remote = head?.updated_at as string | undefined;
      if (remote && baselineRef.current && remote !== baselineRef.current) {
        setConflict({ remoteUpdatedAt: remote, pending: patch });
        throw new Error("This trade changed elsewhere — review before saving.");
      }

      // Canonical derivation: recompute R (and anything else derived) in the
      // same write, so no surface can read a stale win/loss or R value.
      const base = (qc.getQueryData<JournalEntry | null>(journalKeys.entry(entryId)) ?? server) as JournalEntry | null;
      const withDerived = base
        ? ({ ...patch, ...derivedPatch(base, patch as EntryUpdate) } as Patch)
        : patch;

      const next = await updateEntry(entryId, withDerived as EntryUpdate);
      baselineRef.current = next.updated_at;
      changedRef.current = {};
      clearLocalDraft(entryId);
      setDirty(false);

      qc.setQueryData(journalKeys.entry(entryId), next);
      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (prev) =>
        prev ? prev.map((e) => (e.id === next.id ? next : e)) : prev,
      );
      setLocal((prev) => (prev && prev.id === next.id ? next : prev));
      // Roll-ups (overview, calendar, analytics, Hive Score, improvement,
      // replay comparison) all derive from these keys — refresh them together
      // so a win→loss edit can never leave a stale aggregate behind.
      void qc.invalidateQueries({ queryKey: journalKeys.all });
      if (user) {
        void recordHistory({
          entryId,
          userId: user.id,
          action: "updated",
          snapshot: Object.keys(withDerived) as never,
        }).catch(() => {});
      }
    },
    [entryId, qc, server, user],
  );


  const autosave = useAutosave<Patch>(writePatch, { delay: 800 });

  const queue = useCallback(
    (patch: Patch) => {
      if (!Object.keys(patch).length) return;
      changedRef.current = { ...changedRef.current, ...patch };
      saveLocalDraft(entryId, changedRef.current);
      setDirty(true);
      setLocal((prev) => (prev ? ({ ...prev, ...patch } as JournalEntry) : prev));
      autosave.save(patch);
    },
    [autosave, entryId],
  );

  const setField = useCallback((patch: EntryUpdate) => queue(patch as Patch), [queue]);

  const setTagValues = useCallback(
    async (kind: "setup" | "mistake" | "emotion", values: string[]) => {
      if (!user) return;
      await setEntryTagValues({ entryId, userId: user.id, kind, values });
      // The array column is repainted by the trigger, so re-read rather than
      // patching it locally — the DB is authoritative for these three fields.
      await qc.invalidateQueries({ queryKey: journalKeys.entry(entryId) });
      await qc.invalidateQueries({ queryKey: journalKeys.list() });
    },
    [entryId, qc, user],
  );

  const setNarrative = useCallback(
    (patch: Narrative) => {
      if (!local) return;
      queue(narrativePatch(local, patch) as Patch);
    },
    [local, queue],
  );

  const setExtras = useCallback(
    (patch: EditorExtras) => {
      if (!local) return;
      queue(extrasPatch(local, patch) as Patch);
    },
    [local, queue],
  );

  /* ---------------- conflict resolution ---------------- */

  const resolveConflict = useCallback(
    async (choice: "mine" | "theirs") => {
      const c = conflict;
      if (!c) return;
      if (choice === "theirs") {
        setConflict(null);
        changedRef.current = {};
        clearLocalDraft(entryId);
        setDirty(false);
        baselineRef.current = c.remoteUpdatedAt;
        await qc.invalidateQueries({ queryKey: journalKeys.entry(entryId) });
        toast.message("Loaded the newer version of this trade");
        return;
      }
      // Keep mine: accept the remote version as the new baseline and replay
      // every locally-changed field on top of it.
      baselineRef.current = c.remoteUpdatedAt;
      setConflict(null);
      const patch = { ...c.pending, ...changedRef.current };
      try {
        await writePatch(patch);
        toast.success("Your changes were applied on top of the newer version");
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [conflict, entryId, qc, writePatch],
  );

  /* ---------------- derived ---------------- */

  const issues = useMemo(() => (local ? validateEntry(local) : []), [local]);
  const origin = useMemo(() => (local ? entryOrigin(local) : "manual"), [local]);
  const extras = useMemo(() => (local ? readExtras(local) : {}), [local]);

  const sourceOf = useCallback(
    (field: string) => (local ? fieldSource(local, field) : "manual"),
    [local],
  );
  const lockedOf = useCallback(
    (field: string) => (local ? isFieldLocked(local, field, correctionsUnlocked) : false),
    [local, correctionsUnlocked],
  );

  // Flush before the tab dies so nothing typed is lost.
  useEffect(() => {
    const onHide = () => {
      if (changedRef.current && Object.keys(changedRef.current).length) void autosave.flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [autosave]);

  const value = useMemo<Ctx | null>(() => {
    if (!local) return null;
    return {
      entry: local,
      origin,
      status: autosave.status,
      lastSavedAt: autosave.lastSavedAt,
      dirty,
      issues,
      section,
      setSection,
      correctionsUnlocked,
      setCorrectionsUnlocked,
      setField,
      setTagValues,
      setNarrative,
      setExtras,
      extras,
      flush: autosave.flush,
      sourceOf,
      lockedOf,
      conflict,
      resolveConflict,
    };
  }, [
    local,
    origin,
    autosave.status,
    autosave.lastSavedAt,
    autosave.flush,
    dirty,
    issues,
    section,
    setSection,
    correctionsUnlocked,
    setField,
    setTagValues,
    setNarrative,
    setExtras,
    extras,
    sourceOf,
    lockedOf,
    conflict,
    resolveConflict,
  ]);

  if (!value) {
    return (
      <div className="space-y-2 p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
        <div className="h-24 w-full animate-pulse rounded bg-muted/20" />
      </div>
    );
  }

  return <TradeEditorContext.Provider value={value}>{children}</TradeEditorContext.Provider>;
}
