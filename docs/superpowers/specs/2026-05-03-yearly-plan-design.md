# Yearly Plan — Design Spec

**Date:** 2026-05-03
**Route:** `/yearly-plan`
**Sub-project scope:** 52-week grid · capital escalation ladder · exit convention · payoff matrix

---

## 1. Overview

The Yearly Plan is a strategic annual planner for Brazilian mini-futures day traders. It maps 52 weeks across 12 months onto a single planning surface where the trader sets their capital base, contracts, point targets, and exit rules at the start of the year — then tracks weekly progress against those projections.

The core job-to-be-done: **translate a capital figure into a concrete weekly operational plan, then track week-by-week whether execution matches projection.** This is the annual layer above the existing Monthly Plan route; they share the same `tradingAccounts` anchor and can link bidirectionally.

Four sub-features compose the page:

1. **52-week × 12-month grid** — enter and track Pts Alvo / Pts Feito / Cnt / Valor Operacional per week.
2. **Capital escalation ladder** — auto-derives contract count from capital balance using configurable multiplier tiers.
3. **Exit convention form** — configurable Parcial / Final / Stop / Proteção point values and exit proportion mix.
4. **Payoff matrix** — combinatorial expected value table across N operations (1–10) and every outcome combination.

---

## 2. Assumptions

All decisions made without user confirmation are logged here.

| # | Assumption | Rationale |
|---|-----------|-----------|
| A1 | New `/yearly-plan` route (not extending `/monthly`) | Scope and UX are fundamentally different: monthly is a risk guardrail editor, yearly is a forward projection planner. A shared route would create cognitive dissonance. Link from monthly → yearly via a "ver plano anual" button. |
| A2 | One yearly plan per account per calendar year | Mirrors `monthlyPlans` uniqueness constraint (accountId + year). Mid-year creation is supported via `startWeek` field. |
| A3 | `tradingAccounts.defaultAsset` determines the contract type (WIN or WDO). No separate asset selector on the plan form | Most solo traders run one instrument at a time. A per-plan asset field can be added later. |
| A4 | IR + taxas kept at 30% default (from planilha) | This matches the spreadsheet default. The field is configurable. |
| A5 | "Dias por semana" defaults to 5 | From the planilha cell. Bank holidays reduce effective days; a `tradingDaysPerWeek` field allows the user to adjust. |
| A6 | Pts Feito = auto-derived from `trades.pointsPnl` when possible, with manual override | `trades` stores a `pointsPnl` column (new, added by this spec). See Section 10 for full details. |
| A7 | ISO week numbering (ISO 8601) for week ↔ date mapping | The planilha uses sequential Sem 01–Sem 52 which maps cleanly to ISO week numbers. No ambiguity for Brazilian market. |
| A8 | Capital ladder stores rules as JSONB (not normalized rows) | The ladder has a fixed max of 20 contract levels and rules rarely change. JSONB avoids join overhead and simplifies form editing. |
| A9 | No encryption on yearly plan financial fields by default | Monthly plan encrypts balances because they are sensitive risk limits. Yearly plan targets are projections/goals — treated as non-sensitive planning data. If Ygor wants encryption parity, add `text` + DEK pattern (same as `monthlyPlans`). Flag as open question Q1. |
| A10 | Payoff matrix is computed client-side (pure TS) from current exit convention values | No server round-trip needed; the math is deterministic and fast. |
| A11 | Capital ladder compounding: each level's `valorOperacional` = `contracts × valorPorContrato`. Not geometric compounding across time — that would be the weekly tracking concern. | Matches the planilha exactly: level 1 = R$3k, level 2 = R$6k, …, level 20 = R$150k. |
| A12 | Stop value stored as positive number (e.g. `3.5`), displayed as negative in UI and math | Convention: positive magnitude, sign applied by math engine. Avoids double-negative confusion in forms. |
| A13 | Week cells for future weeks show Pts Alvo from the plan projection; Pts Feito is blank until the week closes | This matches the spreadsheet behavior where projected vs. actual diverge week by week. |

---

## 3. User Stories

### Solo day trader (primary, ~60%)

- "I want to set my capital at the start of the year and have the system tell me how many contracts I should trade each month as my balance grows."
- "I want to see at a glance whether I'm ahead or behind my yearly point target after week 20."
- "I want to know the expected value of different trade combinations before I sit down on Monday morning."
- "When I finish a week, I want the actual points I scored auto-filled so I don't have to enter them manually."

### Mentorship student (secondary, ~40%)

- "My mentor (Pedro Palmezani / Hawks) uses specific exit rules — I want to model those exact values and see what my edge looks like with the payoff matrix."
- "My mentor has a capital escalation rule — 1 contract per R$3k. I want Axion to enforce and visualize that ladder."
- "I want to compare my plan projection vs. my monthly report to see where discipline broke down."

---

## 4. Data Model

### 4.1 New Tables

