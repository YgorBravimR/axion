# Dev Pages — Hawks Audit, Engine Lab, Fibo Lab

> Internal tooling for engine diagnostics. Not exposed to traders.

**Routes:** `/[locale]/dev/fibo-lab`, `/dev/hawks-audit`, `/dev/hawks-engine-lab`
**Server actions:** `hawks-audit-debug.ts`, `hawks-engine-lab-data.ts`, `hawks-isolation-data.ts`, `hawks-renko.ts`
**Data:** `/data/hawks/user-entries/` (dev-curated catalogs)

## Purpose

Reproduce the Hawks cascade and Renko engine outside the backtest UI, with enough hooks to diagnose why a specific entry fired or didn't.

## What lives there

- **Hawks Audit** — date picker; entry/exit logs; engine diagnostics; cascade checks; brick reconstruction.
- **Engine Lab** — date range + strategy params; backtest run with debug overlays.
- **Fibo Lab** — manual Fibonacci sketcher; no server state.

## Inputs

Dates, strategy params, manual Fibo levels.

## Outputs

- Trade-by-trade decision tree traversal.
- Engine metrics + trade list.
- Edge-case isolation data.

## Cross-feature integrations

- **Backtest** — shares engine.
- **Settings Catalog Bundles** — same JSON source.

## Where it fails

- **Admin-only access enforced via path inspection** — easy to bypass in dev mode if guards aren't tightened.
- **No persistent state on Fibo Lab.** Refresh kills your levels.
- **Audit log volume.** A long backtest produces megabytes; UI doesn't paginate gracefully.

## Power combos

1. **Backtest anomaly → Audit replay.** Spot weird trade in backtest → open audit for the same date → step through cascade. The only way to debug a Hawks decision rigorously.
2. **Catalog bundle + Engine Lab.** Run engine lab on a curated catalog → compare to what the live engine produced → divergence = regression.
