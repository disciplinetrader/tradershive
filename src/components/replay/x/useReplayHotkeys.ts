/**
 * Replay Studio X — playback hotkeys.
 *
 * Extracted verbatim from the previous `ReplayControls` keyboard effect so
 * the floating transport keeps identical behaviour while the old bar is
 * retired. No playback logic changed — this only listens and delegates.
 */
import { useEffect } from "react";
import { SPEEDS } from "@/lib/replay/constants";
import { useReplay } from "../context";

export function useReplayHotkeys(onToggleHelp: () => void) {
  const { toggle, step, skip, jumpTo, fastForwardUntil, addCheckpoint, speed, setSpeed } = useReplay();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.code === "ArrowRight") { e.shiftKey ? skip(10) : step(1); }
      else if (e.code === "ArrowLeft") { e.shiftKey ? skip(-10) : step(-1); }
      else if (e.key === "." && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); step(1); }
      else if (e.key === "," && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); step(-1); }
      else if (e.key === "b") { jumpTo("next_bookmark"); }
      else if (e.key === "B") { jumpTo("prev_bookmark"); }
      else if (e.key === "t") { jumpTo("next_trade"); }
      else if (e.key === "T") { jumpTo("prev_trade"); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); fastForwardUntil("next_order_trigger"); }
      else if (e.key === "m" || e.key === "M") { e.preventDefault(); addCheckpoint("custom", "Bookmark"); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); window.dispatchEvent(new Event("replay-capture")); }
      else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const idx = (SPEEDS as readonly number[]).indexOf(speed);
        if (idx >= 0 && idx < SPEEDS.length - 1) setSpeed(SPEEDS[idx + 1]);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const idx = (SPEEDS as readonly number[]).indexOf(speed);
        if (idx > 0) setSpeed(SPEEDS[idx - 1]);
      } else if (e.key === "?") { e.preventDefault(); onToggleHelp(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step, skip, jumpTo, fastForwardUntil, addCheckpoint, speed, setSpeed, onToggleHelp]);
}

export const REPLAY_SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / Pause"],
  ["← / →", "Step 1 candle"],
  ["Shift + ← / →", "Skip 10 candles"],
  ["+ / -", "Faster / slower playback · Zoom chart"],
  [", / .", "Step backward / forward"],
  ["B / Shift+B", "Next / previous bookmark"],
  ["T / Shift+T", "Next / previous trade"],
  ["M", "Bookmark current candle"],
  ["S", "Snapshot chart"],
  ["F", "Fast-forward to next trade"],
  ["Del / Backspace", "Delete selected drawing"],
  ["⌘/Ctrl + Z", "Undo drawing"],
  ["⌘/Ctrl + ⇧ + Z", "Redo drawing"],
  ["?", "Show this help"],
  ["Esc", "Cancel tool · close dialogs"],
];
