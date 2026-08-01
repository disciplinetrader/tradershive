/**
 * Phase 8C · Replay Studio reflection panel.
 *
 * Notes, bookmarks, checklist, checkpoints, screenshots, score and the AI
 * coach — all attached to the canonical `replay_sessions` row and all owned
 * by Replay Studio. Nothing in this file executes, prices or scores anything:
 * scoring runs server-side through the single shared formula.
 *
 * Look-ahead safety: bookmark/checkpoint jumps use the controller's
 * forward-only seek while the session is live. Backwards navigation is not
 * offered, and no future bar is ever read here.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, Camera, Flag, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BOOKMARK_CATEGORIES } from "@/lib/replay/constants";
import { useReplayReflection } from "@/lib/replay/reflection/queries";
import { useRegisterScreenshot, useScoreSession } from "@/lib/replay/review/queries";
import { captureChartPng, uploadScreenshot } from "@/lib/replay/review/screenshot";
import { AiReviewPanel } from "@/components/replay/AiReviewPanel";
import { useReplayStudio } from "./context";

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border/40 px-3 py-3" aria-label={title}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

export function ReflectionPanel() {
  const { sessionId, view, seekForwardTo } = useReplayStudio();
  const r = useReplayReflection(sessionId);
  const registerShot = useRegisterScreenshot(sessionId);
  const [capturing, setCapturing] = useState(false);

  const atMs = view?.transport.marketTime ?? Date.now();
  const completed = view?.transport.lifecycle === "completed";

  const [note, setNote] = useState("");
  const [bookmark, setBookmark] = useState("");
  const [category, setCategory] = useState<string>("good_setup");
  const [check, setCheck] = useState("");

  // ONE scoring path: the server re-derives the score from the durable trade
  // tape, so the same session scores identically on any device.
  const scoring = useScoreSession(sessionId);

  /**
   * Capture only what the chart is currently drawing. The clock has not
   * released future bars, so the image cannot leak look-ahead information.
   */
  const capture = async () => {
    setCapturing(true);
    try {
      const blob = await captureChartPng();
      if (!blob) return;
      const path = await uploadScreenshot(sessionId, blob);
      if (!path) return;
      registerShot.mutate({
        storage_path: path,
        captured_ts: new Date().toISOString(),
        cursor_ts: new Date(atMs).toISOString(),
        dataset_checksum: view?.dataset.checksum ?? null,
        symbol: view?.meta.dataset.symbol ?? null,
        timeframe: view?.dataset.timeframe ?? null,
        caption: `Chart @ ${new Date(atMs).toISOString().slice(11, 16)}`,
      });
    } finally {
      setCapturing(false);
    }
  };

  /** Forward-only: replay must never rewind into already-revealed-but-unseen bars. */
  const jump = (iso: string) => {
    const t = new Date(iso).getTime();
    if (Number.isFinite(t) && view && t > view.transport.marketTime) seekForwardTo(t);
  };

  const score = r.data.score;

  return (
    <ScrollArea className="h-full">
      <Section title="Notes">
        <div className="flex gap-2">
          <Input
            aria-label="New note"
            placeholder={`Note @ ${new Date(atMs).toISOString().slice(11, 16)}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && note.trim()) { r.addNote.mutate({ body: note.trim(), atMs }); setNote(""); }
            }}
          />
          <Button size="sm" onClick={() => { if (note.trim()) { r.addNote.mutate({ body: note.trim(), atMs }); setNote(""); } }}>
            Add
          </Button>
        </div>
        <ul className="space-y-1">
          {r.data.notes.length === 0 ? (
            <li className="py-2 text-[11px] text-muted-foreground">No notes yet — capture what you saw, while you see it.</li>
          ) : (
            r.data.notes.map((n) => (
              <li key={n.id} className="group flex items-start justify-between gap-2 rounded-md bg-background/40 px-2 py-1 text-xs">
                <span className="min-w-0">
                  <span className="mr-2 font-mono text-[10px] text-muted-foreground">{hhmm(n.note_ts)}</span>
                  {n.body}
                </span>
                <button aria-label="Delete note" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => r.removeNote.mutate(n.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section title="Bookmarks">
        <div className="grid grid-cols-3 gap-1">
          {BOOKMARK_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className="rounded-md border px-1 py-1 text-[10px] font-medium transition"
              style={{
                borderColor: category === c.id ? c.color : "transparent",
                background: category === c.id ? `${c.color}20` : "transparent",
                color: category === c.id ? c.color : undefined,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Bookmark label"
            placeholder="Label this moment…"
            value={bookmark}
            onChange={(e) => setBookmark(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { r.addBookmark.mutate({ label: bookmark.trim() || "Bookmark", category, atMs }); setBookmark(""); }
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => { r.addBookmark.mutate({ label: bookmark.trim() || "Bookmark", category, atMs }); setBookmark(""); }}>
            <Bookmark className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ul className="space-y-1">
          {r.data.bookmarks.map((b) => (
            <li key={b.id} className="group flex items-center justify-between rounded-md bg-background/40 px-2 py-1 text-xs">
              <button type="button" className="min-w-0 truncate text-left" onClick={() => jump(b.bookmark_ts)} title="Jump forward to this moment">
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">{hhmm(b.bookmark_ts)}</span>
                {b.label}
              </button>
              <button aria-label="Delete bookmark" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => r.removeBookmark.mutate(b.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Checklist"
        right={<span className="text-[11px] text-muted-foreground">{r.data.checklist.filter((c) => c.checked).length} / {r.data.checklist.length}</span>}
      >
        <ul className="space-y-1">
          {r.data.checklist.map((c) => (
            <li key={c.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-xs">
              <Checkbox checked={c.checked} onCheckedChange={(v) => r.toggleCheck.mutate({ id: c.id, checked: Boolean(v) })} aria-label={c.label} />
              <span className={c.checked ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{c.label}</span>
              <button aria-label="Remove item" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => r.removeCheck.mutate(c.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            aria-label="New checklist item"
            placeholder="Add an objective…"
            value={check}
            onChange={(e) => setCheck(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && check.trim()) { r.addCheck.mutate(check.trim()); setCheck(""); } }}
          />
          <Button size="sm" variant="secondary" onClick={() => { if (check.trim()) { r.addCheck.mutate(check.trim()); setCheck(""); } }}>Add</Button>
        </div>
      </Section>

      <Section
        title="Checkpoints"
        right={
          <Button size="sm" variant="ghost" onClick={() => r.addCheckpoint.mutate({ label: `Checkpoint ${r.data.checkpoints.length + 1}`, atMs })}>
            <Flag className="mr-1 h-3.5 w-3.5" /> Mark
          </Button>
        }
      >
        <ul className="space-y-1">
          {r.data.checkpoints.length === 0 ? (
            <li className="text-[11px] text-muted-foreground">Mark a moment to find it again in review.</li>
          ) : (
            r.data.checkpoints.map((c) => (
              <li key={c.id} className="group flex items-center justify-between rounded-md bg-background/40 px-2 py-1 text-xs">
                <button type="button" className="min-w-0 truncate text-left" onClick={() => jump(c.checkpoint_ts)}>
                  <span className="mr-2 font-mono text-[10px] text-muted-foreground">{hhmm(c.checkpoint_ts)}</span>
                  {c.label}
                </button>
                <button aria-label="Delete checkpoint" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => r.removeCheckpoint.mutate(c.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))
          )}
        </ul>
      </Section>

      <Section
        title="Screenshots"
        right={
          <Button size="sm" variant="ghost" onClick={() => void capture()} disabled={capturing}>
            <Camera className="mr-1 h-3.5 w-3.5" /> {capturing ? "Capturing…" : "Capture chart"}
          </Button>
        }
      >
        {r.data.screenshots.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No screenshots captured for this session.</p>
        ) : (
          <ul className="space-y-1">
            {r.data.screenshots.map((s) => (
              <li key={s.id} className="rounded-md bg-background/40 px-2 py-1 text-xs">
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">{hhmm(s.captured_ts)}</span>
                {s.caption ?? "Screenshot"}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Score">
        {score ? (
          <dl className="grid grid-cols-2 gap-1 text-xs">
            <dt className="text-muted-foreground">Overall</dt><dd className="text-right font-mono">{score.score}</dd>
            <dt className="text-muted-foreground">Discipline</dt><dd className="text-right font-mono">{score.discipline}</dd>
            <dt className="text-muted-foreground">Risk</dt><dd className="text-right font-mono">{score.risk}</dd>
            <dt className="text-muted-foreground">Execution</dt><dd className="text-right font-mono">{score.execution}</dd>
            <dt className="text-muted-foreground">Patience</dt><dd className="text-right font-mono">{score.patience}</dd>
            <dt className="text-muted-foreground">Consistency</dt><dd className="text-right font-mono">{score.consistency}</dd>
          </dl>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {completed ? "Score this session to grade discipline, risk, execution, patience and consistency." : "Finish the session to score it."}
          </p>
        )}
        <Button size="sm" className="w-full" disabled={!completed || scoring.isPending} onClick={() => scoring.mutate(undefined)}>
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          {scoring.isPending ? "Scoring…" : score ? "Re-score session" : "Score session"}
        </Button>
        {completed ? (
          <Button asChild size="sm" variant="secondary" className="mt-2 w-full">
            <Link to="/replay/review" search={{ id: sessionId }}>Open full review</Link>
          </Button>
        ) : null}
      </Section>

      <div className="p-3">
        <AiReviewPanel sessionId={sessionId} />
      </div>
    </ScrollArea>
  );
}
