import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  createEntry,
  deleteTaxonomy,
  fetchTaxonomy,
  journalKeys,
  upsertTaxonomy,
  type EntryInsert,
  type JournalTaxonomy,
} from "@/lib/journal/api";
import {
  DEFAULT_EMOTIONS,
  DEFAULT_MISTAKES,
  DEFAULT_SETUPS,
  DIRECTION_OPTIONS,
  MARKET_OPTIONS,
  SESSION_OPTIONS,
} from "@/lib/journal/constants";
import {
  findInstrument,
  validatePrice,
  type InstrumentRecord,
} from "@/lib/journal/instruments";
import { detectSession, detectTimezone } from "@/lib/journal/session-detect";
import {
  clearDraft,
  computeCompleteness,
  computePips,
  formatDuration,
  loadDefaults,
  loadDraft,
  loadSectionState,
  saveDefaults,
  saveDraft,
  saveSectionState,
  type JournalDraft,
} from "@/lib/journal/draft";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { InstrumentSearchInput } from "./InstrumentSearchInput";
import {
  ScreenshotUploader,
  persistStagedScreenshots,
  type StagedScreenshot,
} from "./ScreenshotUploader";

/* -------------------------------------------------------------------------- */
/*  Dialog shell (bottom sheet on mobile, modal on desktop)                    */
/* -------------------------------------------------------------------------- */

export type PrefillTrade = Partial<{
  symbol: string;
  market: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  pnl: number;
  rr: number;
  opened_at: string;
  closed_at: string;
}>;

