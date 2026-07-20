# Strategy Builder

The trader's "second brain": a versioned strategy library with a visual
flow editor, checklist, and performance rollups linked back to real
trades.

## Files

- `types.ts` — `Strategy`, `StrategyVersion`, `FlowNode`, `Checklist`.
- `calculations.ts` — Performance aggregates (win rate, expectancy,
  average RR, drawdown) computed from `trades` filtered by
  `strategy_id`. Pure — safe to memoize.
- `storage.ts` — Attachment/screenshot storage helpers.
- `constants.ts` — Node types, default checklists.

## Server surface

`src/lib/strategy.functions.ts` — create/update/publish strategy
versions, attach trades, compute rollups.

## Data model

- `strategies` — root record per user.
- `strategy_versions` — immutable snapshots; publishing creates a new
  version.
- `strategy_flow_nodes` — nodes for the drag-and-drop editor.
- `strategy_checklist_items` — pre-trade checklist bound to a version.
- `strategy_trades` — join table linking closed trades to a version
  for the performance rollup.

## Rules

- Never mutate a published version — always create a new one.
- Performance rollups are read-only projections; regenerate on demand.