#### `yearly_plans`

Primary planning record for one account-year.

```ts
export const yearlyPlans = pgTable(
  "yearly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    year: integer("year").notNull(), // e.g. 2026

    // Capital & contract settings
    initialCapitalCents: integer("initial_capital_cents").notNull(), // e.g. 300000 = R$3,000
    valorPorContratoCents: integer("valor_por_contrato_cents").notNull().default(300000), // R$3,000
    irTaxRate: decimal("ir_tax_rate", { precision: 5, scale: 2 }).notNull().default("30.00"), // %
    tradingDaysPerWeek: integer("trading_days_per_week").notNull().default(5),

    // Capital ladder rules (JSONB array of {minContracts, maxContracts, multiplier})
    ladderRules: jsonb("ladder_rules").notNull().$type<LadderRule[]>(),

    // Exit convention
    exitParcialPts: decimal("exit_parcial_pts", { precision: 6, scale: 2 }).notNull().default("5.00"),
    exitFinalPts: decimal("exit_final_pts", { precision: 6, scale: 2 }).notNull().default("10.00"),
    exitStopPts: decimal("exit_stop_pts", { precision: 6, scale: 2 }).notNull().default("3.50"), // positive magnitude
    exitProtPts: decimal("exit_prot_pts", { precision: 6, scale: 2 }).notNull().default("1.00"),
    exitParcialProportion: decimal("exit_parcial_proportion", { precision: 4, scale: 3 }).notNull().default("0.700"), // 70%
    exitFinalProportion: decimal("exit_final_proportion", { precision: 4, scale: 3 }).notNull().default("0.300"), // 30%

    // Optional: start mid-year
    startWeek: integer("start_week").notNull().default(1), // ISO week 1–52

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("yearly_plans_account_idx").on(table.accountId),
    uniqueIndex("yearly_plans_account_year_idx").on(table.accountId, table.year),
  ]
)

// Supporting type (not a DB column — used for ladderRules JSONB)
interface LadderRule {
  minContracts: number // inclusive
  maxContracts: number // inclusive
  multiplier: number   // e.g. 1, 2, 3, 4
}
```

#### `weekly_targets`

One row per ISO week per yearly plan. Stores both projection (target) and actuals.

```ts
export const weeklyTargets = pgTable(
  "weekly_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    yearlyPlanId: uuid("yearly_plan_id")
      .notNull()
      .references(() => yearlyPlans.id, { onDelete: "cascade" }),
    isoWeek: integer("iso_week").notNull(), // 1–52
    isoYear: integer("iso_year").notNull(), // handles year-boundary ISO weeks

    // Projection (set once or edited)
    contracts: integer("contracts").notNull().default(1),
    valorOperacionalCents: integer("valor_operacional_cents").notNull(), // contracts × valorPorContrato
    ptsAlvo: decimal("pts_alvo", { precision: 8, scale: 2 }), // projected target points

    // Actuals — sourced from trades.pointsPnl via syncWeeklyActuals
    ptsFeito: decimal("pts_feito", { precision: 8, scale: 2 }), // actual points scored
    ptsSource: varchar("pts_source", { length: 10 }).default("manual"), // "auto" | "manual"

    // Financial actuals for the week (derived from trades, used by Annual Reporting)
    metaBrutoCents: integer("meta_bruto_cents"),   // gross financial result for the week
    metaLiquidoCents: integer("meta_liquido_cents"), // net of estimated IR for the week

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("weekly_targets_plan_idx").on(table.yearlyPlanId),
    uniqueIndex("weekly_targets_plan_week_idx").on(table.yearlyPlanId, table.isoWeek, table.isoYear),
  ]
)
```

#### `trades` table migration — new `pointsPnl` column

This spec requires a new column on the existing `trades` table:

```sql
-- Migration: add pointsPnl to trades
ALTER TABLE trades ADD COLUMN points_pnl DECIMAL(10, 2);
```

In Drizzle schema:

```ts
// Added to the existing trades table definition:
pointsPnl: decimal("points_pnl", { precision: 10, scale: 2 }),
// nullable — NULL means not yet computed or asset has no point-value mapping
```

**Population strategy:** On trade save/update, the server action resolves `pointsPnl` using the per-asset point-value resolver (see `src/lib/contracts/point-values.ts` below). For existing trades, a one-time backfill migration computes `pointsPnl` from `financialPnlCents` using the known point-value per asset.

**Migration step:**
1. `drizzle-kit generate` after adding the column to the schema.
2. Run backfill: `UPDATE trades SET points_pnl = financial_pnl_cents / point_value_cents_per_pt WHERE asset IN ('WIN', 'WDO')` — executed as a separate data migration script, not a schema migration.

#### Per-asset point-value resolver

New shared module: `src/lib/contracts/point-values.ts`

