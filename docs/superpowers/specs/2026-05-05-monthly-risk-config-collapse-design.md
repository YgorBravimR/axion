# Monthly Risk Config Collapse — Phase 4b Design

**Status:** design
**Date:** 2026-05-05
**Branch:** feat/yearly-tax-reporting (extends existing fractal-plan work)
**Predecessor:** Phase 4 Task 7 (table rename `monthlyPlans` → `monthlyRiskConfig`) shipped.

---

## Goal

Single source of truth for risk caps + position sizing + adaptive behaviors. The fractal cascade (year → quarter → month → week → day) owns everything risk-related. Legacy `monthlyRiskConfig` table is dropped. `riskManagementProfiles` is rebased to R-multiples and survives as a reusable preset library, pluggable at any fractal level.

This serves Axion's pivoted identity: not just a journal, but the trader's command center / general quarters. Every piece of account-level risk state lives in the cascade.

## Why

Three parallel definitions of "daily loss cap" exist today:

1. `monthlyRiskConfig.dailyLossCents` — derived from balance × `dailyLossPercent`
2. `riskManagementProfiles.dailyLossCents` — preset cents value, decision tree references it
3. Fractal resolver: `resolveDay` → `defaultDailyLossR × snapshotOneRCents`

The circuit breaker has to pick one. Bug magnet. Same applies to monthly cap, weekly cap, profit target, max trades, base risk size. Roughly 80% of `monthlyRiskConfig`'s columns duplicate fractal cascade fields.

Legacy `monthlyRiskConfig` also encrypts a stale balance snapshot, while the real ledger lives in `accountCapitalEvents` + `accountMonthlyAggregate.netCents`.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Full collapse — drop `monthlyRiskConfig` after callers migrate | Cleanest. No "two systems" period beyond migration window. |
| D2 | Rebase `riskManagementProfiles` to R-multiples now | Decision tree expressed in R. No parallel cents/R representation. |
| D3 | Drop encrypted account balance entirely | `initialCapitalCents` + `accountCapitalEvents` + `accountMonthlyAggregate` is the real ledger. Encryption protected stale duplicate. |
| D4 | Behavior overrides mirror R-cap overrides per fractal level | Same provenance pattern. One mental model. |
| D5 | `riskManagementProfiles` stays as preset library, FK from fractal levels | Reusable across years/accounts. |

## Schema Changes

### A. `yearlyPlans` — add behavior defaults

```sql
ALTER TABLE yearly_plans ADD COLUMN default_risk_profile_id uuid
    REFERENCES risk_management_profiles(id) ON DELETE SET NULL;
ALTER TABLE yearly_plans ADD COLUMN default_max_consecutive_losses integer;
ALTER TABLE yearly_plans ADD COLUMN default_allow_second_op_after_loss boolean DEFAULT true;
ALTER TABLE yearly_plans ADD COLUMN default_reduce_risk_after_loss boolean DEFAULT false;
ALTER TABLE yearly_plans ADD COLUMN default_risk_reduction_factor decimal(5,2);
ALTER TABLE yearly_plans ADD COLUMN default_increase_risk_after_win boolean DEFAULT false;
ALTER TABLE yearly_plans ADD COLUMN default_cap_risk_after_win boolean DEFAULT false;
ALTER TABLE yearly_plans ADD COLUMN default_profit_reinvestment_percent decimal(5,2);
```

### B. `monthlyPlan` — add behavior overrides

```sql
ALTER TABLE monthly_plan ADD COLUMN override_risk_profile_id uuid
    REFERENCES risk_management_profiles(id) ON DELETE SET NULL;
ALTER TABLE monthly_plan ADD COLUMN override_max_consecutive_losses integer;
ALTER TABLE monthly_plan ADD COLUMN override_allow_second_op_after_loss boolean;
ALTER TABLE monthly_plan ADD COLUMN override_reduce_risk_after_loss boolean;
ALTER TABLE monthly_plan ADD COLUMN override_risk_reduction_factor decimal(5,2);
ALTER TABLE monthly_plan ADD COLUMN override_increase_risk_after_win boolean;
ALTER TABLE monthly_plan ADD COLUMN override_cap_risk_after_win boolean;
ALTER TABLE monthly_plan ADD COLUMN override_profit_reinvestment_percent decimal(5,2);
```

