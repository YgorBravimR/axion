# Fractal Planning Cascade — Design Spec

**Date:** 2026-05-04
**Author:** Ygor (with Claude)
**Status:** Draft, ready for plan

## Problem Statement

Today, Axion's planning surfaces operate as silos:

- `yearly_plan` carries one fixed exit convention (parcial/final/stop/protection in **points**) and a contract-based capital ladder. Locks the trader into a single setup for the entire year.
- `monthly_plan` re-asks for capital, risk %, daily/monthly loss % with **no foreign key to yearly_plan**. Pure duplication of inputs.
- `weekly_targets` is a child of `yearly_plan`, but tracks `ptsAlvo`/`ptsFeito` (points), disconnected from monthly's risk model.
- `daily_targets` is deprecated. No daily plan layer exists.
- Playbooks (`strategies` table) hold free-text exit criteria; trades reference them by ID but exits are not used in any computation.

Trader pain: setup must be re-entered at every level; many playbooks each with own R:R cannot coexist; no cascade of intent from year-vision down to today's execution.

## Goal

A unified, **fractal cascade** of planning fractals that:

1. Mirrors how a trader actually thinks: yearly vision → quarterly review → monthly tier → weekly target → daily intent.
2. Lets each level inherit from its parent and override only what differs.
3. Anchors all risk in **money (R$)**, expressed in R-multiples on playbooks, with concrete R$ derived from the cascade.
4. Multi-tenant: serves many independent traders with sensible defaults; no opinions baked in.

## Locked Decisions

| # | Decision | Value |
|---|---|---|
| 1 | Hierarchy | Year → Quarter → Month → Week → Day (5 fractals) |
| 2 | Cascade model | Inherit + override (lower stores deltas, all override columns nullable) |
| 3 | Risk metric | Money R$ throughout; **no points** in plan layer |
| 4 | Stops | Always money-based (R$); points only used at trade time for contracts derivation |
| 5 | Multi-tenant | Per-account, fully independent users; generic over personal |
| 6 | Playbook role | R-multiple template — instrument-agnostic stop/partial/final/protection in R units |
| 7 | 1R derivation | Yearly capital ladder maps capital band → 1R money (flat per tier) |
| 8 | Tier evaluation cadence | Monthly default, asymmetric — escalation monthly, **deescalation any time on drawdown trigger** |
| 9 | Quarter purpose | Soft strategic layer: goals, reflection notes, playbook rotation. **No tier math, no caps.** |
| 10 | Schema approach | Five typed tables, FK chain (Approach 2 — type-safe, Drizzle-friendly) |

## Architecture

### Table chain

```
tradingAccounts (existing)
  └── yearly_plan          (root, full values)
        └── quarterly_plan (1..4 per year, soft layer)
              └── monthly_plan (1..12 per quarter, tier snapshot)
                    └── weekly_plan (~4..5 per month, refactor of weeklyTargets)
                          └── daily_plan (~5..7 per week, new, lazy-seeded)
```

All FKs `ON DELETE CASCADE`. Delete year → wipes the whole tree.

### Cascade resolution

Read-time merge. Lower levels store ONLY override columns (all nullable). To get the effective value at a given date, walk up the chain until first non-null:

```ts
const effectiveDailyLossR = day.dailyLossR
  ?? week.dailyLossR
  ?? month.dailyLossR
  ?? year.dailyLossR  // root always non-null
```

Wrapped in `resolvePlan()` service with three entry points:
- `resolveDay(accountId, date)`
- `resolveMonth(accountId, year, month)`
- `resolveYear(accountId, year)`

Returns merged effective values **plus provenance** (which level each field came from). Provenance powers UI tagging like `[from Year]` / `[override at Month]`.

Implementation: single SQL with LEFT JOINs from yearly down to daily; merge in TS via `??` chain; track provenance during merge.

### Auto-seed pattern

Creating a yearly_plan auto-seeds 4 quarterly_plan rows + 12 monthly_plan rows + ~52 weekly_plan rows in one transaction. Daily rows are **lazy-seeded** on first override or on calendar tick from command center, to avoid 365 empty rows per trader per year.

## Schema

### `yearly_plan` (root, full values)