```ts
// Point value facts for Brazilian mini-futures contracts (exact, regulatory)
// WIN = Mini Índice: R$0.20 per point per contract
// WDO = Mini Dólar: R$10.00 per point (pip) per contract

interface AssetPointValue {
  asset: string
  pointValueCents: number // R$ cents per 1 point per 1 contract
  description: string
}

const ASSET_POINT_VALUES: Record<string, AssetPointValue> = {
  WIN: { asset: "WIN", pointValueCents: 20, description: "Mini Índice — R$0,20/pt" },
  WDO: { asset: "WDO", pointValueCents: 1000, description: "Mini Dólar — R$10,00/pt" },
}

// Resolve point value for a given asset code; returns null if unknown
const getPointValue = (asset: string): AssetPointValue | null =>
  ASSET_POINT_VALUES[asset.toUpperCase()] ?? null

// Convert financial P&L (cents) to points for a given asset + contract count
const financialToPoints = (
  financialPnlCents: number,
  asset: string,
  contracts: number
): number | null => {
  const pv = getPointValue(asset)
  if (!pv || contracts <= 0) return null
  return financialPnlCents / (pv.pointValueCents * contracts)
}

export { getPointValue, financialToPoints, ASSET_POINT_VALUES }
export type { AssetPointValue }
```

### 4.2 Reused Tables

| Existing table | How it's used |
|----------------|---------------|
| `tradingAccounts` | FK anchor for `yearlyPlans.accountId`. Year plan inherits `defaultAsset`, `defaultCurrency`. |
| `monthlyPlans` | **Shared capital source of truth.** Yearly plan and monthly plan share capital (see Section 4.3 — Capital Reconciliation). The yearly plan does NOT redefine risk parameters (riskPerTradePercent, dailyLossPercent, etc.) — those remain exclusively in `monthlyPlans`. |
| `trades` | Auto-sync: query `SUM(points_pnl)` by ISO week + accountId to compute `ptsFeito`. |

### 4.3 Capital Reconciliation

**Decision:** `yearly_plans` and `monthlyPlans` share capital. Single source of truth.

**Relationship design:**

- `yearly_plans` owns the **planning curve**: a trajectory of projected `plannedBalance` across 52 weeks. This is the ladder projection (deterministic, derived from `initialCapitalCents` + `ladderRules`).
- `weekly_targets[n].valorOperacionalCents` is **derived** from the ladder — it is recalculated whenever ladder rules change.
- `monthlyPlans.accountBalance` is the **live balance** for the current month. It reflects actual trading results, not projections.
- The corresponding week row in `yearly_plans.weekly_targets` tracks `metaBrutoCents` and `metaLiquidoCents` as the actuals layer, separate from the projection.

**Two-way sync rules:**

1. **Monthly → Yearly (propagate forward):** When the user updates `accountBalance` in `monthlyPlans` for month M, the server action also updates the `initialCapitalCents` of the corresponding `yearlyPlans` week (the first ISO week of month M). Future weeks' projected `contracts` and `valorOperacionalCents` are recomputed from the new balance.

2. **Yearly → Monthly (propagate back):** When the user edits `initialCapitalCents` on the yearly plan header, or adjusts a future week's balance directly in the grid, the corresponding month's `monthlyPlans.accountBalance` is updated to match.

3. **Conflict resolution:** The most-recently-edited value wins. Both tables store `updatedAt`. The sync action checks timestamps before writing to avoid stale overwrites.

4. **Active month only:** The two-way sync applies to the *current* month. Past months are frozen (read-only) once their ISO weeks close. Future months update their `monthlyPlans` row only if one already exists; otherwise the yearly plan projection stands until the user creates that month's plan.

**Implementation:** A new server action `syncCapitalBetweenPlans(monthId, source: "monthly" | "yearly")` handles both directions. Called from `upsertYearlyPlan` and from the existing `monthlyPlans` upsert action.

**Invariant:** At any point in time, `monthlyPlans.accountBalance` for the active month must equal `weeklyTargets[currentWeek].valorOperacionalCents / weeklyTargets[currentWeek].contracts` (i.e., `valorPorContratoCents` × contracts, which equals the balance tier in the ladder). Divergence between the two is a bug.

### 4.4 No New Enum Needed

`ptsSource` is a `varchar` rather than a pgEnum to keep schema migrations lightweight; values are constrained at the application layer.

---

## 5. Server Actions

New file: `src/app/actions/yearly-plan.ts`