FK name explicit, ≤ 63 chars: `monthly_plan_override_risk_profile_id_fk`.

### C. `weeklyPlan` — subset (within-session adaptive only)

```sql
ALTER TABLE weekly_plan ADD COLUMN override_max_consecutive_losses integer;
ALTER TABLE weekly_plan ADD COLUMN override_allow_second_op_after_loss boolean;
```

Rationale: profile + reduction factors don't make sense at weekly grain (decision tree is daily-tick). Only the in-session safeguards override.

### D. `dailyPlan` — same subset as weekly

```sql
ALTER TABLE daily_plan ADD COLUMN override_max_consecutive_losses integer;
ALTER TABLE daily_plan ADD COLUMN override_allow_second_op_after_loss boolean;
```

### E. `riskManagementProfiles` — drop cents columns, rebase

```sql
ALTER TABLE risk_management_profiles DROP COLUMN base_risk_cents;
ALTER TABLE risk_management_profiles DROP COLUMN daily_loss_cents;
ALTER TABLE risk_management_profiles DROP COLUMN weekly_loss_cents;
ALTER TABLE risk_management_profiles DROP COLUMN monthly_loss_cents;
ALTER TABLE risk_management_profiles DROP COLUMN daily_profit_target_cents;
```

`decision_tree` text column kept. JSON migration script converts existing keys:

```ts
// In migration: for each row, look up an active monthlyRiskConfig with this profile,
// derive currentOneRCents, then replace cents → R = round(cents / oneRCents, 2).
// If no active config exists, use the most recent yearly_plans.ladderRules tier 1.
// Keys to convert (JSON paths): node.thresholdCents → node.thresholdR;
// action.adjustToCents → action.adjustToR; etc. Document in migration file.
```

### F. Drop `monthlyRiskConfig`

After all callers migrate (Group 4 below):

```sql
DROP TABLE monthly_risk_config;
```

## Resolver Extensions

### `resolveBehavior`

```ts
interface BehaviorResolved {
    riskProfileId: string | null
    riskProfileId_provenance: ProvenanceLevel  // 'year' | 'month' | 'fallback'
    maxConsecutiveLosses: number | null
    maxConsecutiveLosses_provenance: ProvenanceLevel
    allowSecondOpAfterLoss: boolean
    allowSecondOpAfterLoss_provenance: ProvenanceLevel
    reduceRiskAfterLoss: boolean
    reduceRiskAfterLoss_provenance: ProvenanceLevel
    riskReductionFactor: number | null
    riskReductionFactor_provenance: ProvenanceLevel
    increaseRiskAfterWin: boolean
    increaseRiskAfterWin_provenance: ProvenanceLevel
    capRiskAfterWin: boolean
    capRiskAfterWin_provenance: ProvenanceLevel
    profitReinvestmentPercent: number | null
    profitReinvestmentPercent_provenance: ProvenanceLevel
}

const resolveBehavior = async ({
    accountId,
    date,
}: {
    accountId: string
    date: Date
}): Promise<BehaviorResolved>
```

Cascade: day → week → month → year. Within-session fields (maxConsec, secondOp) check all four levels; profile + reduction-factor fields skip week/day (year + month only). Fallback constants for nullable booleans = `false`.

### `resolveBalance`

```ts
interface BalanceResolved {
    balanceCents: number
    initialCapitalCents: number
    capitalEventsDelta: number
    realizedPnlDelta: number
    computedAt: Date
}

const resolveBalance = async ({
    accountId,
    date,
}: {
    accountId: string
    date: Date  // balance "as-of" this date (inclusive)
}): Promise<BalanceResolved>
```

Implementation:

```ts
const yearly = await db.query.yearlyPlans.findFirst({
    where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, date.getFullYear())),
})
if (!yearly) throw new Error("no yearly plan for date")

const events = await db.query.accountCapitalEvents.findMany({
    where: and(
        eq(accountCapitalEvents.accountId, accountId),
        lte(accountCapitalEvents.eventDate, date.toISOString().slice(0, 10)),
    ),
})

const aggregates = await db.query.accountMonthlyAggregate.findMany({
    where: eq(accountMonthlyAggregate.accountId, accountId),
})
const aggUpTo = aggregates.filter((a) =>
    a.year < date.getFullYear() ||
    (a.year === date.getFullYear() && a.month <= date.getMonth() + 1),
)

const capitalEventsDelta = events.reduce(
    (sum, e) => sum + (e.eventType === "deposit" ? e.amountCents : -e.amountCents),
    0,
)
const realizedPnlDelta = aggUpTo.reduce((sum, a) => sum + a.netCents, 0)

return {
    balanceCents: yearly.initialCapitalCents + capitalEventsDelta + realizedPnlDelta,
    initialCapitalCents: yearly.initialCapitalCents,
    capitalEventsDelta,
    realizedPnlDelta,
    computedAt: new Date(),
}
```

Replaces every read of `monthlyRiskConfig.accountBalance`.

## Caller Migration (14 files)

### Group 1 — API routes (delete)

| File | Action |
|---|---|
| `src/app/api/arch/monthly-risk-config/upsert/route.ts` | DELETE — replaced by `monthlyPlan` editor server actions |
| `src/app/api/arch/monthly-risk-config/get/route.ts` | DELETE — clients call resolver |
| `src/app/api/arch/monthly-risk-config/active/route.ts` | DELETE — clients call resolver |

### Group 2 — Server actions

| File | Action |
|---|---|
| `src/app/actions/monthly-risk-config.ts` | DELETE entirely |
| `src/app/actions/yearly-plan.ts` | Drop `monthlyRiskConfig` reads; add behavior fields to create/update schema (D1) |
| `src/app/actions/annual-reports.ts` | Replace `monthlyRiskConfig` reads with `resolveBalance` + `resolveDay` |
| `src/app/actions/accounts.ts` | Drop `monthlyRiskConfig` joins from account fetch |
| `src/app/actions/command-center.ts` | Use `resolveDay` + `resolveBehavior` + `resolveBalance` |
| `src/app/actions/live-trading-status.ts` | Same |

### Group 3 — Live API (rewrite)

| File | Action |
|---|---|
| `src/app/api/arch/command-center/circuit-breaker/route.ts` | Rewrite: caps from `resolveDay` (multiplied by `monthlyPlan.snapshotOneRCents`), behaviors from `resolveBehavior`, consumption-today from live trades query, monthly-consumption from `accountMonthlyAggregate.netCents` |
| `src/app/api/arch/live-status/route.ts` | Same dependency swap |

### Group 4 — Tests

| File | Action |
|---|---|
| `src/__tests__/lib/yearly-plan/actions-stub.test.ts` | Update fixtures — drop `monthlyRiskConfig` setup, add behavior defaults to yearly plan input |
| `src/__tests__/lib/yearly-plan/schema-types.test.ts` | Existing test asserts `schema.monthlyPlans` undefined; add `expect(schema.monthlyRiskConfig).toBeUndefined()` after Phase 4b ships |

## Migration Sequence (5 commits)

### Commit 1 — Schema additions

- Drizzle migration: add columns A–D (yearly + monthly + weekly + daily behavior cols)
- No code change beyond schema.ts edits + relation updates
- Tests: assert new columns nullable / default-correct via `db.query.yearlyPlans.findFirst()` reflection
- Reversible: drop column migration

### Commit 2 — Resolver extension

- Add `resolveBehavior` + `resolveBalance` in `src/lib/fractal-plan/resolver.ts`
- Unit tests in `src/__tests__/lib/fractal-plan/resolver-behavior.test.ts` + `...resolver-balance.test.ts`
- Cover: cascade order, provenance per field, missing-yearly-plan error, deposit/withdrawal sign, aggregate sum cutoff
- No callers yet