export function ManualEntryDialog({
  trigger,
  prefill,
  autoOpen = false,
}: {
  trigger?: React.ReactNode;
  prefill?: PrefillTrade;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const isMobile = useIsMobile();

  const openButton = trigger ? (
    <span onClick={() => setOpen(true)} role="button">{trigger}</span>
  ) : (
    <Button
      onClick={() => setOpen(true)}
      className="min-h-touch gradient-primary text-primary-foreground shadow-elegant"
    >
      <Plus className="mr-1.5 h-4 w-4" /> Manual Journal
    </Button>
  );

  const requestClose = useCallback(
    (next: boolean) => {
      if (!next && dirty) {
        setConfirmClose(true);
        return;
      }
      setOpen(next);
    },
    [dirty],
  );

  const forceClose = () => {
    setConfirmClose(false);
    setOpen(false);
  };

  const shell = isMobile ? (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent
        side="bottom"
        className="flex h-[95dvh] flex-col gap-0 rounded-t-2xl p-0 safe-bottom"
        onEscapeKeyDown={(e) => {
          if (dirty) { e.preventDefault(); setConfirmClose(true); }
        }}
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
          <SheetTitle>New journal entry</SheetTitle>
        </SheetHeader>
        <ManualForm
          key={open ? "open" : "closed"}
          onCreated={() => { setDirty(false); setOpen(false); }}
          onDirtyChange={setDirty}
          sticky
          prefill={prefill}
        />
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="flex max-h-[90vh] max-w-3xl flex-col gap-0 p-0"
        onEscapeKeyDown={(e) => {
          if (dirty) { e.preventDefault(); setConfirmClose(true); }
        }}
      >
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle>New journal entry</DialogTitle>
        </DialogHeader>
        <ManualForm
          key={open ? "open" : "closed"}
          onCreated={() => { setDirty(false); setOpen(false); }}
          onDirtyChange={setDirty}
          sticky
          prefill={prefill}
        />
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {openButton}
      {shell}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have edits in this journal entry. Your draft is auto-saved locally, so you
              can resume from where you left off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue editing</AlertDialogCancel>
            <AlertDialogAction onClick={forceClose}>Close dialog</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section wrapper (collapsible + persisted)                                  */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  title,
  description,
  status,
  defaultOpen = true,
  sectionState,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  status?: "ok" | "warn" | "todo";
  defaultOpen?: boolean;
  sectionState: Record<string, boolean>;
  onToggle: (id: string, next: boolean) => void;
  children: React.ReactNode;
}) {
  const open = sectionState[id] ?? defaultOpen;
  return (
    <section className="border-t border-border/60 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id, !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30 sm:px-6"
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </h3>
            {status === "ok" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
            ) : status === "warn" ? (
              <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden />
            ) : null}
          </div>
          {description ? (
            <p className="truncate text-xs text-muted-foreground/80">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-3 px-4 pb-4 sm:px-6">{children}</div> : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Multi-select chip                                                          */
/* -------------------------------------------------------------------------- */

function ChipMulti({
  options,
  values,
  onChange,
}: {
  options: { value: string; label: string; color?: string }[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/70 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground",
            )}
            style={active && o.color ? { borderColor: o.color, color: o.color } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Manual form                                                                */
/* -------------------------------------------------------------------------- */

function ManualForm({
  onCreated,
  onDirtyChange,
  sticky = false,
  prefill,
}: {
  onCreated: () => void;
  onDirtyChange: (dirty: boolean) => void;
  sticky?: boolean;
  prefill?: PrefillTrade;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const defaults = useMemo(() => loadDefaults(), []);
  const persistedDraft = useMemo<JournalDraft | null>(
    () => (prefill ? null : loadDraft()),
    [prefill],
  );

  const [restorePrompt, setRestorePrompt] = useState<JournalDraft | null>(persistedDraft);
  const [autoJournal] = useState<boolean>(Boolean(prefill));

  // Instrument
  const [symbol, setSymbol] = useState<string>(prefill?.symbol ?? "");
  const [instrument, setInstrument] = useState<InstrumentRecord | null>(
    prefill?.symbol ? findInstrument(prefill.symbol) : null,
  );
  const [market, setMarket] = useState<string>(
    prefill?.market ?? findInstrument(prefill?.symbol ?? "")?.market ?? "forex",
  );

  const [direction, setDirection] = useState<"long" | "short">(prefill?.direction ?? "long");

  const [entryPrice, setEntryPrice] = useState<string>(
    prefill?.entry_price != null ? String(prefill.entry_price) : "",
  );
  const [exitPrice, setExitPrice] = useState<string>(
    prefill?.exit_price != null ? String(prefill.exit_price) : "",
  );
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const [pnl, setPnl] = useState<string>(prefill?.pnl != null ? String(prefill.pnl) : "");
  const [rr, setRr] = useState<string>(prefill?.rr != null ? String(prefill.rr) : "");
  const [lotSize, setLotSize] = useState("");

  const now = new Date();
  const [openedAt, setOpenedAt] = useState<string>(
    prefill?.opened_at ? toLocalInput(new Date(prefill.opened_at)) : toLocalInput(now),
  );
  const [closedAt, setClosedAt] = useState<string>(
    prefill?.closed_at ? toLocalInput(new Date(prefill.closed_at)) : toLocalInput(now),
  );
  const [session, setSession] = useState<string>(defaults.session ?? "");
  const [sessionAuto, setSessionAuto] = useState(true);
  const tz = useMemo(() => detectTimezone(), []);

  const [confidence, setConfidence] = useState<number>(60);
  const [strategyTags, setStrategyTags] = useState<string[]>(
    defaults.strategy ? [defaults.strategy] : [],
  );
  const [emotions, setEmotions] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [entryReason, setEntryReason] = useState("");
  const [postTradeNotes, setPostTradeNotes] = useState("");

  const [riskPercent, setRiskPercent] = useState<string>(defaults.riskPercent ?? "");
  const [accountBalance, setAccountBalance] = useState<string>(defaults.accountBalance ?? "");

  const [screenshots, setScreenshots] = useState<StagedScreenshot[]>([]);

  const [sectionState, setSectionState] = useState<Record<string, boolean>>(() => loadSectionState());
  const toggleSection = useCallback((id: string, next: boolean) => {
    setSectionState((prev) => {
      const merged = { ...prev, [id]: next };
      saveSectionState(merged);
      return merged;
    });
  }, []);

  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Auto-detect session whenever open time changes and auto mode is on.
  useEffect(() => {
    if (!sessionAuto) return;
    const detected = detectSession(new Date(openedAt));
    if (detected) setSession(detected);
  }, [openedAt, sessionAuto]);

  useEffect(() => {
    if (instrument) setMarket(instrument.market);
  }, [instrument]);

  const entryValidation = useMemo(() => validatePrice(entryPrice, instrument), [entryPrice, instrument]);
  const exitValidation = useMemo(() => validatePrice(exitPrice, instrument), [exitPrice, instrument]);
  const slValidation = useMemo(() => validatePrice(stopLoss, instrument), [stopLoss, instrument]);
  const tpValidation = useMemo(() => validatePrice(takeProfit, instrument), [takeProfit, instrument]);

  const computedRR = useMemo(() => {
    const e = entryValidation.value;
    const x = exitValidation.value;
    const sl = slValidation.value;
    if (!e || !sl) return null;
    const risk = Math.abs(e - sl);
    if (!risk) return null;
    const reward = x != null ? Math.abs(x - e) : null;
    if (reward == null) return null;
    return reward / risk;
  }, [entryValidation.value, exitValidation.value, slValidation.value]);

  const computedPips = useMemo(
    () => (instrument
      ? computePips(entryValidation.value, exitValidation.value, instrument.pipSize, direction)
      : null),
    [entryValidation.value, exitValidation.value, instrument, direction],
  );

  const computedRiskPercent = useMemo(() => {
    const bal = Number(accountBalance);
    const lot = Number(lotSize);
    if (!instrument || !Number.isFinite(bal) || !bal || !Number.isFinite(lot) || !lot) return null;
    return computeRiskPercent(
      entryValidation.value,
      slValidation.value,
      lot,
      instrument.contractSize,
      bal,
    );
  }, [instrument, accountBalance, lotSize, entryValidation.value, slValidation.value]);

  const computedDuration = useMemo(() => {
    if (!openedAt || !closedAt) return null;
    return formatDuration(new Date(openedAt).toISOString(), new Date(closedAt).toISOString());
  }, [openedAt, closedAt]);

  const estimatedPL = useMemo(() => {
    if (!instrument || computedPips == null) return null;
    const lot = Number(lotSize);
    if (!Number.isFinite(lot) || !lot) return null;
    return computedPips * instrument.pipSize * (instrument.pipValuePerLot / instrument.pipSize) * lot;
  }, [instrument, computedPips, lotSize]);

  const completeness = useMemo(
    () => computeCompleteness({
      symbol, market, direction,
      entryPrice, exitPrice, stopLoss, takeProfit, pnl, rr, lotSize,
      openedAt, closedAt, session, sessionAuto,
      confidence, strategyTags, emotions, mistakes,
      entryReason, postTradeNotes, riskPercent, accountBalance,
    }),
    [symbol, market, direction, entryPrice, exitPrice, stopLoss, takeProfit, pnl, rr, lotSize,
     openedAt, closedAt, session, sessionAuto, confidence, strategyTags, emotions, mistakes,
     entryReason, postTradeNotes, riskPercent, accountBalance],
  );

  const sectionStatus = (keys: string[]): "ok" | "warn" | "todo" | undefined => {
    const done = completeness.slices.filter((s) => keys.includes(s.key));
    if (!done.length) return undefined;
    return done.every((s) => s.done) ? "ok" : "todo";
  };

  const requiredMissing = {
    instrument: !instrument,
    direction: false,
    entry: !entryPrice || !entryValidation.valid,
    openedAt: !openedAt,
    session: !session,
    strategy: strategyTags.length === 0,
  };

  const canSubmit = Boolean(
    user &&
      instrument &&
      entryValidation.valid &&
      exitValidation.valid &&
      slValidation.valid &&
      tpValidation.valid &&
      openedAt &&
      session &&
      strategyTags.length > 0,
  );

  /* --------------------------- Dirty + autosave --------------------------- */

  const currentDraft = useCallback((): JournalDraft => ({
    savedAt: Date.now(),
    symbol, market, direction,
    entryPrice, exitPrice, stopLoss, takeProfit,
    pnl, rr, lotSize,
    openedAt, closedAt, session, sessionAuto,
    confidence, strategyTags, emotions, mistakes,
    entryReason, postTradeNotes,
    riskPercent, accountBalance,
  }), [
    symbol, market, direction, entryPrice, exitPrice, stopLoss, takeProfit,
    pnl, rr, lotSize, openedAt, closedAt, session, sessionAuto, confidence,
    strategyTags, emotions, mistakes, entryReason, postTradeNotes,
    riskPercent, accountBalance,
  ]);

  const draftRef = useRef(currentDraft());
  useEffect(() => { draftRef.current = currentDraft(); }, [currentDraft]);

  // Consider the form dirty when the user has entered any meaningful data.
  const isDirty = Boolean(
    symbol || entryPrice || exitPrice || stopLoss || takeProfit ||
    pnl || rr || lotSize || strategyTags.length || emotions.length ||
    mistakes.length || entryReason.trim() || postTradeNotes.trim() ||
    screenshots.length,
  );
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  // Debounced autosave every 1s after inactivity (spec asks 5s; be snappier).
  useEffect(() => {
    if (!isDirty) return;
    const t = window.setTimeout(() => {
      saveDraft(draftRef.current);
      setSavedAt(Date.now());
    }, 1000);
    return () => window.clearTimeout(t);
  }, [isDirty, currentDraft]);

  // Beforeunload guard while dirty.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      saveDraft(draftRef.current);
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Keyboard: Ctrl/Cmd+S saves.
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------- Mutation ------------------------------ */

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!instrument) throw new Error("Please pick an instrument");
      if (!entryValidation.valid) throw new Error(entryValidation.error ?? "Invalid entry price");
      if (!session) throw new Error("Select a trading session");
      if (strategyTags.length === 0) throw new Error("Tag at least one strategy");

      const insert: EntryInsert = {
        user_id: user.id,
        symbol: instrument.symbol,
        market,
        direction,
        entry_price: entryValidation.value,
        exit_price: exitValidation.value,
        stop_loss: slValidation.value,
        take_profit: tpValidation.value,
        pnl: pnl ? Number(pnl) : estimatedPL,
        rr: rr ? Number(rr) : computedRR,
        lot_size: lotSize ? Number(lotSize) : null,
        opened_at: openedAt ? new Date(openedAt).toISOString() : null,
        closed_at: closedAt ? new Date(closedAt).toISOString() : null,
        opened_tz: tz,
        closed_tz: tz,
        session: (session || null) as EntryInsert["session"],
        session_auto_detected: sessionAuto,
        confidence,
        strategy: strategyTags[0] ?? null,
        strategy_tags: strategyTags,
        emotions,
        mistakes,
        entry_reason_text: entryReason || null,
        notes_text: postTradeNotes || null,
        status: "draft",
      };

      const entry = await createEntry(insert);
      if (screenshots.length) {
        await persistStagedScreenshots(user.id, entry.id, screenshots);
      }
      return entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      // Persist smart defaults for next entry.
      saveDefaults({
        strategy: strategyTags[0],
        session,
        riskPercent: riskPercent || undefined,
        accountBalance: accountBalance || undefined,
        favouriteSymbols: [
          instrument?.symbol ?? symbol,
          ...(loadDefaults().favouriteSymbols ?? []),
        ].filter(Boolean) as string[],
      });
      clearDraft();
      toast.success("Journal entry created");
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  submitRef.current = () => {
    if (mut.isPending) return;
    if (!canSubmit) {
      toast.error("Complete the required fields highlighted in red");
      return;
    }
    mut.mutate();
  };

  /* ------------------------------- Restore ------------------------------- */

  const applyDraft = (d: JournalDraft) => {
    setSymbol(d.symbol);
    setInstrument(findInstrument(d.symbol));
    setMarket(d.market);
    setDirection(d.direction);
    setEntryPrice(d.entryPrice);
    setExitPrice(d.exitPrice);
    setStopLoss(d.stopLoss);
    setTakeProfit(d.takeProfit);
    setPnl(d.pnl);
    setRr(d.rr);
    setLotSize(d.lotSize);
    setOpenedAt(d.openedAt);
    setClosedAt(d.closedAt);
    setSession(d.session);
    setSessionAuto(d.sessionAuto);
    setConfidence(d.confidence);
    setStrategyTags(d.strategyTags ?? []);
    setEmotions(d.emotions ?? []);
    setMistakes(d.mistakes ?? []);
    setEntryReason(d.entryReason ?? "");
    setPostTradeNotes(d.postTradeNotes ?? "");
    setRiskPercent(d.riskPercent ?? "");
    setAccountBalance(d.accountBalance ?? "");
    setRestorePrompt(null);
    toast.success("Draft restored");
  };

  const body = (
    <>
      {restorePrompt ? (
        <div className="flex items-center gap-3 border-b border-border/60 bg-primary/5 px-4 py-2.5 text-xs sm:px-6">
          <RotateCcw className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1">
            Resume unfinished draft from{" "}
            <span className="font-semibold text-foreground">
              {new Date(restorePrompt.savedAt).toLocaleString()}
            </span>?
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => { clearDraft(); setRestorePrompt(null); }}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => applyDraft(restorePrompt)}
          >
            Resume
          </Button>
        </div>
      ) : null}

      {autoJournal ? (
        <div className="flex items-center gap-2 border-b border-border/60 bg-success/5 px-4 py-2 text-xs text-success sm:px-6">
          <Sparkles className="h-3.5 w-3.5" />
          Auto-populated from your trade — review, then add emotion, notes, and screenshots.
        </div>
      ) : null}

      <div className="border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Journal completeness</span>
          <span className="font-semibold tabular-nums">{completeness.score}%</span>
        </div>
        <Progress value={completeness.score} className="h-1.5" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {completeness.slices.map((s) => (
            <span
              key={s.key}
              title={s.done ? `${s.label} — complete` : s.hint}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                s.done
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border/70 bg-background/40 text-muted-foreground",
              )}
            >
              {s.done ? "✓ " : ""}{s.label}
            </span>
          ))}
        </div>
      </div>

      <Section
        id="instrument"
        title="Instrument"
        description="Search by ticker, name, or common alias (e.g. Gold, Nasdaq)."
        status={sectionStatus(["instrument"])}
        sectionState={sectionState}
        onToggle={toggleSection}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label>
              Symbol <span className="ml-0.5 text-danger">*</span>
            </Label>
            <InstrumentSearchInput
              value={symbol}
              marketFilter={null}
              onSelect={(i) => { setInstrument(i); setSymbol(i.symbol); }}
              autoFocus
            />
            {instrument ? (
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-success" />
                <span className="font-medium text-foreground">{instrument.name}</span>
                <span>· {instrument.market}</span>
                <span>· {instrument.decimals} dp</span>
                <span>· pip {instrument.pipSize}</span>
                <span>· min lot {instrument.minLot}</span>
              </p>
            ) : symbol ? (
              <p className="flex items-center gap-1.5 text-[11px] text-warning">
                <AlertCircle className="h-3 w-3" /> Not in catalog — will be saved as custom symbol
              </p>
            ) : requiredMissing.instrument ? (
              <p className="flex items-center gap-1.5 text-[11px] text-danger">
                <AlertCircle className="h-3 w-3" /> Instrument is required
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Market</Label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MARKET_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
                <SelectItem value="metals">Metals</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section
        id="execution"
        title="Execution"
        description="Direction, prices, and position size. Prices are validated against instrument precision."
        status={sectionStatus(["execution", "risk"])}
        sectionState={sectionState}
        onToggle={toggleSection}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Direction <span className="ml-0.5 text-danger">*</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {DIRECTION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setDirection(o.value as "long" | "short")}
                  aria-pressed={direction === o.value}
                  className={cn(
                    "h-11 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    direction === o.value
                      ? o.value === "long"
                        ? "border-success bg-success/10 text-success"
                        : "border-danger bg-danger/10 text-danger"
                      : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Position size (lots / units)</Label>
            <Input
              value={lotSize}
              onChange={(e) => setLotSize(sanitizeDecimal(e.target.value))}
              inputMode="decimal"
              placeholder={instrument ? `min ${instrument.minLot}` : "e.g. 0.10"}
              className="h-11"
            />
          </div>
          <PriceField
            label="Entry price"
            value={entryPrice}
            onChange={setEntryPrice}
            validation={entryValidation}
            instrument={instrument}
            required
          />
          <PriceField
            label="Exit price"
            value={exitPrice}
            onChange={setExitPrice}
            validation={exitValidation}
            instrument={instrument}
          />
          <PriceField
            label="Stop loss"
            value={stopLoss}
            onChange={setStopLoss}
            validation={slValidation}
            instrument={instrument}
          />
          <PriceField
            label="Take profit"
            value={takeProfit}
            onChange={setTakeProfit}
            validation={tpValidation}
            instrument={instrument}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Account balance (for risk %)</Label>
            <Input
              value={accountBalance}
              onChange={(e) => setAccountBalance(sanitizeDecimal(e.target.value))}
              inputMode="decimal"
              placeholder="10000"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target risk %</Label>
            <Input
              value={riskPercent}
              onChange={(e) => setRiskPercent(sanitizeDecimal(e.target.value))}
              inputMode="decimal"
              placeholder="1.00"
              className="h-11"
            />
          </div>
        </div>
      </Section>

      <Section
        id="timing"
        title="Timing"
        description={`Times are stored in UTC; your timezone (${tz}) is recorded for context.`}
        status={sectionStatus(["timing"])}
        sectionState={sectionState}
        onToggle={toggleSection}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />Opened at <span className="text-danger">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
              className={cn("h-11", requiredMissing.openedAt && "border-danger")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Closed at</Label>
            <Input
              type="datetime-local"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Trading session <span className="text-danger">*</span></Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={sessionAuto} onCheckedChange={setSessionAuto} />
                Auto-detect from opened time
              </label>
            </div>
            <Select value={session} onValueChange={(v) => { setSession(v); setSessionAuto(false); }}>
              <SelectTrigger className={cn("mt-1.5 h-11", requiredMissing.session && "border-danger")}>
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {SESSION_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sessionAuto && session ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> Detected from opened time (UTC).
              </p>
            ) : null}
            {computedDuration ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Holding time <span className="font-semibold text-foreground">{computedDuration}</span>
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      <Section
        id="performance"
        title="Performance"
        description="If left blank, RR & P/L are auto-calculated from entry / exit / stop."
        sectionState={sectionState}
        onToggle={toggleSection}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Realised P/L</Label>
            <Input
              inputMode="decimal"
              value={pnl}
              onChange={(e) => setPnl(sanitizeSignedDecimal(e.target.value))}
              className={cn("h-11", numberTone(pnl))}
              placeholder={estimatedPL != null ? `est ${estimatedPL.toFixed(2)}` : "$"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>R:R</Label>
            <Input
              inputMode="decimal"
              value={rr}
              onChange={(e) => setRr(sanitizeDecimal(e.target.value))}
              className="h-11"
              placeholder={computedRR != null ? computedRR.toFixed(2) : "0.00"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confidence at entry</Label>
            <div className="flex h-11 items-center gap-3 rounded-md border border-input bg-background px-3">
              <Slider
                value={[confidence]}
                onValueChange={(v) => setConfidence(v[0] ?? 0)}
                min={0}
                max={100}
                step={5}
                className="flex-1"
                aria-label="Confidence at entry"
              />
              <span className="w-9 text-right text-sm font-semibold text-foreground">{confidence}%</span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="review"
        title="Strategy & Review"
        description="Tag the setup(s), emotional state, and any mistakes you noticed."
        status={sectionStatus(["strategy", "psychology", "reason", "notes"])}
        sectionState={sectionState}
        onToggle={toggleSection}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Strategy tags <span className="text-danger">*</span></Label>
            <ChipMulti options={DEFAULT_SETUPS} values={strategyTags} onChange={setStrategyTags} />
            {strategyTags.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {strategyTags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            ) : requiredMissing.strategy ? (
              <p className="text-[11px] text-danger">Pick at least one setup</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>How did it feel?</Label>
            <ChipMulti options={DEFAULT_EMOTIONS} values={emotions} onChange={setEmotions} />
          </div>
          <div className="space-y-1.5">
            <Label>Mistakes (be honest with yourself)</Label>
            <ChipMulti options={DEFAULT_MISTAKES} values={mistakes} onChange={setMistakes} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason for entry</Label>
            <Textarea
              value={entryReason}
              onChange={(e) => setEntryReason(e.target.value)}
              placeholder="What did you see? What was your thesis? (Markdown supported)"
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Post-trade notes</Label>
            <Textarea
              value={postTradeNotes}
              onChange={(e) => setPostTradeNotes(e.target.value)}
              placeholder="What did you learn? What would you do differently? (Markdown supported)"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
      </Section>

      <Section
        id="attachments"
        title="Screenshots"
        description="Attach chart images with captions to show context, entry, management, and exit."
        sectionState={sectionState}
        onToggle={toggleSection}
        defaultOpen={false}
      >
        <ScreenshotUploader staged={screenshots} onStagedChange={setScreenshots} />
      </Section>
    </>
  );

  const summaryChips: React.ReactNode[] = [];
  if (instrument) summaryChips.push(
    <SummaryChip key="sym" label={instrument.symbol} tone="primary" />,
  );
  summaryChips.push(
    <SummaryChip
      key="dir"
      label={direction === "long" ? "Long" : "Short"}
      tone={direction === "long" ? "success" : "danger"}
    />,
  );
  if (session) summaryChips.push(<SummaryChip key="sess" label={sessionLabel(session)} />);
  if (computedRR != null) summaryChips.push(<SummaryChip key="rr" label={`RR ${computedRR.toFixed(2)}`} />);
  if (computedPips != null) summaryChips.push(
    <SummaryChip
      key="pips"
      label={`${computedPips > 0 ? "+" : ""}${computedPips} pips`}
      tone={computedPips >= 0 ? "success" : "danger"}
    />,
  );
  if (computedRiskPercent != null) summaryChips.push(
    <SummaryChip key="risk" label={`Risk ${computedRiskPercent.toFixed(2)}%`} />,
  );
  if (estimatedPL != null && !pnl) summaryChips.push(
    <SummaryChip
      key="epl"
      label={`Est. ${estimatedPL >= 0 ? "+" : ""}${estimatedPL.toFixed(2)}`}
      tone={estimatedPL >= 0 ? "success" : "danger"}
    />,
  );
  if (computedDuration) summaryChips.push(<SummaryChip key="dur" label={computedDuration} />);

  const footer = (
    <div className={cn(
      "flex flex-col gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6",
      sticky ? "sticky bottom-0" : "",
    )}>
      {summaryChips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">{summaryChips}</div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-muted-foreground">
          {savedAt ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-success" />
              Draft saved · {new Date(savedAt).toLocaleTimeString()}
            </span>
          ) : (
            <span>Auto-saves after 1s of inactivity · ⌘/Ctrl + S to save</span>
          )}
        </div>
        <Button
          type="submit"
          disabled={mut.isPending || !canSubmit}
          aria-disabled={mut.isPending || !canSubmit}
          className="min-h-touch gradient-primary text-primary-foreground"
        >
          {mut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {mut.isPending ? "Saving…" : "Save entry"}
        </Button>
      </div>
    </div>
  );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => { e.preventDefault(); submitRef.current(); }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {footer}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function PriceField({
  label,
  value,
  onChange,
  validation,
  instrument,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  validation: ReturnType<typeof validatePrice>;
  instrument: InstrumentRecord | null;
  required?: boolean;
}) {
  const invalid = value.length > 0 && !validation.valid;
  const missingRequired = required && value.length === 0;
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(sanitizeDecimal(e.target.value))}
        inputMode="decimal"
        placeholder={instrument ? "0.".padEnd(2 + instrument.decimals, "0") : "0.00"}
        className={cn(
          "h-11 font-mono",
          (invalid || missingRequired) ? "border-danger focus-visible:ring-danger" : "",
        )}
        aria-invalid={invalid || missingRequired}
      />
      {invalid ? (
        <p className="text-[11px] text-danger">{validation.error}</p>
      ) : missingRequired ? (
        <p className="text-[11px] text-danger">Required</p>
      ) : null}
    </div>
  );
}

function SummaryChip({
  label,
  tone,
}: {
  label: string;
  tone?: "primary" | "success" | "danger";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "success" && "border-success/40 bg-success/10 text-success",
        tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
        tone === "primary" && "border-primary/40 bg-primary/10 text-primary",
        !tone && "border-border/70 bg-background/40 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function numberTone(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || !v) return "";
  return n > 0 ? "text-success" : n < 0 ? "text-danger" : "";
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Allow digits + single decimal separator. Non-negative prices. */
function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

/** Same as sanitizeDecimal but allows a leading minus. */
function sanitizeSignedDecimal(v: string): string {
  const neg = v.startsWith("-");
  const rest = sanitizeDecimal(v.replace(/-/g, ""));
  return neg ? `-${rest}` : rest;
}

function sessionLabel(v: string): string {
  return SESSION_OPTIONS.find((s) => s.value === v)?.label ?? v;
}
