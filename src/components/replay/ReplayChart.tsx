import { useEffect, useRef } from "react";
import { useReplay } from "./context";
import type { Candle } from "@/lib/replay/types";

type Props = { onCapture?: (dataUrl: string) => void };

export function ReplayChart({ onCapture }: Props) {
  const { candles, cursorIdx, openTrades, bookmarks } = useReplay();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    draw(ctx, rect.width, rect.height, candles, cursorIdx, openTrades, bookmarks);
  }, [candles, cursorIdx, openTrades, bookmarks]);

  useEffect(() => {
    if (!onCapture) return;
    // Provide capture via canvas.toDataURL — trigger via custom event
    const handler = () => {
      const c = canvasRef.current;
      if (c) onCapture(c.toDataURL("image/png"));
    };
    window.addEventListener("replay-capture", handler);
    return () => window.removeEventListener("replay-capture", handler);
  }, [onCapture]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-2xl bg-background/60">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  candles: Candle[],
  cursorIdx: number,
  openTrades: any[],
  bookmarks: any[],
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(15,23,42,0.4)";
  ctx.fillRect(0, 0, w, h);

  if (!candles.length) {
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "13px system-ui";
    ctx.fillText("Loading candles…", 16, 24);
    return;
  }

  const visible = candles.slice(0, cursorIdx + 1);
  const windowSize = Math.min(120, visible.length);
  const view = visible.slice(-windowSize);
  const padL = 8, padR = 64, padT = 12, padB = 20;
  const iw = w - padL - padR, ih = h - padT - padB;

  const min = Math.min(...view.map((c) => c.low));
  const max = Math.max(...view.map((c) => c.high));
  const range = max - min || 1;
  const bw = iw / windowSize;

  // Gridlines
  ctx.strokeStyle = "rgba(148,163,184,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = padT + (ih / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
    const p = max - (range / 4) * i;
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "10px system-ui";
    ctx.fillText(p.toFixed(p < 10 ? 4 : 2), padL + iw + 6, y + 3);
  }

  // Candles
  view.forEach((c, i) => {
    const x = padL + i * bw + bw / 2;
    const oY = padT + ih - ((c.open - min) / range) * ih;
    const cY = padT + ih - ((c.close - min) / range) * ih;
    const hY = padT + ih - ((c.high - min) / range) * ih;
    const lY = padT + ih - ((c.low - min) / range) * ih;
    const up = c.close >= c.open;
    ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
    ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();
    ctx.fillStyle = up ? "#22c55e" : "#ef4444";
    const bodyH = Math.max(1, Math.abs(cY - oY));
    ctx.fillRect(x - bw * 0.35, Math.min(oY, cY), bw * 0.7, bodyH);
  });

  // Open trade lines
  const last = candles[cursorIdx];
  openTrades.forEach((t) => {
    const drawLine = (price: number, color: string, label: string) => {
      const y = padT + ih - ((price - min) / range) * ih;
      if (y < padT || y > padT + ih) return;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "10px system-ui";
      ctx.fillText(label, padL + 4, y - 2);
    };
    drawLine(t.entry_price, "#3b82f6", `${t.direction.toUpperCase()} ${t.lot_size}`);
    if (t.stop_loss) drawLine(t.stop_loss, "#ef4444", "SL");
    if (t.take_profit) drawLine(t.take_profit, "#22c55e", "TP");
  });

  // Current price line
  if (last) {
    const y = padT + ih - ((last.close - min) / range) * ih;
    ctx.strokeStyle = "rgba(96,165,250,0.5)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#60a5fa";
    ctx.fillRect(padL + iw, y - 8, padR - 4, 16);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 10px system-ui";
    ctx.fillText(last.close.toFixed(last.close < 10 ? 4 : 2), padL + iw + 4, y + 3);
  }

  // Bookmarks (as markers at bottom)
  bookmarks.forEach((b) => {
    const ts = new Date(b.bookmark_ts).getTime();
    const idxInView = view.findIndex((c) => c.time >= ts);
    if (idxInView < 0) return;
    const x = padL + idxInView * bw + bw / 2;
    ctx.fillStyle = b.color ?? "#a855f7";
    ctx.beginPath(); ctx.arc(x, padT + ih - 4, 4, 0, Math.PI * 2); ctx.fill();
  });

  // Watermark: cursor time
  if (last) {
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "10px system-ui";
    ctx.fillText(new Date(last.time).toISOString().replace("T", " ").slice(0, 16) + " UTC", padL, h - 4);
  }
}