```ts
{
  id: uuid PK
  accountId: uuid FK → tradingAccounts(id) ON DELETE CASCADE
  year: integer

  // Capital
  initialCapitalCents: bigint
  currentCapitalCents: bigint  // updated monthly on tier eval

  // Capital ladder: capital band → 1R money (flat per tier)
  ladderRules: jsonb
    [{ minCapitalCents, maxCapitalCents, oneRCents }]

  // Default risk caps in R units
  defaultDailyLossR: decimal      // e.g., 3.0 → stop trading after −3R day
  defaultWeeklyLossR: decimal     // e.g., 6.0
  defaultMonthlyLossR: decimal    // e.g., 10.0 → tier-down trigger
  defaultDailyTargetR: decimal    // e.g., 2.0 → optional profit-stop

  // Tier evaluation
  tierEvalCadence: enum('monthly')  // future: 'biweekly' | 'weekly'
  drawdownTriggerEnabled: boolean default true
  drawdownTriggerThresholdR: decimal  // e.g., −10R intra-month → tier-down

  // Goals
  annualGoalCents: bigint nullable
  tradingDaysPerWeek: integer

  // BR tax
  irTaxRate: decimal default 20.00
  notes: text

  createdAt, updatedAt
}
UNIQUE (accountId, year)
```

### `quarterly_plan` (soft strategic layer)

```ts
{
  id: uuid PK
  yearlyPlanId: uuid FK → yearly_plan(id) ON DELETE CASCADE
  quarter: integer  // 1..4

  goalCents: bigint nullable
  reflectionNotes: text nullable
  postMortemNotes: text nullable

  activePlaybookIds: jsonb nullable  // uuid[]

  createdAt, updatedAt
}
UNIQUE (yearlyPlanId, quarter)
```

### `monthly_plan` (tier snapshot + caps overrides)

```ts
{
  id: uuid PK
  quarterlyPlanId: uuid FK → quarterly_plan(id) ON DELETE CASCADE
  year, month: integer

  // Tier snapshot (computed at month start, frozen for month)
  snapshotCapitalCents: bigint
  snapshotOneRCents: bigint
  snapshotTierIndex: integer
  snapshotComputedAt: timestamp
  snapshotReason: enum('month_start' | 'drawdown_trigger' | 'manual')

  // Override caps (nullable → fall back to year defaults)
  overrideDailyLossR: decimal nullable
  overrideWeeklyLossR: decimal nullable
  overrideMonthlyLossR: decimal nullable
  overrideDailyTargetR: decimal nullable

  overrideActivePlaybookIds: jsonb nullable

  // Tax engine link
  monthlyTaxLedgerId: uuid nullable FK → monthly_tax_ledger(id) ON DELETE SET NULL

  monthlyGoalCents: bigint nullable
  intentNotes: text nullable
  postMortemNotes: text nullable

  createdAt, updatedAt
}
UNIQUE (quarterlyPlanId, month)
```

### `weekly_plan` (refactor of `weeklyTargets`)

```ts
{
  id: uuid PK
  monthlyPlanId: uuid FK → monthly_plan(id) ON DELETE CASCADE
  isoWeek, isoYear: integer

  targetR: decimal nullable
  actualR: decimal nullable
  actualSyncedAt: timestamp nullable

  overrideDailyLossR: decimal nullable
  overrideWeeklyLossR: decimal nullable
  overrideDailyTargetR: decimal nullable

  overrideActivePlaybookIds: jsonb nullable

  intentNotes: text nullable
  postMortemNotes: text nullable

  createdAt, updatedAt
}
UNIQUE (monthlyPlanId, isoWeek, isoYear)
```

### `daily_plan` (new, lazy-seeded)

```ts
{
  id: uuid PK
  weeklyPlanId: uuid FK → weekly_plan(id) ON DELETE CASCADE
  date: date

  targetR: decimal nullable
  maxTradesToday: integer nullable
  preMarketNotes: text nullable
  mood: enum('focused'|'neutral'|'distracted'|'risk_off') nullable

  overrideDailyLossR: decimal nullable
  overrideDailyTargetR: decimal nullable

  overrideActivePlaybookIds: jsonb nullable

  actualR: decimal nullable
  tradesCount: integer nullable
  actualSyncedAt: timestamp nullable
  postMarketNotes: text nullable

  createdAt, updatedAt
}
UNIQUE (weeklyPlanId, date)
```

### `tier_change_log` (audit)

```ts
{
  id: uuid PK
  accountId: uuid FK → tradingAccounts(id) ON DELETE CASCADE
  monthlyPlanId: uuid FK → monthly_plan(id) ON DELETE CASCADE

  fromTierIndex, toTierIndex: integer
  fromOneRCents, toOneRCents: bigint
  triggerReason: enum('month_start' | 'drawdown_trigger' | 'manual')
  triggeredAt: timestamp
}
```

### Playbook (`strategies`) refactor

Add structured R-multiple columns; keep existing free-text fields:

