/**
 * Phase 8D · Replay screenshot capture.
 *
 * Look-ahead safety is the whole point: the capture reads the chart's own
 * canvases, which only ever contain bars the clock has already released. No
 * future candle can enter an image, because no future candle is drawn.
 *
 * The upload is owner-scoped (`<user id>/<session id>/<ts>.png`) into the
 * private `replay-screenshots` bucket; the row is written server-side.
 */

import { supabase } from "@/integrations/supabase/client";

export const SCREENSHOT_BUCKET = "replay-screenshots";

/** Flatten every canvas inside the chart host into one PNG blob. */
export async function captureChartPng(host?: HTMLElement | null): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const root = host ?? document.querySelector<HTMLElement>("[data-studio-chart]");
  if (!root) return null;

  const canvases = Array.from(root.querySelectorAll("canvas"));
  if (canvases.length === 0) return null;

  const width = root.clientWidth || canvases[0].width;
  const height = root.clientHeight || canvases[0].height;
  const out = document.createElement("canvas");
  const ratio = window.devicePixelRatio || 1;
  out.width = Math.max(1, Math.round(width * ratio));
  out.height = Math.max(1, Math.round(height * ratio));

  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = getComputedStyle(root).backgroundColor || "#0b0e13";
  ctx.fillRect(0, 0, out.width, out.height);

  for (const c of canvases) {
    const rect = c.getBoundingClientRect();
    const hostRect = root.getBoundingClientRect();
    try {
      ctx.drawImage(
        c,
        Math.round((rect.left - hostRect.left) * ratio),
        Math.round((rect.top - hostRect.top) * ratio),
        Math.round(rect.width * ratio),
        Math.round(rect.height * ratio),
      );
    } catch {
      // A tainted canvas must not break the session.
      return null;
    }
  }

  return await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/png", 0.92));
}

/** Upload a captured PNG; returns the storage path or null when not signed in. */
export async function uploadScreenshot(sessionId: string, blob: Blob): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return null;
  const path = `${userId}/${sessionId}/${Date.now()}.png`;
  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (error) return null;
  return path;
}

/** Short-lived signed URL for a private screenshot. */
export async function screenshotUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
