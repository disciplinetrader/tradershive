/**
 * Realtime health tracker.
 *
 * Supabase realtime channels expose their lifecycle via the `.subscribe()`
 * callback (`SUBSCRIBED | TIMED_OUT | CHANNEL_ERROR | CLOSED`). Call
 * {@link trackChannel} right after `.subscribe()` (or use {@link subscribeAndTrack}
 * as a drop-in wrapper) to emit connection success rate, disconnects, and
 * reconnect attempts to the telemetry sink without changing subscription logic.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";

import { isEnabled } from "./feature-flags";
import { emit } from "./sink";

type SubscribeStatus = "SUBSCRIBED" | "TIMED_OUT" | "CHANNEL_ERROR" | "CLOSED";

const attempts = new Map<string, number>();

export function trackChannelStatus(topic: string, status: SubscribeStatus, error?: unknown) {
  if (!isEnabled("obs.realtimeHealth")) return;
  const previous = attempts.get(topic) ?? 0;

  if (status === "SUBSCRIBED") {
    emit("realtime", "connected", { data: { topic, attempts: previous + 1 } });
    attempts.set(topic, 0);
    return;
  }

  attempts.set(topic, previous + 1);
  emit(
    "realtime",
    status === "TIMED_OUT" ? "timeout" : status === "CHANNEL_ERROR" ? "error" : "closed",
    {
      data: {
        topic,
        attempts: previous + 1,
        message: error instanceof Error ? error.message : undefined,
      },
    },
  );
}

/**
 * Convenience wrapper: `subscribeAndTrack(supabase.channel("x").on(...))`.
 * Preserves the caller's own status handler if provided.
 */
export function subscribeAndTrack(
  channel: RealtimeChannel,
  cb?: (status: SubscribeStatus, err?: Error) => void,
): RealtimeChannel {
  const topic = channel.topic;
  return channel.subscribe((status, err) => {
    trackChannelStatus(topic, status as SubscribeStatus, err);
    cb?.(status as SubscribeStatus, err);
  });
}