```ts
// New columns on existing strategies table
{
  // ... existing kept (name, code, description, screenshot, etc.)

  stopR: decimal default 1.0
  partialR: decimal nullable
  partialProportion: decimal nullable    // 0..1
  finalR: decimal nullable
  protectionR: decimal nullable

  defaultInstrumentSymbol: varchar(20) nullable

  // Existing targetRMultiple kept as deprecated for backward compat
}
```

App-level invariant (Zod): `partialProportion + (1 - partialProportion) = 1.0` if partial leg exists.

### Trade refactor

```ts
// New columns on existing trades table
{
  // strategyId already exists — repurpose as playbookId in app code

  oneRSnapshotCents: bigint nullable    // 1R at trade entry, audit-locked
  rOutcome: decimal nullable            // pnl_cents / oneRSnapshotCents — populated on close
}
```

`oneRSnapshotCents` is captured at trade entry from `resolveDay(today).oneRCents` and frozen, immune to subsequent plan edits. Enables R-based analytics across ladder changes.

## Trade-time math

At trade entry, given playbook + month snapshot + chart stop in points + instrument tick value:

```
oneR_cents = monthly_plan.snapshotOneRCents
stopMoney_per_contract = stopPoints × tickValue_cents
contracts = floor(oneR_cents / stopMoney_per_contract)
actual_stop_cents = contracts × stopMoney_per_contract

partial_target_cents = oneR_cents × playbook.partialR
partial_contracts = round(contracts × playbook.partialProportion)

final_target_cents = oneR_cents × playbook.finalR
final_contracts = contracts - partial_contracts

protection_offset_cents = oneR_cents × playbook.protectionR
```

## Drawdown trigger ↔ equity-shield

Existing `equity-shield` feature monitors intraday equity. Hook:

1. On equity tick: if equity drops to `currentTier.minCapitalCents - thresholdR × oneR`, fire trigger.
2. Compute new tier on current capital.
3. Update `monthly_plan.snapshot*` with `snapshotReason='drawdown_trigger'`, refresh `snapshotComputedAt`.
4. Emit `tier_change_log` row.
5. Push notification: "Tier dropped from X to Y; 1R now R$Z."

No daily polling needed — equity-shield already streams.

## Tax engine integration

`monthly_tax_ledger` gains `monthlyPlanId: uuid nullable FK`.

Auto-link rule: when `monthly_plan` is created (year+month+account), find matching ledger row (same year+month+account) and set both directions.

DARF computation logic untouched. Monthly_plan view embeds existing `MonthlyDarfCard` via the FK.

## UI navigation

### Routes

```
/plan                              → year selector (default current year)
/plan/[year]                       → year overview + ladder editor
/plan/[year]/q[1-4]                → quarter view
/plan/[year]/[month]               → month view (snapshot + DARF + week strip)
/plan/[year]/[month]/w[isoweek]    → week view (target + day strip)
/plan/[year]/[month]/[date]        → day view (pre/post-market split by time)
```

Breadcrumb: `2026 ▸ Q2 ▸ May ▸ Week 19 ▸ Wed May 6` — every segment clickable.

### Provenance tags

Every overridable field renders inline provenance:

```
Daily loss cap: −3R    [from Year]      [Override...]
Daily loss cap: −2R    [override at Month]   [Reset]   [Override deeper...]
```

`Override...` opens inline popover, persists at current level. `Reset` nulls the override at current level → falls back to parent.

### Per-page sections

**Year overview:** capital ladder editor; default risk caps; tier eval settings; annual goal + progress; quarter strip; tier_change_log.

**Quarter view:** goals + actual progress; active playbook chip selector; reflection notes; month strip.

**Month view:** snapshot panel (1R, tier, computed at, reason — gold-accent hero); override caps; goals & intent; embedded DARF card; week strip.

**Week view:** target/actual R gauge; day strip (Mon–Fri cards); collapsed override caps; intent + post-mortem.

**Day view, pre-market mode:** target R, max trades, mood enum, pre-market notes, override caps editor.

**Day view, post-market mode:** actual R + trades count synced from trades, post-market reflection, inline trade list (deep-link to journal).

Mode flip determined by current time vs market hours; manual override allowed.

### Existing surface integration

- **Command center (`/command-center`):** add Today's Plan strip (effective 1R, daily loss cap, daily target, max trades, mood prompt, active playbooks). Single CTA → `/plan/.../[date]`.
- **Journal trade entry (`/journal/new`):** auto-fill 1R from `resolveDay(today)`, playbook picker auto-loads stop/partial/final R, contracts preview real-time as user enters chart stop.
- **Reports:** add new "R-based" tab — distribution of trade R outcomes, R per playbook, R per month.

