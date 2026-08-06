/**
 * Phase 8A · session lifecycle validation.
 *
 * Two guarantees:
 *  1. Only legal lifecycle transitions are applied (no "completed → running").
 *  2. A session never starts on a dataset it cannot deterministically replay.
 */

import type { DatasetIdentity } from "./dataset";
import { datasetMatches } from "./dataset";
import type { SessionLifecycle, SessionSnapshot } from "./model";
import { SESSION_SNAPSHOT_VERSION } from "./model";

const TRANSITIONS: Record<SessionLifecycle, SessionLifecycle[]> = {
  // A trader may finish a session they opened but never played — the studio
  // must not throw "Illegal transition" behind the Finish button.
  created: ["ready", "completed", "abandoned"],
  ready: ["running", "completed", "abandoned"],
  running: ["paused", "completed", "abandoned"],
  paused: ["running", "completed", "abandoned"],
  completed: [],
  abandoned: [],
};

export function canTransition(from: SessionLifecycle, to: SessionLifecycle): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SessionLifecycle, to: SessionLifecycle): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal replay session transition: ${from} → ${to}`);
  }
}

export interface DatasetValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Preflight before a session may leave "created". */
export function validateDataset(identity: DatasetIdentity, opts: { allowSynthetic?: boolean } = {}): DatasetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (identity.barCount < 2) errors.push("Dataset needs at least two bars to replay.");
  if (identity.observationCount < 2) errors.push("Dataset produced no observation stream.");
  if (identity.endTime <= identity.startTime) errors.push("Dataset end time is not after its start time.");
  if (!identity.checksum) errors.push("Dataset is missing a content checksum.");
  if (identity.isSynthetic && !opts.allowSynthetic) {
    errors.push("Synthetic data cannot back a real practice session.");
  }

  const missing = identity.gaps.reduce((n, g) => n + g.missingBars, 0);
  if (identity.gaps.length) {
    warnings.push(
      `${identity.gaps.length} gap(s) totalling ${missing} missing bar(s) — expected across weekends and market holidays.`,
    );
  }
  if (missing > identity.barCount * 0.95) {
    errors.push("More than 95% of the expected bars are missing; refusing to replay.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export type ResumeVerdict =
  | { ok: true; snapshot: SessionSnapshot }
  | { ok: false; reason: "version" | "dataset" | "corrupt"; message: string };

/** Can this persisted snapshot be trusted against freshly loaded bars? */
export function validateSnapshot(snapshot: unknown, dataset: DatasetIdentity): ResumeVerdict {
  const s = snapshot as SessionSnapshot | null;
  if (!s || typeof s !== "object" || !s.meta || !s.clock) {
    return { ok: false, reason: "corrupt", message: "Saved session state is unreadable." };
  }
  if (s.version !== SESSION_SNAPSHOT_VERSION) {
    return { ok: false, reason: "version", message: "Saved session was written by an older engine version." };
  }
  if (!datasetMatches(s.meta.dataset, dataset)) {
    return {
      ok: false,
      reason: "dataset",
      message: "Historical data for this session changed since it was saved; resuming would not be reproducible.",
    };
  }
  if (s.clock.cursor < 0 || s.clock.cursor > dataset.observationCount) {
    return { ok: false, reason: "corrupt", message: "Saved playback position is outside the dataset." };
  }
  return { ok: true, snapshot: s };
}
