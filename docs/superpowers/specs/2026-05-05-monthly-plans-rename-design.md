# Phase 4b — Rename `monthlyPlans` to `monthlyRiskConfig`

**Status:** Design — pending implementation plan
**Author:** Ygor Bravim (with Claude Opus 4.7)
**Branch:** `feat/yearly-tax-reporting`
**Predecessors:** Phase 1 (fractal schema) → Phase 2 (resolver+actions) → Phase 3 (cutover) → Phase 4 Tasks 1, 4–7 (cleanup, shipped)

---

## Context

The fractal planning cascade (Phases 1–3) added a new `monthlyPlan` table (singular, fractal) that holds R-cap overrides and Σ-aware target weeks. The legacy `monthlyPlans` table (plural) still exists alongside it.

Phase 4's design spec assumed `monthlyPlans` was an orphan to drop. Investigation during Phase 4 Task 2 surfaced that this is wrong: the table holds 17 risk-management config columns (`accountBalance`, `riskPerTradePercent`, `dailyLossPercent`, `monthlyLossPercent`, `dailyProfitTargetPercent`, `maxDailyTrades`, `maxConsecutiveLosses`, `riskProfileId`, `weeklyLoss/profit/risk percent+cents`, `derivedMaxDailyTrades`, `allowSecondOpAfterLoss`, `reduceRiskAfterLoss`, `riskReductionFactor`, `increaseRiskAfterWin`, `capRiskAfterWin`, `profitReinvestmentPercent`) that power the live circuit-breaker, command-center, and live-trading-status. 10 callers, ~3565 LOC.

This spec covers the **minimal close-out** chosen during brainstorming: rename only. No data model changes. Risk-config redesign is deferred to a future epic.

## Goal

Resolve the naming collision between legacy `monthlyPlans` (plural, risk-config) and fractal `monthlyPlan` (singular, R-cap targets) by renaming the legacy table to `monthlyRiskConfig`. Preserve all semantics, query patterns, and field names.

## Non-Goals

- Reshape the risk-config data model.
- Move risk fields into the fractal cascade.
- Change body shapes of arch API endpoints.
- Add migrations to the existing `riskManagementProfiles` table.
- Touch the live circuit-breaker logic except for identifier renames.

## Architecture

A flat rename refactor. One DB rename. Mechanical identifier renames across the 10 caller files. Folder rename for the arch API surface.

### Naming decisions

| Old | New |
|---|---|
| Table `monthly_plans` | `monthly_risk_config` |
| Drizzle export `monthlyPlans` | `monthlyRiskConfig` |
| Relation `monthlyPlansRelations` | `monthlyRiskConfigRelations` |
| Type `MonthlyPlan` / `NewMonthlyPlan` | `MonthlyRiskConfig` / `NewMonthlyRiskConfig` |
| Action file `actions/monthly-plans.ts` | `actions/monthly-risk-config.ts` |
| Arch route folder `api/arch/monthly-plans/` | `api/arch/monthly-risk-config/` |
| Local var `rawMonthlyPlan` | `rawMonthlyRiskConfig` |
| Local var `monthlyPlan` (in legacy contexts) | `monthlyRiskConfig` |

Columns themselves are unchanged — none reference "plan" in their names.

## Components

### Schema (`src/db/schema.ts`)

- Rename pgTable export: `monthlyPlans` → `monthlyRiskConfig`
- Rename DB table string: `"monthly_plans"` → `"monthly_risk_config"`
- Rename relation export: `monthlyPlansRelations` → `monthlyRiskConfigRelations`
- Rename type exports: `MonthlyPlan` → `MonthlyRiskConfig`; `NewMonthlyPlan` → `NewMonthlyRiskConfig`
- Update any `tradingAccountsRelations` reference that names `monthlyPlans` in the relation map.
- Index/unique-constraint names within the table can stay if they don't collide; if Drizzle regenerates them with the new prefix, accept the regeneration.

### Migration (`src/db/migrations/0037_*.sql`)

Hand-written:

```sql
ALTER TABLE "monthly_plans" RENAME TO "monthly_risk_config";
```

Drizzle Kit may emit `DROP+CREATE` if it doesn't detect a rename. Override by writing the migration by hand and then regenerating the snapshot via `bun run db:generate` (which will see the schema and the post-rename DB state and produce a no-op or a snapshot-only update).