```ts
// Action signatures (all "use server", all return ActionResponse<T>)

// Fetch the yearly plan for the active account + given year
getYearlyPlan(year: number): Promise<ActionResponse<YearlyPlanWithWeeks | null>>

// Upsert the plan header (create or update settings)
// Also triggers syncCapitalBetweenPlans if initialCapitalCents changes
upsertYearlyPlan(input: YearlyPlanInput): Promise<ActionResponse<YearlyPlan>>

// Bulk upsert weekly targets (called when user edits grid cells)
upsertWeeklyTargets(
  yearlyPlanId: string,
  weeks: WeeklyTargetInput[]
): Promise<ActionResponse<WeeklyTarget[]>>

// Sync ptsFeito from trades.pointsPnl for a given ISO week range
syncWeeklyActuals(
  yearlyPlanId: string,
  isoWeeks: number[]
): Promise<ActionResponse<{ synced: number; weeks: WeeklyTarget[] }>>

// Two-way capital sync between yearly_plans and monthlyPlans
syncCapitalBetweenPlans(
  monthlyPlanId: string,
  source: "monthly" | "yearly"
): Promise<ActionResponse<void>>

// Delete a yearly plan (and cascade weekly_targets)
deleteYearlyPlan(yearlyPlanId: string): Promise<ActionResponse<void>>
```

Validation schemas live in `src/lib/validations/yearly-plan.ts` (plain module, no `"use server"` directive — per the codebase rule that Zod schemas must live in plain modules).

---

## 6. Routes and Pages

### New route: `src/app/[locale]/(app)/yearly-plan/page.tsx`

Server component that fetches initial data and passes it to the client shell.

```ts
const YearlyPlanPage = async ({ params }: { params: Promise<{ locale: string }> }) => {
  const { locale } = await params
  setRequestLocale(locale)

  const currentYear = new Date().getFullYear()
  const [planResult] = await Promise.all([
    getYearlyPlan(currentYear),
  ])

  const initialPlan = planResult.status === "success" ? planResult.data ?? null : null

  return (
    <div className="min-h-dvh bg-bg-100">
      <main className="mx-auto max-w-7xl p-m-400 sm:p-m-500 lg:p-m-600">
        <YearlyPlanContent initialPlan={initialPlan} year={currentYear} />
      </main>
    </div>
  )
}
```