### Commit 3 — `riskManagementProfiles` rebase

- Drizzle migration drops cents columns
- One-time TypeScript migration script `scripts/migrate-decision-tree-cents-to-r.ts`:
  - Reads each profile + its most-active monthlyRiskConfig (or fallback ladder tier-1)
  - Converts `decisionTree` JSON cents keys to R keys
  - Writes back, marks `updatedAt`
- Update `src/lib/risk-profiles/decision-tree.ts` types: cents → R
- Update profile editor UI labels: "1R" instead of "R$ 100"
- Tests: round-trip a sample tree

### Commit 4 — Caller migration

- Rewrite circuit-breaker + live-status on resolver
- Delete `monthly-risk-config/*` API routes
- Delete `src/app/actions/monthly-risk-config.ts`
- Update yearly-plan / annual-reports / accounts / command-center / live-trading-status
- Add behavior fields to yearly + monthly editor server actions
- Tests: integration test for circuit breaker with new resolver
- Reversible by branch revert (atomic commit)

### Commit 5 — Drop table

- Drizzle migration: `DROP TABLE monthly_risk_config`
- Remove `monthlyRiskConfig` export + relations + types from `src/db/schema.ts`
- Update `schema-types.test.ts` — add undefined assertion
- One last grep: zero `monthlyRiskConfig` identifiers in `src/`

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Decision tree JSON migration corrupts existing profiles | Migration script logs every conversion; backup table dump before run; revert script in same file |
| Circuit breaker behavior change (cap recalc on every tick vs month-frozen) | Document in commit message; add caching layer in resolver if performance becomes issue |
| Existing UI "Monthly Risk Config" page exists in the app | Phase 5 (in-flight) replaces with `/plan/[year]/[quarter]/[month]` page; redirect legacy route in middleware |
| Live balance computed from aggregates may lag | Aggregates have `isDirty` flag — resolver uses live trade query if `isDirty=true`; document fallback |

## Out of Scope

- New UI for behavior editing (Phase 5 fractal editors absorb behavior fields as new form sections)
- Tax-related changes (separate concern, separate phase)
- Multi-account inheritance (single-account-per-user assumption holds)

## Self-Review Checklist

- [x] Every requirement maps to a commit (5 commits, each with deliverables)
- [x] No "TBD" placeholders
- [x] FK names ≤ 63 chars (verified: `monthly_plan_override_risk_profile_id_fk` = 41)
- [x] Existing audit trails (`tierChangeLog` for sizing; fractal `updatedAt` for behavior overrides) cover the new fields
- [x] Reversibility addressed per commit
- [x] No spec section contradicts another (yearly behavior defaults match cascade direction; week/day subset matches "within-session" rationale)

## File Inventory

### New files
- `src/__tests__/lib/fractal-plan/resolver-behavior.test.ts`
- `src/__tests__/lib/fractal-plan/resolver-balance.test.ts`
- `scripts/migrate-decision-tree-cents-to-r.ts`
- Drizzle migration files for commits 1, 3, 5

### Deleted files
- `src/app/api/arch/monthly-risk-config/upsert/route.ts`
- `src/app/api/arch/monthly-risk-config/get/route.ts`
- `src/app/api/arch/monthly-risk-config/active/route.ts`
- `src/app/actions/monthly-risk-config.ts`

### Modified files
- `src/db/schema.ts`
- `src/lib/fractal-plan/resolver.ts`
- `src/lib/risk-profiles/decision-tree.ts`
- `src/app/actions/yearly-plan.ts`
- `src/app/actions/annual-reports.ts`
- `src/app/actions/accounts.ts`
- `src/app/actions/command-center.ts`
- `src/app/actions/live-trading-status.ts`
- `src/app/api/arch/command-center/circuit-breaker/route.ts`
- `src/app/api/arch/live-status/route.ts`
- `src/__tests__/lib/yearly-plan/actions-stub.test.ts`
- `src/__tests__/lib/yearly-plan/schema-types.test.ts`
- (Phase 5 fractal editors gain behavior form section — yearly + monthly + weekly + daily editors)