### Action layer

- File rename: `src/app/actions/monthly-plans.ts` → `monthly-risk-config.ts`
- Update all imports that reference the file path.
- Inside the file, every `monthlyPlans` identifier becomes `monthlyRiskConfig`.
- Function names that include "monthlyPlan" (e.g., `upsertMonthlyPlan`, `getActiveMonthlyPlan`) become `upsertMonthlyRiskConfig`, `getActiveMonthlyRiskConfig`.
- Caller in `yearly-plan.ts` (`syncCapitalBetweenPlans`) updates the identifier.

### Arch API routes

- Folder rename: `src/app/api/arch/monthly-plans/` → `monthly-risk-config/`
- Files inside (`upsert/`, `get/`, `active/`) keep their structure.
- Request/response body shapes unchanged.
- Internal references to schema identifiers updated.

### Other callers

Mechanical rename in:

- `src/app/actions/annual-reports.ts`
- `src/app/actions/live-trading-status.ts`
- `src/app/actions/accounts.ts` (deletion cascade)
- `src/app/actions/command-center.ts`
- `src/app/api/arch/command-center/circuit-breaker/route.ts`
- `src/app/api/arch/live-status/route.ts`
- `src/__tests__/lib/yearly-plan/actions-stub.test.ts`

## Data flow

Unchanged. Every read/write goes to the same row keyed by `(accountId, year, month)`. Same circuit-breaker logic consumes `riskPerTradePercent`, `dailyLossPercent`, etc.

## API contract

All response shapes preserved. URLs change:

| Before | After |
|---|---|
| `GET /api/arch/monthly-plans/get` | `GET /api/arch/monthly-risk-config/get` |
| `POST /api/arch/monthly-plans/upsert` | `POST /api/arch/monthly-risk-config/upsert` |
| `GET /api/arch/monthly-plans/active` | `GET /api/arch/monthly-risk-config/active` |

Per the brainstorming decision, this is a clean break — external arch tool consumers must update their URLs. No 308 redirect.

## Error handling

Unchanged. Same `ActionResponse<T>` shape, same error codes.

## Testing

- `actions-stub.test.ts` updated to mock the renamed module path and identifiers.
- Schema-shape test: assert `schema.monthlyRiskConfig` is defined and `schema.monthlyPlans` is `undefined`.
- Manual smoke check (operator step): command-center circuit-breaker fires correctly; live-trading-status returns expected risk gates; arch upsert via the new URL persists.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Drizzle Kit emits DROP+CREATE instead of RENAME, causing data loss on apply | Hand-write the migration; verify with `cat` before `psql -f`; regenerate snapshot only after rename is applied locally. |
| Drizzle snapshot mismatch after manual SQL rename | Run `bun run db:generate` post-rename to align the snapshot with the post-rename DB. |
| Arch API consumers break on URL change | Documented, intentional per minimal-close-out brief. |
| Silent identifier collisions during sed-based rename (`monthlyPlans` substring of `fractalMonthlyPlans`?) | None exist — verified via grep. Use word-boundary `\b` in any regex-based rename. |
| Index name collisions in renamed table | If Drizzle regenerates index names with the `monthly_risk_config_` prefix, accept the rename in a follow-on migration. |

## Out of scope (future tickets)

- Folding `accountBalance` into a single source-of-truth (today it lives both on `tradingAccounts` and `monthlyPlans`).
- Decomposing `monthlyRiskConfig` into a join with `riskManagementProfiles` (proper override pattern).
- Removing `derivedMaxDailyTrades` (computed-and-stored anti-pattern).

## Acceptance criteria

- `bun run lint` clean
- `bun run test:unit` all green (1088 → 1088, no count change expected)
- `grep -rn "monthlyPlans\b" src` returns zero hits outside `/migrations/` (the renamed schema export breaks any straggler import)
- Manual: arch URL `POST /api/arch/monthly-risk-config/upsert` round-trips a row
- Live: command-center circuit-breaker fires when `dailyLossPercent` is exceeded (smoke check via UI)

---

**Estimated work:** Single implementation plan, ~10–15 tasks, one day of work.
**Next step:** writing-plans skill produces the detailed plan.
