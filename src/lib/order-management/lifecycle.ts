/**
 * Order lifecycle state machine + audit trail.
 *
 * Every managed order maintains a full, ordered history of transitions
 * with timestamps and reason strings. Journal and AI Coach later replay
 * this stream for post-trade analysis.
 */

import type { AuditEntry, AuditKind, ManagedOrderState } from "./types";

const TRANSITIONS: Record<ManagedOrderState, ManagedOrderState[]> = {
  created:          ["validated", "rejected", "cancelled"],
  validated:        ["accepted", "rejected", "cancelled"],
  accepted:         ["pending", "triggered", "filled", "cancelled", "rejected"],
  pending:          ["triggered", "modified", "cancelled", "expired", "rejected"],
  triggered:        ["filled", "rejected", "cancelled"],
  filled:           ["modified", "partially_closed", "closed"],
  modified:         ["modified", "pending", "triggered", "filled", "partially_closed", "closed", "cancelled"],
  partially_closed: ["modified", "partially_closed", "closed"],
  closed:           [],
  cancelled:        [],
  rejected:         [],
  expired:          [],
};

export function canTransition(from: ManagedOrderState, to: ManagedOrderState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

let seq = 0;
function nextId(): string { seq += 1; return `evt_${Date.now().toString(36)}_${seq.toString(36)}`; }

export class AuditLog {
  private entries: AuditEntry[] = [];

  record(kind: AuditKind, message: string, detail?: Record<string, unknown>): AuditEntry {
    const entry: AuditEntry = { id: nextId(), at: Date.now(), kind, message, detail };
    this.entries.push(entry);
    return entry;
  }

  list(): AuditEntry[] { return this.entries.slice(); }

  filter(kind: AuditKind): AuditEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  last(): AuditEntry | null {
    return this.entries[this.entries.length - 1] ?? null;
  }
}

export type ManagedOrderRecord = {
  id: string;
  clientId?: string;
  state: ManagedOrderState;
  createdAt: number;
  history: { at: number; state: ManagedOrderState; reason?: string }[];
  audit: AuditLog;
};

export function createRecord(id: string, clientId?: string): ManagedOrderRecord {
  const now = Date.now();
  const record: ManagedOrderRecord = {
    id, clientId, state: "created", createdAt: now,
    history: [{ at: now, state: "created" }],
    audit: new AuditLog(),
  };
  record.audit.record("created", `Order ${id} created`);
  return record;
}

export function transition(
  record: ManagedOrderRecord, to: ManagedOrderState, reason?: string,
): boolean {
  if (!canTransition(record.state, to)) return false;
  record.state = to;
  record.history.push({ at: Date.now(), state: to, reason });
  return true;
}