### Removed routes

- `/yearly-plan` → 301 to `/plan/[currentYear]`
- `/monthly` → 301 to `/plan/[currentYear]/[currentMonth]`

## Migration strategy

Four-phase, reversible until Phase 4.

### Phase 1 — Additive schema (zero break)

- Create new tables: `quarterly_plan`, `monthly_plan` (new shape), `weekly_plan`, `daily_plan`, `tier_change_log`.
- Add new columns to `strategies`: stopR, partialR, partialProportion, finalR, protectionR, defaultInstrumentSymbol (all nullable).
- Add new columns to `trades`: oneRSnapshotCents, rOutcome (both nullable).
- Add `monthlyPlanId` to `monthly_tax_ledger` (nullable).
- Old tables untouched. App still uses old paths. New tables empty.

### Phase 2 — Code dual-write + cascade resolver

- Build `resolvePlan()` service reading new tables.
- Server actions for new fractals (CRUD per level).
- Existing UI continues serving old `yearlyPlans`/`monthlyPlans`/`weeklyTargets`. New UI gated behind feature flag.
- New trade entry: optionally write `oneRSnapshotCents` and compute `rOutcome` on close.

### Phase 3 — Migration script + UI cutover

- Translation script per `tradingAccount`:
  - Generate one `yearly_plan` row per existing `yearlyPlans` row. Translate ladder: contract bands → capital bands using historical balance progression. Default 1R per tier inferred from `valorPorContratoCents`.
  - Seed 4 `quarterly_plan` rows (empty goals).
  - Seed up to 12 `monthly_plan` rows. Hydrate snapshot fields from current `monthlyPlans` if matching record exists; else fresh from yearly defaults.
  - Convert `weeklyTargets` rows → `weekly_plan`. `targetR = ptsAlvo × pointValue ÷ inferredOneR`.
  - Set playbook structured fields: existing `targetRMultiple` → `finalR`, default `stopR=1.0`.
- Backfill trade columns: `oneRSnapshotCents` from month-of-trade resolved 1R, `rOutcome = pnl / oneRSnapshotCents`.
- Flip feature flag → new UI live.

### Phase 4 — Cleanup (next release after soak)

- Drop `monthlyPlans` (orphan).
- Drop `dailyTargets` (already deprecated).
- Drop yearly exit columns: `exitParcialPts`, `exitFinalPts`, `exitStopPts`, `exitProtPts`, `exitParcialProportion`, `exitFinalProportion`.
- Drop `valorPorContratoCents` from `yearlyPlans` once UI no longer references it.
- Mark `strategies.targetRMultiple` for removal.
- Old `weeklyTargets` superseded by `weekly_plan` — drop.

## Out of scope (v1)

- Group/team templates (every trader fully independent).
- Configurable tier eval cadences other than monthly (`tierEvalCadence` enum has only `'monthly'` in v1; designed extensible).
- N-leg playbook structures (two-leg partial/final only).
- Smooth/interpolated 1R within tier (flat per tier locked).
- Cross-account plan sharing/cloning.
- Notifications beyond drawdown trigger.

## Open questions (acceptable to defer)

- UI for jagged-month edge cases (week 1 spans Dec→Jan; ISO year vs calendar year handling): existing `weeklyTargets` already deals with `isoYear` separately, reuse pattern.
- Multi-currency: out of scope, BR-only (R$).
- Replay accounts: existing tax engine skips them; new cascade should also skip drawdown trigger and tier eval.

## Acceptance criteria

1. Trader can create a yearly plan; system auto-seeds quarterly/monthly/weekly stubs.
2. `resolveDay(today).oneRCents` returns the correct value walking the cascade.
3. Override at month level for `dailyLossR` is reflected in `resolveDay()` provenance as `month`.
4. Reset of month override falls back to year value.
5. Drawdown trigger fires when intraday equity drops below tier floor; tier_change_log row inserted.
6. Trade entry pulls 1R from `resolveDay()`, persists `oneRSnapshotCents`, computes `rOutcome` on close.
7. Existing `monthly_tax_ledger` rows auto-link to new `monthly_plan` rows on creation.
8. Migration script processes a representative `tradingAccount` end-to-end without data loss; all historical trades have populated `oneRSnapshotCents` and `rOutcome`.
9. Removed routes (`/yearly-plan`, `/monthly`) 301 to new equivalents.
10. Day view auto-switches between pre-market and post-market modes based on time.
