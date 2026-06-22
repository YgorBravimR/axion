# Indicator Lab

> Indicator catalog: browse formulas, see usage across strategies, CRUD definitions (admin).

**Routes:** `/[locale]/indicator-lab`, `/indicator-lab/[date]`
**Server actions:** `indicators.ts`
**Files:** `src/app/[locale]/(app)/indicator-lab/**`

## Purpose

A single browseable home for every indicator referenced by strategies, backtests, and Hawks quality gates. Admin-managed.

## What lives there

- List of indicator groups (sorted).
- Per-indicator detail: formula, params (period, source, threshold), description.
- Admin CRUD: create/update/soft-delete groups + definitions.

## Inputs

- Admin only: indicator group name, sort order, individual definitions (name, type, formula, params).

## Outputs

- `indicatorDefinitions` + `indicatorGroups` rows.
- Read API consumed by Playbook conditions, Backtest engine, Hawks quality gates.

## Cross-feature integrations

- **Backtest** — engine evaluates indicators per candle.
- **Hawks quality gates** — consume Renko, VWAP, Keltner, SR, volume, HTF state from here.
- **Playbook conditions** — reference indicator definitions for tier rules.
- **Settings** — admin panel surfaces CRUD.

## Where it fails

- **Read-only for non-admins.** A trader can't add a new indicator without filing a request.
- **No live formula validation.** Bad formula only fails when the backtest runs.
- **Cache invalidation needs `invalidateSettingsData`** — easy to miss in a custom mutation.
- **No usage drill-down.** Indicator detail page doesn't say "used by 4 strategies, 12 conditions" — has to be inferred.

## Power combos

1. **Indicator → Condition → Strategy.** Admin adds a new indicator → trader builds a condition tier from it → strategy includes that tier → Plan compliance now tracks it. Four surfaces in a chain.
2. **Indicator diff before strategy edit.** Open indicator detail → compare to the strategy criteria text → if the strategy mentions the indicator but no condition references it, that's an unbacked claim.