The `max-w-7xl` container (wider than the monthly page's `max-w-5xl`) is needed to fit the 52-week grid without horizontal scrolling on desktop. Mobile uses horizontal scroll with sticky month labels.

### Navigation link

Add "Plano Anual" to the app sidebar/nav between "Plano Mensal" and "Analytics". This is a minor edit to the nav configuration file (out of scope for this spec, flagged as integration task).

---

## 7. Components

All components under `src/components/yearly-plan/`. Each is a named export from its own file.

### `YearlyPlanContent` (client, ~150 LOC)

**Purpose:** Top-level shell. Owns `useState` for `plan`, `activeTab`, and `isOnboarding`. Renders the onboarding wizard when no plan exists, otherwise renders the four sub-panels.

**Props:** `{ initialPlan: YearlyPlanWithWeeks | null; year: number }`

**Internal state:** `plan`, `activeTab: "grid" | "ladder" | "exits" | "payoff"`, `isOnboarding: boolean`

---

### `YearlyPlanOnboarding` (client, ~120 LOC)

**Purpose:** 3-step wizard shown on first visit (no plan exists). Step 1: capital + year. Step 2: ladder rules + contracts per capital. Step 3: exit convention. On submit, calls `upsertYearlyPlan` and transitions to the main view.

**Props:** `{ year: number; onComplete: (plan: YearlyPlan) => void }`

---

### `YearGrid` (client, ~180 LOC)

**Purpose:** The 52-week × 12-month planning grid. Renders months as sections (4–5 weeks each). Each week is a `WeekCell`. Below each month section renders a month rollup row (médias, totais).

**Props:**
```ts
interface YearGridProps {
  weeks: WeeklyTarget[]
  plan: YearlyPlan
  onWeekUpdate: (week: WeeklyTargetInput) => void
  onSyncWeek: (isoWeek: number) => void
  currentIsoWeek: number
}
```

**Internal state:** `editingWeek: number | null` (controls which WeekCell is in edit mode)

---

### `WeekCell` (client, ~80 LOC)

**Purpose:** Single week card within the grid. Shows contracts, Valor Operacional, Pts Alvo, Pts Feito. Click to expand into inline edit form. Auto badge shows "auto" or "manual" for ptsFeito source. Gold highlight on current ISO week.

**Props:**
```ts
interface WeekCellProps {
  week: WeeklyTarget
  isCurrentWeek: boolean
  isEditing: boolean
  onEdit: () => void
  onSave: (data: WeeklyTargetInput) => void
  onSyncActuals: () => void
}
```

---

### `MonthRollup` (client, ~60 LOC)

**Purpose:** Summary row below each month's weeks. Computes and displays: média rent/dia, pontos/semana, total mensal projetado, financeiro acumulado até o mês, pontos acumulados. All derived client-side from `WeeklyTarget[]` slice.

**Props:** `{ weeks: WeeklyTarget[]; plan: YearlyPlan; cumulativeFinancialCents: number; cumulativePoints: number }`

---

### `CapitalLadder` (client, ~100 LOC)

**Purpose:** Displays the 20-row capital → contracts table. Each row shows: Cnt, Valor Operacional, multiplier tier. Rows 1–5 / 6–10 / 11–15 / 16–20 are visually grouped. Inline edit for `valorPorContrato` and multiplier tier boundaries. Calls `upsertYearlyPlan` on change.

**Props:** `{ plan: YearlyPlan; onUpdate: (updates: Partial<YearlyPlanInput>) => void }`

---

### `ExitConventionForm` (client, ~90 LOC)

**Purpose:** Form for editing Parcial / Final / Stop / Proteção point values and Parcial/Final proportion. Live preview shows resulting EV for a single operation at current values. Changes propagate to `PayoffMatrix` via parent state — no extra server call needed.

**Props:** `{ plan: YearlyPlan; onUpdate: (updates: Partial<YearlyPlanInput>) => void }`

---

### `PayoffMatrix` (client, ~130 LOC)

**Purpose:** Table with rows = N operations (1–10), columns = every outcome combination for that N. Cell value = EV in points (computed by `payoff-matrix.ts`). Secondary display toggle shows % probability weighting per outcome type. Uses Geist Mono for numbers. Gold highlight on highest-EV combination per row.

**Props:** `{ exitConvention: ExitConvention; contracts: number }`

**Internal state:** `displayMode: "ev" | "percent"`

---

## 8. Math Engines

Pure TypeScript modules in `src/lib/yearly-plan/`. No React imports, fully unit-testable.

### `src/lib/yearly-plan/exit-convention.ts`

```ts
interface ExitConvention {
  parcialPts: number   // e.g. 5.0
  finalPts: number     // e.g. 10.0
  stopPts: number      // positive magnitude, e.g. 3.5
  protPts: number      // e.g. 1.0
  parcialProportion: number  // e.g. 0.70
  finalProportion: number    // e.g. 0.30
}

// Compute weighted EV for one "Gain" operation.
// A Gain combines a partial exit (70%) and a final exit (30%).
// Default: 5.0 × 0.70 + 10.0 × 0.30 = 6.5 pts
// This is the canonical point yield per winning operation used throughout the payoff engine.
const computeGainEv = (convention: ExitConvention): number =>
  convention.parcialPts * convention.parcialProportion +
  convention.finalPts * convention.finalProportion

// Compute net EV for a single Stop
const computeStopEv = (convention: ExitConvention): number => -convention.stopPts

// Compute net EV for Proteção
const computeProtEv = (convention: ExitConvention): number => convention.protPts

// Compute average point yield per operation in points
const computeAvgPointsPerOp = (convention: ExitConvention): number =>
  computeGainEv(convention) // assumes 100% gain — apply win rate externally

export { computeGainEv, computeStopEv, computeProtEv, computeAvgPointsPerOp }
export type { ExitConvention }
```

### `src/lib/yearly-plan/capital-ladder.ts`

```ts
interface LadderRule {
  minContracts: number
  maxContracts: number
  multiplier: number
}

interface LadderLevel {
  contracts: number
  valorOperacionalCents: number
  multiplier: number
  tier: number // which rule index applies
}

// Build the full 20-level ladder from rules + valorPorContrato
const buildCapitalLadder = (
  rules: LadderRule[],
  valorPorContratoCents: number
): LadderLevel[] => {
  // For each contract count 1..20, find its rule, compute valorOperacional
}

// Given current account balance, return the appropriate contract count
const contractsForBalance = (
  balanceCents: number,
  ladder: LadderLevel[]
): number => {
  // Find the highest tier where valorOperacional <= balanceCents
}

export { buildCapitalLadder, contractsForBalance }
export type { LadderRule, LadderLevel }
```

### `src/lib/yearly-plan/payoff-matrix.ts`

The payoff matrix uses the **weighted gain EV** (`computeGainEv`) as the point yield per winning outcome. A "Gain" outcome means both the partial (70%) and final (30%) exits were executed. The weighted average is:

```
Gain EV = parcialPts × parcialProportion + finalPts × finalProportion
         = 5.0 × 0.70 + 10.0 × 0.30
         = 6.5 pts  (at default convention)
```

This is the correct model because each winning trade in the Hawks methodology always fires both the partial and final exits before the session ends. Using flat `parcialPts` (5.0) as prior versions assumed would underestimate by 1.5 pts per win and produce systematically pessimistic EV projections.

```ts
// Outcome types in a single operation
type SingleOutcome = "gain" | "stop"

// For N operations, enumerate every combination of outcomes
// Returns array of { label: string, combo: OutcomeCounts, evPoints: number }
interface OutcomeCounts {
  gains: number
  stops: number
}

// Generate all combinations for N ops (gains + stops = N)
const generateCombinations = (nOps: number): OutcomeCounts[] => {
  // yields { gains: n, stops: 0 }, { gains: n-1, stops: 1 }, ..., { gains: 0, stops: n }
}

// Compute EV in points for one combination.
// Uses weighted gain EV (computeGainEv) — reflects the 70% partial + 30% final split.
// Example at default convention: 3G = 3 × 6.5 = 19.5 pts; 2G1S = 2×6.5 − 3.5 = 9.5 pts.
const combinationEv = (
  combo: OutcomeCounts,
  convention: ExitConvention,
  contracts: number
): number => {
  const gainEv = computeGainEv(convention)  // weighted: parcialPts×0.70 + finalPts×0.30
  const stopEv = computeStopEv(convention)
  return (combo.gains * gainEv + combo.stops * stopEv) * contracts
}

// Build the full matrix: rows 1..maxOps, all combos per row
const buildPayoffMatrix = (
  convention: ExitConvention,
  contracts: number,
  maxOps: number = 10
): PayoffMatrixRow[] => {
  // For each N in 1..maxOps, generateCombinations(N) → map to evPoints
}

export { buildPayoffMatrix, generateCombinations, combinationEv }
```

### `src/lib/yearly-plan/weekly-rollups.ts`

```ts
// Compute per-month rollup aggregates from weekly_targets slice
interface MonthRollupData {
  totalPtsAlvo: number
  totalPtsFeito: number
  avgRentPerDay: number     // % return per day, derived from financial
  avgPtsPerWeek: number
  monthlyProjectedNetCents: number  // after IR
  cumulativeFinancialCents: number  // running total to end of month
  cumulativePoints: number          // running point total
}

const computeMonthRollup = (
  weeks: WeeklyTarget[],
  plan: YearlyPlan,
  priorCumulativeFinancialCents: number,
  priorCumulativePoints: number
): MonthRollupData => { /* ... */ }

export { computeMonthRollup }
export type { MonthRollupData }
```

---

## 9. UX Flow

### 9.1 First-time onboarding

1. User navigates to `/yearly-plan`. No plan exists → `YearlyPlanOnboarding` renders.
2. **Step 1 — Capital:** Enter starting capital (R$). System shows derived contracts count from the ladder preview. Enter trading days/week.
3. **Step 2 — Ladder rules:** Review the default 4-tier ladder (1–5 × 1×, 6–10 × 2×, etc.). Edit multiplier or `valorPorContrato`. Live preview updates the 20-row table.
4. **Step 3 — Exit convention:** Review defaults (Parcial +5 / Final +10 / Stop −3.5 / Prot +1 / 70%/30%). Edit as needed. Live payoff matrix preview shows EV for 1–3 operations.
5. Submit → `upsertYearlyPlan` → `syncWeeklyActuals` for any past weeks in the current year → transitions to main grid view.

### 9.2 Week-by-week tracking

- Every Monday, the system auto-syncs `ptsFeito` for the just-completed ISO week from `trades.pointsPnl`.
- The current week's cell highlights in gold with a "sync" button for manual refresh.
- User can override any auto-synced value (sets `ptsSource = "manual"`). A small "auto" / "manual" badge on the cell surface clarifies the data source.

### 9.3 Mid-year adjustments

- Click "Editar Plano" (plan header) to change `valorPorContrato`, exit convention, or ladder rules.
- Changing capital rules prompts a confirmation: "Recalcular semanas futuras com os novos contratos?" YES recalculates `contracts` + `valorOperacionalCents` for all future weeks. Past weeks are frozen.
- Changing exit convention instantly updates the payoff matrix preview but does NOT retroactively change past weekly projections.

### 9.4 Year transition

- In December, a "Planejar próximo ano" CTA appears at the top of the grid.
- It pre-fills next year's plan with current year's ending capital + same ladder/exit rules.
- Previous year's plan remains read-only (all cells frozen).

---

## 10. Auto vs Manual Sync with Trades

**Decision: Hybrid — auto-derived from `trades.pointsPnl` with manual override.**

**Rationale:**

The `trades` table will now store `pointsPnl` directly (new column added by this spec). This eliminates any ambiguity about conversion formulas at query time — the point value is resolved once, at trade-save time, and stored alongside the financial P&L. Computing ISO week from `entryDate` is trivial. The user's primary frustration with the old Excel was manual data entry; auto-sync removes that friction entirely for the actuals column.

Manual override remains supported for:
- Trades added manually with incorrect dates
- Replay-mode accounts with synthetic dates
- Weeks the user wants to mark as "planned" (couldn't trade)

**Point-value resolution:**

`pointsPnl` is computed at trade save time using `src/lib/contracts/point-values.ts`:

- **WIN (Mini Índice):** 1 point = R$0.20 per contract → `pointsPnl = financialPnlCents / (20 × contracts)`
- **WDO (Mini Dólar):** 1 pip = R$10.00 per contract → `pointsPnl = financialPnlCents / (1000 × contracts)`

These are regulatory facts about Brazilian mini-futures contracts, not configurable values.

**Implementation:**

1. `syncWeeklyActuals` server action queries:
   ```sql
   SELECT SUM(points_pnl) FROM trades
   WHERE account_id = ? AND iso_week = ? AND iso_year = ?
   ```
2. If `ptsSource = "auto"`, `ptsFeito` is overwritten on each sync.
3. If `ptsSource = "manual"`, the field is never overwritten — the user explicitly chose a value.
4. A "reset to auto" button on each WeekCell restores auto-sync for that week.

**Migration step for existing trades:**

After adding the `points_pnl` column, a backfill script resolves values for all existing trades:

```ts
// Pseudocode for backfill
for each trade where points_pnl IS NULL:
  assetPv = getPointValue(trade.asset)
  if assetPv:
    trade.points_pnl = trade.financial_pnl_cents / (assetPv.pointValueCents × trade.contracts)
```

Run as a one-time script via `bun run scripts/backfill-points-pnl.ts` before deploying any yearly plan feature.

---

## 11. Edge Cases

| Scenario | Handling |
|----------|---------|
| **Partial year (start mid-year)** | `startWeek` field on `yearlyPlans` allows creating a plan for weeks 20–52. Weeks before `startWeek` render as greyed-out "N/A" cells in the grid. Month rollups exclude those weeks. |
| **Capital reset after drawdown** | User manually edits `initialCapitalCents` on the plan header. Optionally, a "Reset capital" action recomputes all future week contracts from the new balance. A reset event is logged as a `notes` entry with timestamp. `syncCapitalBetweenPlans` is called to propagate the new balance to the active month's `monthlyPlans` row. |
| **Holidays / fewer than 5 trading days** | `tradingDaysPerWeek` is a plan-level default (not per-week). Individual weeks with fewer trading days can override `contracts = 0` via the week cell edit (effectively marking the week as non-trading). The grid renders those weeks with a "feriado" badge. |
| **ISO week 53** | Some years have a 53rd ISO week (e.g. 2026 does not, but 2015 did). `isoYear` stored separately from plan `year` to handle year-boundary ISO weeks correctly. The grid renders at most 52 cells regardless; week 53 maps to the following year's plan. |
| **Year transition — overlapping ISO weeks** | ISO week 1 of a new year can start in late December. `isoYear` distinguishes it from the previous year's late weeks. |
| **Multiple accounts** | Each account can have its own yearly plan. The route respects the active account from `sessions.currentAccountId`. |
| **Replay accounts** | `replayCurrentDate` shifts "today" for the account. Current week highlight and auto-sync respect the effective date via `getServerEffectiveNow()`. |
| **No trades data for a past week** | Auto-sync returns `ptsFeito = 0` (or null if no trades at all). A visual indicator ("Sem operações") helps the user distinguish 0-point weeks from untracked ones. Stored as `null` until explicitly synced or manually entered. |
| **Asset with no point-value mapping** | `getPointValue` returns `null`. `pointsPnl` is stored as `NULL` on the trade. Auto-sync treats NULL trades as having zero point contribution and logs a warning. |
| **Capital divergence between yearly and monthly** | If `updatedAt` timestamps are identical (race condition), prefer the `monthlyPlans` value as authoritative for the current month, since monthly plan is the operational tool the user edits most frequently. |

---

## 12. Testing Strategy

### 12.1 Unit tests — math engines (mandatory)

Location: `src/__tests__/lib/yearly-plan/`

```
payoff-matrix.test.ts
  ✓ generates correct combinations for N=1 (gain, stop)
  ✓ generates correct combinations for N=3 (3G, 2G1S, 1G2S, 3S)
  ✓ EV for 3G with default convention = 19.5 pts × contracts (3 × 6.5 weighted)
  ✓ EV for 3S with default convention = -10.5 pts × contracts (3 × −3.5)
  ✓ EV for 2G1S = (2 × 6.5 − 3.5) × contracts = 9.5 × contracts
  ✓ EV for 1G2S = (6.5 − 7.0) × contracts = -0.5 × contracts
  ✓ handles maxOps boundary (N=10)
  ✓ weighted gain EV changes correctly when parcialPts or finalPts changes

capital-ladder.test.ts
  ✓ buildCapitalLadder produces 20 levels from default rules
  ✓ level 1 = R$3k, level 5 = R$15k, level 6 = R$21k (multiplier jump)
  ✓ contractsForBalance(R$9k) = 3 contracts
  ✓ contractsForBalance(R$21k) = 6 contracts (enters 2× tier)
  ✓ contractsForBalance(R$0) = 1 (floor at 1 contract)

exit-convention.test.ts
  ✓ computeGainEv(default) = 5.0 × 0.70 + 10.0 × 0.30 = 6.5 pts
  ✓ computeStopEv(default) = −3.5
  ✓ proportions must sum to 1.0 (validation test)

point-values.test.ts
  ✓ getPointValue("WIN") returns 20 cents/pt
  ✓ getPointValue("WDO") returns 1000 cents/pt
  ✓ getPointValue("UNKNOWN") returns null
  ✓ financialToPoints(2000 cents, "WIN", 1 contract) = 100 pts
  ✓ financialToPoints(10000 cents, "WDO", 1 contract) = 10 pts

weekly-rollups.test.ts
  ✓ computeMonthRollup accumulates correctly across 4 weeks
  ✓ cumulativePoints carry-forward from prior months
  ✓ IR deduction applied to monthly net financial
```

### 12.2 Component tests

Location: `src/__tests__/components/yearly-plan/`

- `WeekCell.test.tsx` — renders projected/actual, edit mode toggle, "auto" badge
- `PayoffMatrix.test.tsx` — renders correct column count for N=3, EV values match math engine (3G = 19.5 at defaults)
- `CapitalLadder.test.tsx` — 20 rows rendered, tier groupings correct

### 12.3 E2E happy path

Location: `e2e/yearly-plan.spec.ts`

```
Scenario: Create first yearly plan and enter week actuals
  1. Navigate to /yearly-plan — onboarding wizard renders
  2. Complete 3-step onboarding with R$3,000 capital, default settings
  3. Grid renders with 52 week cells
  4. Current week is highlighted in gold
  5. Click week cell → edit mode opens
  6. Enter Pts Feito = 42.5 → save → cell updates
  7. Month rollup row shows updated totals
  8. Switch to Payoff Matrix tab → matrix renders 10 rows
  9. Payoff matrix 3G cell shows 19.5 pts (not 15) at default convention
```

---

## 13. Integration Contracts

This section defines what this spec provides to other specs and what it consumes from them. These contracts govern cross-feature data flow and must be respected when implementing or modifying any connected feature.

### Provides

| Export | Consumer | Description |
|--------|----------|-------------|
| `weeklyTargets[year, week].metaBrutoCents` | Annual Reporting | Gross weekly financial result for the weekly chart |
| `weeklyTargets[year, week].metaLiquidoCents` | Annual Reporting | Net weekly result (after estimated IR) for the weekly chart |
| `weeklyTargets[year, week].ptsAlvo`, `ptsFeito` | Annual Reporting | Weekly point targets and actuals for the points chart |
| `yearlyPlans.ladderRules` + `valorPorContratoCents` | Annual Reporting | Used to derive "Mensal Máximo" column: `maxContracts × pointValueCents × ptsAlvo` |
| `yearlyPlans.exitParcialPts`, `exitFinalPts`, `exitParcialProportion`, `exitFinalProportion` (the full exit convention) | Backtest, Monte Carlo, Risk Simulation | Provides the canonical exit convention for consistent EV calculation across all simulation features. These features MUST NOT define their own exit values — they import from the active yearly plan or fall back to the `ExitConvention` defaults. |
| `payoff-matrix.ts` engine (`buildPayoffMatrix`, `combinationEv`, `computeGainEv`) | Any feature needing EV math | Pure module, no React/server dependencies — importable from anywhere |

### Consumes

| Import | Source | Notes |
|--------|--------|-------|
| `tradingAccounts.id` | `tradingAccounts` table | All `yearlyPlans` and `weeklyTargets` rows are scoped to an account |
| Risk parameters (`riskPerTradePercent`, `dailyLossPercent`, `maxDailyLossCents`, etc.) | `monthlyPlans` | Yearly plan does NOT redefine these. They remain exclusively owned by `monthlyPlans`. Yearly plan only adds the yearly + weekly target dimension. |
| `trades.pointsPnl` | `trades` table (new column, added by this spec) | Powers `syncWeeklyActuals`. This column does not exist yet — its addition is a required migration for the yearly plan feature to function. |
| `getPointValue`, `financialToPoints` | `src/lib/contracts/point-values.ts` (new module, added by this spec) | Shared resolver for WIN/WDO point values. Any other feature needing BR mini-contract point conversion should use this module, not define its own constants. |
| `monthlyPlans.accountBalance` | `monthlyPlans` | Two-way capital sync (see Section 4.3). Active month's balance is the live source of truth for the current capital tier. |

---

## 14. Open Questions

| # | Question | Impact |
|---|---------|--------|
| **Q1** | Should `yearlyPlans` financial fields (initialCapitalCents) be encrypted with the user DEK, matching the `monthlyPlans` encryption pattern? | Schema change: swap `integer` for `text` + encrypt/decrypt pipeline. Adds complexity but maintains privacy parity. |
| **Q5** | Should the Payoff Matrix display financial value (R$) in addition to point EV, using `valorOperacional` from the current capital ladder level? | Purely additive feature — no schema change. Adds a display column to `PayoffMatrix`. |

All blocking questions (Q2 payoff matrix formula, Q3 points tracking, Q4 capital sharing) have been resolved and incorporated into this spec. See Sections 8, 10, and 4.3 respectively.
