/**
 * Minimal typed event bus for the Trading Engine.
 * No dependencies — works in browser, server functions, and tests.
 */

import type { TradingEvent } from "./types";

type Listener = (e: TradingEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  private byType = new Map<TradingEvent["type"], Set<Listener>>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onType<T extends TradingEvent["type"]>(
    type: T,
    listener: (e: Extract<TradingEvent, { type: T }>) => void,
  ): () => void {
    let set = this.byType.get(type);
    if (!set) { set = new Set(); this.byType.set(type, set); }
    set.add(listener as Listener);
    return () => set!.delete(listener as Listener);
  }

  emit(event: TradingEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch { /* swallow to avoid one listener breaking others */ }
    }
    const set = this.byType.get(event.type);
    if (set) for (const l of set) { try { l(event); } catch { /* ignore */ } }
  }

  clear(): void {
    this.listeners.clear();
    this.byType.clear();
  }
}
