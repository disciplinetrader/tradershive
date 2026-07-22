/**
 * Simulation Account Registry — Phase 3.
 *
 * Manages *multiple* independent simulation accounts inside a single
 * process (e.g. a user with a paper account, a prop-firm challenge, and a
 * crypto sandbox). Each account owns its own `TradingEngine` instance;
 * price ticks from the Yahoo Finance layer fan out to every registered
 * account.
 *
 * The registry is intentionally in-memory and framework-agnostic. Server
 * functions persist snapshots to Supabase; this module never touches the
 * network.
 */

import { TradingEngine } from "./engine";
import { EventBus } from "./events";
import type { AccountConfig, AccountSnapshot, OrderIntent, TradingEvent } from "./types";
import {
  SIMULATION_PROFILES, accountConfigFromProfile,
  type SimulationProfileId, type SimulationProfile,
} from "./simulation-profiles";

export type SimulationAccountId = string;

export type SimulationAccountMeta = {
  id: SimulationAccountId;
  label: string;
  profileId: SimulationProfileId;
  createdAt: number;
};

export type SimulationAccount = {
  meta: SimulationAccountMeta;
  profile: SimulationProfile;
  config: AccountConfig;
  engine: TradingEngine;
  bus: EventBus;
};

export type CreateAccountInput = {
  id?: SimulationAccountId;
  label: string;
  profileId: SimulationProfileId;
  overrides?: Parameters<typeof accountConfigFromProfile>[1];
};

export class SimulationAccountRegistry {
  private accounts = new Map<SimulationAccountId, SimulationAccount>();
  private globalBus = new EventBus();

  create(input: CreateAccountInput): SimulationAccount {
    const id = input.id ?? cryptoId();
    if (this.accounts.has(id)) throw new Error(`Account ${id} already exists`);
    const profile = SIMULATION_PROFILES[input.profileId];
    if (!profile) throw new Error(`Unknown simulation profile ${input.profileId}`);
    const config = accountConfigFromProfile(input.profileId, input.overrides);
    const engine = new TradingEngine(config);
    const bus = engine.bus;
    // Fan events into the global bus with the account id attached.
    bus.on((e) => this.globalBus.emit({ ...e, __accountId: id } as TradingEvent & { __accountId: string }));
    const acc: SimulationAccount = {
      meta: { id, label: input.label, profileId: input.profileId, createdAt: Date.now() },
      profile, config, engine, bus,
    };
    this.accounts.set(id, acc);
    return acc;
  }

  get(id: SimulationAccountId): SimulationAccount | undefined {
    return this.accounts.get(id);
  }

  require(id: SimulationAccountId): SimulationAccount {
    const acc = this.accounts.get(id);
    if (!acc) throw new Error(`Simulation account ${id} not found`);
    return acc;
  }

  list(): SimulationAccount[] {
    return Array.from(this.accounts.values());
  }

  remove(id: SimulationAccountId): boolean {
    const acc = this.accounts.get(id);
    if (!acc) return false;
    acc.bus.clear();
    return this.accounts.delete(id);
  }

  /** Fan a price tick to every account. Called from the Yahoo Finance layer. */
  broadcastPrice(symbol: string, price: number, ts: number = Date.now()): void {
    for (const acc of this.accounts.values()) {
      acc.engine.onPrice(symbol, price, ts);
    }
  }

  /** Snapshot every account — used by the Analytics / Journal aggregators. */
  snapshotAll(): Array<{ id: SimulationAccountId; snapshot: AccountSnapshot }> {
    return this.list().map((a) => ({ id: a.meta.id, snapshot: a.engine.snapshot() }));
  }

  submit(id: SimulationAccountId, intent: OrderIntent) {
    return this.require(id).engine.submitOrder(intent);
  }

  /** Subscribe to every event across every account. */
  onAny(listener: (e: TradingEvent & { __accountId?: string }) => void): () => void {
    return this.globalBus.on(listener as (e: TradingEvent) => void);
  }
}

function cryptoId(): string {
  if (typeof globalThis !== "undefined" && (globalThis as typeof globalThis & { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID) {
    return (globalThis as typeof globalThis & { crypto: { randomUUID: () => string } }).crypto.randomUUID();
  }
  return `acc_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Singleton for in-process consumers (Trading Workspace, Replay Studio). */
export const simulationAccounts = new SimulationAccountRegistry();
