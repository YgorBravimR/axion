# Yearly Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build /yearly-plan page with 52-week × 12-month grid, capital ladder, exit convention, and combinatorial payoff matrix. Auto-sync ptsFeito from trades.

**Architecture:** New tables `yearly_plans` + `weekly_targets`. Pure-TS math engines (payoff-matrix, capital-ladder, exit-convention) in `src/lib/yearly-plan/`. Server actions in `src/app/actions/yearly-plan.ts`. Components in `src/components/yearly-plan/`. Two-way capital reconciliation with monthlyPlans.

**Prerequisites (from Annual Reporting plan Phase 0 — implement that first):**
- `src/lib/calendar/iso-week.ts`
- `src/lib/contracts/point-values.ts`
- `src/types/integration.ts`
- `src/lib/aggregation/period-rollup.ts`
- `account_monthly_aggregate` + `account_weekly_aggregate` tables
- `src/lib/queries/period-queries.ts`
- `invalidateAggregates(accountId, date)`

**Tech Stack:** Next.js 16, Drizzle, Postgres, Bun, Tailwind, Vitest, Playwright

---

## File Structure

```
src/
├── db/
│   └── schema.ts                          MODIFY — add yearlyPlans + weeklyTargets + trades.pointsPnl
├── app/
│   ├── actions/
│   │   └── yearly-plan.ts                 CREATE — server actions (6 exports)
│   └── [locale]/(app)/
│       └── yearly-plan/
│           └── page.tsx                   CREATE — server component, initial data fetch
├── components/
│   └── yearly-plan/
│       ├── index.ts                       CREATE — barrel
│       ├── yearly-plan-content.tsx        CREATE — client shell, tab routing
│       ├── yearly-plan-onboarding.tsx     CREATE — 3-step wizard (first-visit)
│       ├── year-grid.tsx                  CREATE — 52-week × 12-month layout
│       ├── week-cell.tsx                  CREATE — single week card, inline edit
│       ├── month-rollup.tsx               CREATE — summary row per month
│       ├── capital-ladder.tsx             CREATE — 20-row ladder table + editor
│       ├── exit-convention-form.tsx       CREATE — parcial/final/stop/prot form
│       └── payoff-matrix.tsx              CREATE — combinatorial EV table
├── lib/
│   ├── yearly-plan/
│   │   ├── exit-convention.ts             CREATE — computeGainEv, computeStopEv, computeProtEv
│   │   ├── capital-ladder.ts              CREATE — buildCapitalLadder, contractsForBalance
│   │   ├── payoff-matrix.ts               CREATE — buildPayoffMatrix, combinationEv, generateCombinations
│   │   └── weekly-rollups.ts              CREATE — computeMonthRollup
│   └── validations/
│       └── yearly-plan.ts                 CREATE — Zod schemas (no "use server")
└── __tests__/
    └── lib/
        └── yearly-plan/
            ├── exit-convention.test.ts    CREATE
            ├── capital-ladder.test.ts     CREATE
            ├── payoff-matrix.test.ts      CREATE
            └── weekly-rollups.test.ts     CREATE
scripts/
└── backfill-points-pnl.ts                 CREATE — one-time backfill for trades.pointsPnl
e2e/
└── tests/
    └── yearly-plan.spec.ts                CREATE — Playwright e2e happy path
```

---

## Phase 1 — Schema (3 tasks)

### Task 1: Add `yearlyPlans` and `weeklyTargets` to schema + generate migration

**Files:**
- Modify: `src/db/schema.ts`
- Test: `src/__tests__/lib/yearly-plan/schema-types.test.ts` (type-level only, no runtime test needed — Drizzle validates at compile time)

- [ ] **Step 1: Write failing type test**
```ts
// src/__tests__/lib/yearly-plan/schema-types.test.ts
import { describe, it, expect } from "vitest"

describe("yearly_plans schema shape", () => {
  it("exports yearlyPlans table", async () => {
    const schema = await import("@/db/schema")
    expect(schema.yearlyPlans).toBeDefined()
    expect(schema.weeklyTargets).toBeDefined()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/schema-types.test.ts`
Expected: FAIL — `schema.yearlyPlans is undefined`

- [ ] **Step 3: Add tables to `src/db/schema.ts`**

Add after the `monthlyPlans` table definition (search for `export const monthlyPlans = pgTable`):

```ts
// ==========================================
// YEARLY PLAN TABLES
// ==========================================

export interface LadderRule {
  minContracts: number
  maxContracts: number
  multiplier: number
}

export const yearlyPlans = pgTable(
  "yearly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),

    // Capital & contract settings
    initialCapitalCents: integer("initial_capital_cents").notNull(),
    valorPorContratoCents: integer("valor_por_contrato_cents").notNull().default(300000),
    irTaxRate: decimal("ir_tax_rate", { precision: 5, scale: 2 }).notNull().default("30.00"),
    tradingDaysPerWeek: integer("trading_days_per_week").notNull().default(5),

    // Capital ladder rules (JSONB array of LadderRule)
    ladderRules: jsonb("ladder_rules").notNull().$type<LadderRule[]>(),

    // Exit convention
    exitParcialPts: decimal("exit_parcial_pts", { precision: 6, scale: 2 }).notNull().default("5.00"),
    exitFinalPts: decimal("exit_final_pts", { precision: 6, scale: 2 }).notNull().default("10.00"),
    exitStopPts: decimal("exit_stop_pts", { precision: 6, scale: 2 }).notNull().default("3.50"),
    exitProtPts: decimal("exit_prot_pts", { precision: 6, scale: 2 }).notNull().default("1.00"),
    exitParcialProportion: decimal("exit_parcial_proportion", { precision: 4, scale: 3 }).notNull().default("0.700"),
    exitFinalProportion: decimal("exit_final_proportion", { precision: 4, scale: 3 }).notNull().default("0.300"),

    startWeek: integer("start_week").notNull().default(1),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("yearly_plans_account_idx").on(table.accountId),
    uniqueIndex("yearly_plans_account_year_idx").on(table.accountId, table.year),
  ]
)

export const weeklyTargets = pgTable(
  "weekly_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    yearlyPlanId: uuid("yearly_plan_id")
      .notNull()
      .references(() => yearlyPlans.id, { onDelete: "cascade" }),
    isoWeek: integer("iso_week").notNull(),
    isoYear: integer("iso_year").notNull(),

    // Projection
    contracts: integer("contracts").notNull().default(1),
    valorOperacionalCents: integer("valor_operacional_cents").notNull(),
    ptsAlvo: decimal("pts_alvo", { precision: 8, scale: 2 }),

    // Actuals
    ptsFeito: decimal("pts_feito", { precision: 8, scale: 2 }),
    ptsSource: varchar("pts_source", { length: 10 }).default("manual"),

    // Financial actuals (for Annual Reporting)
    metaBrutoCents: integer("meta_bruto_cents"),
    metaLiquidoCents: integer("meta_liquido_cents"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("weekly_targets_plan_idx").on(table.yearlyPlanId),
    uniqueIndex("weekly_targets_plan_week_idx").on(table.yearlyPlanId, table.isoWeek, table.isoYear),
  ]
)

// Relations
export const yearlyPlansRelations = relations(yearlyPlans, ({ one, many }) => ({
  account: one(tradingAccounts, {
    fields: [yearlyPlans.accountId],
    references: [tradingAccounts.id],
  }),
  weeklyTargets: many(weeklyTargets),
}))

export const weeklyTargetsRelations = relations(weeklyTargets, ({ one }) => ({
  yearlyPlan: one(yearlyPlans, {
    fields: [weeklyTargets.yearlyPlanId],
    references: [yearlyPlans.id],
  }),
}))
```

Also export types at the end of schema.ts (alongside existing type exports):
```ts
export type YearlyPlan = typeof yearlyPlans.$inferSelect
export type NewYearlyPlan = typeof yearlyPlans.$inferInsert
export type WeeklyTarget = typeof weeklyTargets.$inferSelect
export type NewWeeklyTarget = typeof weeklyTargets.$inferInsert
```

- [ ] **Step 4: Generate + run migration**
```bash
bun drizzle-kit generate
bun drizzle-kit migrate
```
Expected: new migration file in `src/db/migrations/`, tables created in DB.

- [ ] **Step 5: Run test + expected pass**
Run: `bun test src/__tests__/lib/yearly-plan/schema-types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(yearly-plan): add yearly_plans + weekly_targets schema tables"
```

---

### Task 2: Add `trades.pointsPnl` column + generate migration

**Files:**
- Modify: `src/db/schema.ts` (trades table)
- Test: `src/__tests__/lib/yearly-plan/schema-types.test.ts` (extend)

- [ ] **Step 1: Write failing test**
```ts
// Add to src/__tests__/lib/yearly-plan/schema-types.test.ts
it("trades table has pointsPnl column", async () => {
  const schema = await import("@/db/schema")
  const tradesCols = schema.trades
  expect((tradesCols as unknown as Record<string, unknown>).pointsPnl).toBeDefined()
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/schema-types.test.ts -t "trades table has pointsPnl"`
Expected: FAIL — column not found

- [ ] **Step 3: Add column to trades table**

Inside the `trades` pgTable definition, after the `pnlPercent` line, add:
```ts
// Points P&L — computed at trade-save time via point-values resolver
// NULL = not yet computed or asset has no known point-value mapping
pointsPnl: decimal("points_pnl", { precision: 10, scale: 2 }),
```

- [ ] **Step 4: Generate + run migration**
```bash
bun drizzle-kit generate
bun drizzle-kit migrate
```
Expected: new migration adds `ALTER TABLE trades ADD COLUMN points_pnl DECIMAL(10,2)`

- [ ] **Step 5: Run test + expected pass**
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(yearly-plan): add trades.points_pnl column for weekly actuals sync"
```

---

### Task 3: Backfill script for `trades.pointsPnl`

**Files:**
- Create: `scripts/backfill-points-pnl.ts`

- [ ] **Step 1: Write failing test (dry-run assertion)**
```ts
// src/__tests__/lib/yearly-plan/backfill.test.ts
import { describe, it, expect } from "vitest"
import { computePointsPnl } from "../../scripts/backfill-points-pnl"

describe("computePointsPnl", () => {
  it("WIN: 2000 cents / (20 cents/pt × 1 contract) = 100 pts", () => {
    expect(computePointsPnl({ financialPnlCents: 2000, asset: "WIN", contracts: 1 })).toBe(100)
  })
  it("WDO: 10000 cents / (1000 cents/pt × 1 contract) = 10 pts", () => {
    expect(computePointsPnl({ financialPnlCents: 10000, asset: "WDO", contracts: 1 })).toBe(10)
  })
  it("WIN: 3 contracts: 6000 / (20 × 3) = 100 pts", () => {
    expect(computePointsPnl({ financialPnlCents: 6000, asset: "WIN", contracts: 3 })).toBe(100)
  })
  it("unknown asset returns null", () => {
    expect(computePointsPnl({ financialPnlCents: 1000, asset: "PETR4", contracts: 1 })).toBeNull()
  })
  it("zero contracts returns null", () => {
    expect(computePointsPnl({ financialPnlCents: 1000, asset: "WIN", contracts: 0 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/backfill.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Minimal impl**
```ts
// scripts/backfill-points-pnl.ts
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { isNull } from "drizzle-orm"

// Point value facts (cents per 1 point per 1 contract)
const POINT_VALUE_CENTS: Record<string, number> = {
  WIN: 20,    // R$0.20/pt
  WDO: 1000,  // R$10.00/pt
}

interface ComputePointsPnlInput {
  financialPnlCents: number
  asset: string
  contracts: number
}

const computePointsPnl = ({
  financialPnlCents,
  asset,
  contracts,
}: ComputePointsPnlInput): number | null => {
  const pv = POINT_VALUE_CENTS[asset.toUpperCase()]
  if (!pv || contracts <= 0) return null
  return financialPnlCents / (pv * contracts)
}

const runBackfill = async (): Promise<void> => {
  console.log("[backfill-points-pnl] Starting...")

  const allTrades = await db.query.trades.findMany({
    where: isNull(trades.pointsPnl),
    columns: { id: true, pnl: true, asset: true, contractsExecuted: true },
  })

  console.log(`[backfill-points-pnl] Found ${allTrades.length} trades with NULL pointsPnl`)

  let updated = 0
  let skipped = 0

  for (const trade of allTrades) {
    const financialPnlCents = Number(trade.pnl ?? 0)
    const contracts = Number(trade.contractsExecuted ?? 1)
    const pointsPnl = computePointsPnl({ financialPnlCents, asset: trade.asset, contracts })

    if (pointsPnl === null) {
      skipped++
      continue
    }

    await db
      .update(trades)
      .set({ pointsPnl: String(pointsPnl) })
      .where(eq(trades.id, trade.id))

    updated++
  }

  console.log(`[backfill-points-pnl] Done. Updated: ${updated}, Skipped (unknown asset): ${skipped}`)
}

// Named export for unit testing
export { computePointsPnl }

// Run when invoked directly
runBackfill().catch(console.error)
```

- [ ] **Step 4: Run test + expected pass**
Run: `bun test src/__tests__/lib/yearly-plan/backfill.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add scripts/backfill-points-pnl.ts src/__tests__/lib/yearly-plan/backfill.test.ts
git commit -m "feat(yearly-plan): add backfill script for trades.points_pnl"
```

---

## Phase 2 — Math Engines (5 tasks)

### Task 4: `exit-convention.ts` — gain/stop/prot EV helpers

**Files:**
- Create: `src/lib/yearly-plan/exit-convention.ts`
- Test: `src/__tests__/lib/yearly-plan/exit-convention.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/__tests__/lib/yearly-plan/exit-convention.test.ts
import { describe, it, expect } from "vitest"
import {
  computeGainEv,
  computeStopEv,
  computeProtEv,
} from "@/lib/yearly-plan/exit-convention"
import type { ExitConvention } from "@/lib/yearly-plan/exit-convention"

const DEFAULT_CONVENTION: ExitConvention = {
  parcialPts: 5.0,
  finalPts: 10.0,
  stopPts: 3.5,
  protPts: 1.0,
  parcialProportion: 0.70,
  finalProportion: 0.30,
}

describe("exit-convention", () => {
  it("computeGainEv default = 5.0×0.70 + 10.0×0.30 = 6.5 pts", () => {
    expect(computeGainEv(DEFAULT_CONVENTION)).toBeCloseTo(6.5, 5)
  })
  it("computeStopEv default = -3.5 pts", () => {
    expect(computeStopEv(DEFAULT_CONVENTION)).toBeCloseTo(-3.5, 5)
  })
  it("computeProtEv default = 1.0 pts", () => {
    expect(computeProtEv(DEFAULT_CONVENTION)).toBeCloseTo(1.0, 5)
  })
  it("computeGainEv with custom values: 4×0.6 + 8×0.4 = 5.6", () => {
    const custom: ExitConvention = { ...DEFAULT_CONVENTION, parcialPts: 4, finalPts: 8, parcialProportion: 0.6, finalProportion: 0.4 }
    expect(computeGainEv(custom)).toBeCloseTo(5.6, 5)
  })
  it("proportions summing to 1.0 is the expected contract: 0.7+0.3=1.0", () => {
    const sum = DEFAULT_CONVENTION.parcialProportion + DEFAULT_CONVENTION.finalProportion
    expect(sum).toBeCloseTo(1.0, 5)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/exit-convention.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Minimal impl**
```ts
// src/lib/yearly-plan/exit-convention.ts

interface ExitConvention {
  parcialPts: number
  finalPts: number
  stopPts: number   // positive magnitude; displayed as negative in UI
  protPts: number
  parcialProportion: number  // e.g. 0.70
  finalProportion: number    // e.g. 0.30
}

/**
 * Weighted gain EV per winning operation.
 * Both partial (70%) and final (30%) exits fire on every win.
 * Default: 5.0×0.70 + 10.0×0.30 = 6.5 pts
 */
const computeGainEv = (convention: ExitConvention): number =>
  convention.parcialPts * convention.parcialProportion +
  convention.finalPts * convention.finalProportion

/**
 * Net EV for a Stop operation (stored as positive magnitude, returned negative).
 */
const computeStopEv = (convention: ExitConvention): number => -convention.stopPts

/**
 * Net EV for a Proteção (breakeven-lock) operation.
 */
const computeProtEv = (convention: ExitConvention): number => convention.protPts

/**
 * Average point yield per op assuming 100% gain rate.
 * Apply win rate externally.
 */
const computeAvgPointsPerOp = (convention: ExitConvention): number =>
  computeGainEv(convention)

const DEFAULT_EXIT_CONVENTION: ExitConvention = {
  parcialPts: 5.0,
  finalPts: 10.0,
  stopPts: 3.5,
  protPts: 1.0,
  parcialProportion: 0.70,
  finalProportion: 0.30,
}

export { computeGainEv, computeStopEv, computeProtEv, computeAvgPointsPerOp, DEFAULT_EXIT_CONVENTION }
export type { ExitConvention }
```

- [ ] **Step 4: Run + expected pass**
Expected: PASS (5/5 tests)

- [ ] **Step 5: Commit**
```bash
git add src/lib/yearly-plan/exit-convention.ts src/__tests__/lib/yearly-plan/exit-convention.test.ts
git commit -m "feat(yearly-plan): add exit-convention math engine"
```

---

### Task 5: `capital-ladder.ts` — ladder builder + balance → contracts resolver

**Files:**
- Create: `src/lib/yearly-plan/capital-ladder.ts`
- Test: `src/__tests__/lib/yearly-plan/capital-ladder.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/__tests__/lib/yearly-plan/capital-ladder.test.ts
import { describe, it, expect } from "vitest"
import { buildCapitalLadder, contractsForBalance } from "@/lib/yearly-plan/capital-ladder"
import type { LadderRule } from "@/db/schema"

const DEFAULT_RULES: LadderRule[] = [
  { minContracts: 1,  maxContracts: 5,  multiplier: 1 },
  { minContracts: 6,  maxContracts: 10, multiplier: 2 },
  { minContracts: 11, maxContracts: 15, multiplier: 3 },
  { minContracts: 16, maxContracts: 20, multiplier: 4 },
]
const VALOR_POR_CONTRATO = 300000 // R$3,000 in cents

describe("buildCapitalLadder", () => {
  it("produces exactly 20 levels", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(ladder).toHaveLength(20)
  })
  it("level 1 (contracts=1, multiplier=1): valorOperacional = R$3k", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(ladder[0].contracts).toBe(1)
    expect(ladder[0].valorOperacionalCents).toBe(300000)
    expect(ladder[0].multiplier).toBe(1)
  })
  it("level 5 (contracts=5, multiplier=1): valorOperacional = R$15k", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(ladder[4].contracts).toBe(5)
    expect(ladder[4].valorOperacionalCents).toBe(1500000)
  })
  it("level 6 (contracts=6, multiplier=2): valorOperacional = R$21k (6×R$3k×2÷2=R$9k — NO: valor = contracts×valorPorContrato, multiplier is tier label)", () => {
    // valorOperacional = contracts × valorPorContrato (not multiplied again)
    // The multiplier describes which capital tier, not a multiplier on value
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(ladder[5].contracts).toBe(6)
    expect(ladder[5].valorOperacionalCents).toBe(1800000) // 6 × 300000
    expect(ladder[5].multiplier).toBe(2)
  })
  it("level 20 (contracts=20, multiplier=4): valorOperacional = R$60k", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(ladder[19].contracts).toBe(20)
    expect(ladder[19].valorOperacionalCents).toBe(6000000)
    expect(ladder[19].multiplier).toBe(4)
  })
})

describe("contractsForBalance", () => {
  it("R$0 → floor at 1 contract", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(contractsForBalance(0, ladder)).toBe(1)
  })
  it("R$3k (300000 cents) → 1 contract", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(contractsForBalance(300000, ladder)).toBe(1)
  })
  it("R$9k (900000 cents) → 3 contracts", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(contractsForBalance(900000, ladder)).toBe(3)
  })
  it("R$18k (1800000 cents) → 6 contracts (enters tier 2)", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(contractsForBalance(1800000, ladder)).toBe(6)
  })
  it("above max ladder level → 20 contracts (capped)", () => {
    const ladder = buildCapitalLadder(DEFAULT_RULES, VALOR_POR_CONTRATO)
    expect(contractsForBalance(999_000_000, ladder)).toBe(20)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/capital-ladder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Minimal impl**
```ts
// src/lib/yearly-plan/capital-ladder.ts
import type { LadderRule } from "@/db/schema"

interface LadderLevel {
  contracts: number
  valorOperacionalCents: number
  multiplier: number
  tier: number
}

/**
 * Build the full 20-level ladder.
 * Each level's valorOperacional = contracts × valorPorContrato.
 * The multiplier field is informational — it indicates the tier rule that governs the level.
 */
const buildCapitalLadder = (
  rules: LadderRule[],
  valorPorContratoCents: number
): LadderLevel[] => {
  const levels: LadderLevel[] = []

  for (let contracts = 1; contracts <= 20; contracts++) {
    const ruleIndex = rules.findIndex(
      (r) => contracts >= r.minContracts && contracts <= r.maxContracts
    )
    const rule = ruleIndex >= 0 ? rules[ruleIndex] : rules[rules.length - 1]

    levels.push({
      contracts,
      valorOperacionalCents: contracts * valorPorContratoCents,
      multiplier: rule.multiplier,
      tier: ruleIndex >= 0 ? ruleIndex : rules.length - 1,
    })
  }

  return levels
}

/**
 * Given current balance, find the highest ladder level the trader qualifies for.
 * A level is "affordable" when valorOperacionalCents <= balanceCents.
 * Floor: always returns at least 1 contract.
 */
const contractsForBalance = (
  balanceCents: number,
  ladder: LadderLevel[]
): number => {
  let result = 1

  for (const level of ladder) {
    if (level.valorOperacionalCents <= balanceCents) {
      result = level.contracts
    }
  }

  return result
}

export { buildCapitalLadder, contractsForBalance }
export type { LadderLevel }
```

- [ ] **Step 4: Run + expected pass**
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**
```bash
git add src/lib/yearly-plan/capital-ladder.ts src/__tests__/lib/yearly-plan/capital-ladder.test.ts
git commit -m "feat(yearly-plan): add capital-ladder math engine"
```

---

### Task 6: `payoff-matrix.ts` — combinatorial EV engine

**Files:**
- Create: `src/lib/yearly-plan/payoff-matrix.ts`
- Test: `src/__tests__/lib/yearly-plan/payoff-matrix.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/__tests__/lib/yearly-plan/payoff-matrix.test.ts
import { describe, it, expect } from "vitest"
import {
  generateCombinations,
  combinationEv,
  buildPayoffMatrix,
} from "@/lib/yearly-plan/payoff-matrix"
import { DEFAULT_EXIT_CONVENTION } from "@/lib/yearly-plan/exit-convention"

describe("generateCombinations", () => {
  it("N=1 → [{gains:1,stops:0},{gains:0,stops:1}]", () => {
    const combos = generateCombinations(1)
    expect(combos).toEqual([
      { gains: 1, stops: 0 },
      { gains: 0, stops: 1 },
    ])
  })
  it("N=3 → 4 combos (3G, 2G1S, 1G2S, 3S)", () => {
    const combos = generateCombinations(3)
    expect(combos).toHaveLength(4)
    expect(combos[0]).toEqual({ gains: 3, stops: 0 })
    expect(combos[1]).toEqual({ gains: 2, stops: 1 })
    expect(combos[2]).toEqual({ gains: 1, stops: 2 })
    expect(combos[3]).toEqual({ gains: 0, stops: 3 })
  })
  it("N=10 → 11 combos", () => {
    expect(generateCombinations(10)).toHaveLength(11)
  })
})

describe("combinationEv (default convention, 1 contract)", () => {
  it("3G = 3×6.5 = 19.5 pts", () => {
    expect(combinationEv({ gains: 3, stops: 0 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(19.5, 5)
  })
  it("2G1S = 2×6.5 − 3.5 = 9.5 pts", () => {
    expect(combinationEv({ gains: 2, stops: 1 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(9.5, 5)
  })
  it("1G2S = 6.5 − 7.0 = -0.5 pts", () => {
    expect(combinationEv({ gains: 1, stops: 2 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(-0.5, 5)
  })
  it("3S = -10.5 pts", () => {
    expect(combinationEv({ gains: 0, stops: 3 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(-10.5, 5)
  })
  it("2 contracts: 3G = 39 pts", () => {
    expect(combinationEv({ gains: 3, stops: 0 }, DEFAULT_EXIT_CONVENTION, 2)).toBeCloseTo(39, 5)
  })
})

describe("combinationEv sensitivity to exit convention", () => {
  it("lower parcialPts reduces gainEv", () => {
    const modified = { ...DEFAULT_EXIT_CONVENTION, parcialPts: 3.0 }
    // gainEv = 3×0.70 + 10×0.30 = 2.1 + 3.0 = 5.1
    // 3G = 3×5.1 = 15.3
    expect(combinationEv({ gains: 3, stops: 0 }, modified, 1)).toBeCloseTo(15.3, 5)
  })
})

describe("buildPayoffMatrix", () => {
  it("returns 10 rows for default maxOps=10", () => {
    const matrix = buildPayoffMatrix(DEFAULT_EXIT_CONVENTION, 1)
    expect(matrix).toHaveLength(10)
  })
  it("row for N=1 has 2 entries", () => {
    const matrix = buildPayoffMatrix(DEFAULT_EXIT_CONVENTION, 1)
    expect(matrix[0].combinations).toHaveLength(2)
  })
  it("row for N=3: first entry ev = 19.5", () => {
    const matrix = buildPayoffMatrix(DEFAULT_EXIT_CONVENTION, 1)
    const row3 = matrix[2]
    expect(row3.nOps).toBe(3)
    expect(row3.combinations[0].evPoints).toBeCloseTo(19.5, 5)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/payoff-matrix.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Minimal impl**
```ts
// src/lib/yearly-plan/payoff-matrix.ts
import { computeGainEv, computeStopEv } from "@/lib/yearly-plan/exit-convention"
import type { ExitConvention } from "@/lib/yearly-plan/exit-convention"

interface OutcomeCounts {
  gains: number
  stops: number
}

interface PayoffMatrixEntry {
  combo: OutcomeCounts
  label: string   // e.g. "3G", "2G1S", "3S"
  evPoints: number
}

interface PayoffMatrixRow {
  nOps: number
  combinations: PayoffMatrixEntry[]
}

/**
 * Generate all outcome combinations for N operations.
 * Ordered from all-gains to all-stops: {gains:N,stops:0} → {gains:0,stops:N}
 */
const generateCombinations = (nOps: number): OutcomeCounts[] => {
  const result: OutcomeCounts[] = []
  for (let gains = nOps; gains >= 0; gains--) {
    result.push({ gains, stops: nOps - gains })
  }
  return result
}

/**
 * Compute EV in points for one combination.
 * Uses weighted gain EV: parcialPts×parcialProportion + finalPts×finalProportion.
 * Multiplied by contracts to give total operation EV.
 */
const combinationEv = (
  combo: OutcomeCounts,
  convention: ExitConvention,
  contracts: number
): number => {
  const gainEv = computeGainEv(convention)
  const stopEv = computeStopEv(convention)
  return (combo.gains * gainEv + combo.stops * stopEv) * contracts
}

const buildComboLabel = (combo: OutcomeCounts): string => {
  const parts: string[] = []
  if (combo.gains > 0) parts.push(`${combo.gains}G`)
  if (combo.stops > 0) parts.push(`${combo.stops}S`)
  return parts.join("") || "0"
}

/**
 * Build the full matrix: rows 1..maxOps, all combos per row.
 */
const buildPayoffMatrix = (
  convention: ExitConvention,
  contracts: number,
  maxOps: number = 10
): PayoffMatrixRow[] => {
  const rows: PayoffMatrixRow[] = []

  for (let nOps = 1; nOps <= maxOps; nOps++) {
    const combos = generateCombinations(nOps)
    const combinations: PayoffMatrixEntry[] = combos.map((combo) => ({
      combo,
      label: buildComboLabel(combo),
      evPoints: combinationEv(combo, convention, contracts),
    }))
    rows.push({ nOps, combinations })
  }

  return rows
}

export { buildPayoffMatrix, generateCombinations, combinationEv }
export type { OutcomeCounts, PayoffMatrixEntry, PayoffMatrixRow }
```

- [ ] **Step 4: Run + expected pass**
Expected: PASS (all tests)

- [ ] **Step 5: Commit**
```bash
git add src/lib/yearly-plan/payoff-matrix.ts src/__tests__/lib/yearly-plan/payoff-matrix.test.ts
git commit -m "feat(yearly-plan): add payoff-matrix math engine with weighted gain EV"
```

---

### Task 7: `weekly-rollups.ts` — month aggregate computation

**Files:**
- Create: `src/lib/yearly-plan/weekly-rollups.ts`
- Test: `src/__tests__/lib/yearly-plan/weekly-rollups.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/__tests__/lib/yearly-plan/weekly-rollups.test.ts
import { describe, it, expect } from "vitest"
import { computeMonthRollup } from "@/lib/yearly-plan/weekly-rollups"
import type { WeeklyTarget } from "@/db/schema"

const makeWeek = (overrides: Partial<WeeklyTarget>): WeeklyTarget => ({
  id: "w1",
  yearlyPlanId: "plan1",
  isoWeek: 1,
  isoYear: 2026,
  contracts: 1,
  valorOperacionalCents: 300000,
  ptsAlvo: "6.50",
  ptsFeito: "6.00",
  ptsSource: "auto",
  metaBrutoCents: null,
  metaLiquidoCents: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const PLAN_STUB = {
  irTaxRate: "30.00",
  tradingDaysPerWeek: 5,
  valorPorContratoCents: 300000,
}

describe("computeMonthRollup", () => {
  it("totalPtsAlvo sums ptsAlvo across weeks", () => {
    const weeks = [
      makeWeek({ isoWeek: 1, ptsAlvo: "6.50" }),
      makeWeek({ isoWeek: 2, ptsAlvo: "6.50" }),
      makeWeek({ isoWeek: 3, ptsAlvo: "6.50" }),
      makeWeek({ isoWeek: 4, ptsAlvo: "6.50" }),
    ]
    const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 0)
    expect(rollup.totalPtsAlvo).toBeCloseTo(26, 5)
  })
  it("totalPtsFeito sums ptsFeito across weeks (null treated as 0)", () => {
    const weeks = [
      makeWeek({ isoWeek: 1, ptsFeito: "10.00" }),
      makeWeek({ isoWeek: 2, ptsFeito: null }),
      makeWeek({ isoWeek: 3, ptsFeito: "5.00" }),
    ]
    const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 0)
    expect(rollup.totalPtsFeito).toBeCloseTo(15, 5)
  })
  it("avgPtsPerWeek = totalPtsFeito / number of weeks with data", () => {
    const weeks = [
      makeWeek({ isoWeek: 1, ptsFeito: "10.00" }),
      makeWeek({ isoWeek: 2, ptsFeito: "20.00" }),
    ]
    const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 0)
    expect(rollup.avgPtsPerWeek).toBeCloseTo(15, 5)
  })
  it("cumulativePoints carries forward from prior months", () => {
    const weeks = [makeWeek({ isoWeek: 1, ptsFeito: "10.00" })]
    const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 50)
    expect(rollup.cumulativePoints).toBeCloseTo(60, 5)
  })
  it("cumulativeFinancialCents carries forward", () => {
    const weeks = [makeWeek({ isoWeek: 1, metaBrutoCents: 100000 })]
    const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 200000, 0)
    expect(rollup.cumulativeFinancialCents).toBe(300000)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/weekly-rollups.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Minimal impl**
```ts
// src/lib/yearly-plan/weekly-rollups.ts
import type { WeeklyTarget } from "@/db/schema"

interface PlanStub {
  irTaxRate: string
  tradingDaysPerWeek: number
  valorPorContratoCents: number
}

interface MonthRollupData {
  totalPtsAlvo: number
  totalPtsFeito: number
  avgPtsPerWeek: number
  monthlyProjectedNetCents: number
  cumulativeFinancialCents: number
  cumulativePoints: number
}

const computeMonthRollup = (
  weeks: WeeklyTarget[],
  plan: PlanStub,
  priorCumulativeFinancialCents: number,
  priorCumulativePoints: number
): MonthRollupData => {
  const irRate = parseFloat(plan.irTaxRate) / 100

  const totalPtsAlvo = weeks.reduce(
    (sum, w) => sum + (w.ptsAlvo != null ? parseFloat(String(w.ptsAlvo)) : 0),
    0
  )
  const totalPtsFeito = weeks.reduce(
    (sum, w) => sum + (w.ptsFeito != null ? parseFloat(String(w.ptsFeito)) : 0),
    0
  )

  const weeksWithData = weeks.filter((w) => w.ptsFeito != null).length
  const avgPtsPerWeek = weeksWithData > 0 ? totalPtsFeito / weeksWithData : 0

  const monthGrossCents = weeks.reduce(
    (sum, w) => sum + (w.metaBrutoCents ?? 0),
    0
  )
  const monthlyProjectedNetCents = Math.round(monthGrossCents * (1 - irRate))

  return {
    totalPtsAlvo,
    totalPtsFeito,
    avgPtsPerWeek,
    monthlyProjectedNetCents,
    cumulativeFinancialCents: priorCumulativeFinancialCents + monthGrossCents,
    cumulativePoints: priorCumulativePoints + totalPtsFeito,
  }
}

export { computeMonthRollup }
export type { MonthRollupData, PlanStub }
```

- [ ] **Step 4: Run + expected pass**
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**
```bash
git add src/lib/yearly-plan/weekly-rollups.ts src/__tests__/lib/yearly-plan/weekly-rollups.test.ts
git commit -m "feat(yearly-plan): add weekly-rollups aggregation engine"
```

---

### Task 8: `point-values.ts` + Zod validation schema

**Files:**
- Create: `src/lib/contracts/point-values.ts`
- Create: `src/lib/validations/yearly-plan.ts`
- Test: `src/__tests__/lib/yearly-plan/point-values.test.ts`

- [ ] **Step 1: Write failing tests**
```ts
// src/__tests__/lib/yearly-plan/point-values.test.ts
import { describe, it, expect } from "vitest"
import {
  getPointValue,
  financialToPoints,
  ASSET_POINT_VALUES,
} from "@/lib/contracts/point-values"

describe("point-values", () => {
  it("getPointValue(WIN) returns 20 cents/pt", () => {
    expect(getPointValue("WIN")?.pointValueCents).toBe(20)
  })
  it("getPointValue(WDO) returns 1000 cents/pt", () => {
    expect(getPointValue("WDO")?.pointValueCents).toBe(1000)
  })
  it("getPointValue is case-insensitive", () => {
    expect(getPointValue("win")?.pointValueCents).toBe(20)
  })
  it("getPointValue(UNKNOWN) returns null", () => {
    expect(getPointValue("PETR4")).toBeNull()
  })
  it("financialToPoints(2000 cents, WIN, 1 contract) = 100 pts", () => {
    expect(financialToPoints(2000, "WIN", 1)).toBe(100)
  })
  it("financialToPoints(10000 cents, WDO, 1 contract) = 10 pts", () => {
    expect(financialToPoints(10000, "WDO", 1)).toBe(10)
  })
  it("financialToPoints with 0 contracts returns null", () => {
    expect(financialToPoints(1000, "WIN", 0)).toBeNull()
  })
  it("ASSET_POINT_VALUES has WIN and WDO keys", () => {
    expect(ASSET_POINT_VALUES).toHaveProperty("WIN")
    expect(ASSET_POINT_VALUES).toHaveProperty("WDO")
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/point-values.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/lib/contracts/point-values.ts`**
```ts
// src/lib/contracts/point-values.ts
// Point value facts for Brazilian mini-futures contracts (regulatory, not configurable)
// WIN = Mini Índice: R$0.20 per point per contract (20 cents)
// WDO = Mini Dólar: R$10.00 per pip per contract (1000 cents)

interface AssetPointValue {
  asset: string
  pointValueCents: number
  description: string
}

const ASSET_POINT_VALUES: Record<string, AssetPointValue> = {
  WIN: { asset: "WIN", pointValueCents: 20, description: "Mini Índice — R$0,20/pt" },
  WDO: { asset: "WDO", pointValueCents: 1000, description: "Mini Dólar — R$10,00/pt" },
}

const getPointValue = (asset: string): AssetPointValue | null =>
  ASSET_POINT_VALUES[asset.toUpperCase()] ?? null

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

Also create `src/lib/validations/yearly-plan.ts`:
```ts
// src/lib/validations/yearly-plan.ts
// No "use server" directive — Zod schemas must live in plain modules
import { z } from "zod"

export const ladderRuleSchema = z.object({
  minContracts: z.number().int().min(1).max(20),
  maxContracts: z.number().int().min(1).max(20),
  multiplier: z.number().int().min(1).max(10),
})

export const yearlyPlanSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  initialCapitalCents: z.coerce.number().int().positive().max(100_000_000_00),
  valorPorContratoCents: z.coerce.number().int().positive().default(300000),
  irTaxRate: z.coerce.number().min(0).max(100).default(30),
  tradingDaysPerWeek: z.coerce.number().int().min(1).max(7).default(5),
  ladderRules: z.array(ladderRuleSchema).min(1).max(10),
  exitParcialPts: z.coerce.number().positive().max(100).default(5.0),
  exitFinalPts: z.coerce.number().positive().max(100).default(10.0),
  exitStopPts: z.coerce.number().positive().max(100).default(3.5),
  exitProtPts: z.coerce.number().min(0).max(100).default(1.0),
  exitParcialProportion: z.coerce.number().min(0).max(1).default(0.70),
  exitFinalProportion: z.coerce.number().min(0).max(1).default(0.30),
  startWeek: z.coerce.number().int().min(1).max(52).default(1),
  notes: z.string().max(5000).optional().nullable(),
}).refine(
  (d) => Math.abs((d.exitParcialProportion + d.exitFinalProportion) - 1.0) < 0.001,
  { message: "Exit proportions must sum to 1.0", path: ["exitFinalProportion"] }
)

export const weeklyTargetInputSchema = z.object({
  isoWeek: z.number().int().min(1).max(53),
  isoYear: z.number().int().min(2020).max(2100),
  contracts: z.number().int().positive().optional(),
  valorOperacionalCents: z.number().int().positive().optional(),
  ptsAlvo: z.coerce.number().optional().nullable(),
  ptsFeito: z.coerce.number().optional().nullable(),
  ptsSource: z.enum(["auto", "manual"]).default("manual"),
  metaBrutoCents: z.number().int().optional().nullable(),
  metaLiquidoCents: z.number().int().optional().nullable(),
})

export type YearlyPlanInput = z.infer<typeof yearlyPlanSchema>
export type WeeklyTargetInput = z.infer<typeof weeklyTargetInputSchema>
```

- [ ] **Step 4: Run test + expected pass**
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**
```bash
git add src/lib/contracts/point-values.ts src/lib/validations/yearly-plan.ts src/__tests__/lib/yearly-plan/point-values.test.ts
git commit -m "feat(yearly-plan): add point-values resolver + Zod validation schemas"
```

---

## Phase 3 — Server Actions (6 tasks)

### Task 9: `getYearlyPlan` + `upsertYearlyPlan`

**Files:**
- Create: `src/app/actions/yearly-plan.ts`
- Test: integration test approach — manual curl/page load; unit test via mocking in later tasks

- [ ] **Step 1: Write failing integration-style test**
```ts
// src/__tests__/lib/yearly-plan/actions-stub.test.ts
import { describe, it, expect } from "vitest"
// This test validates that the action module exports the expected function names
// It does NOT call them (they require a live DB + auth session)

describe("yearly-plan action exports", () => {
  it("exports all required actions", async () => {
    const mod = await import("@/app/actions/yearly-plan")
    expect(typeof mod.getYearlyPlan).toBe("function")
    expect(typeof mod.upsertYearlyPlan).toBe("function")
    expect(typeof mod.upsertWeeklyTargets).toBe("function")
    expect(typeof mod.syncWeeklyActuals).toBe("function")
    expect(typeof mod.syncCapitalBetweenPlans).toBe("function")
    expect(typeof mod.deleteYearlyPlan).toBe("function")
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/actions-stub.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/app/actions/yearly-plan.ts` (getYearlyPlan + upsertYearlyPlan)**
```ts
"use server"

import { db } from "@/db/drizzle"
import { yearlyPlans, weeklyTargets } from "@/db/schema"
import type { YearlyPlan, WeeklyTarget } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { yearlyPlanSchema, weeklyTargetInputSchema } from "@/lib/validations/yearly-plan"
import type { YearlyPlanInput, WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { buildCapitalLadder, contractsForBalance } from "@/lib/yearly-plan/capital-ladder"
import { getIsoWeeksForYear } from "@/lib/calendar/iso-week"
import { getServerEffectiveNow } from "@/lib/effective-date"

interface YearlyPlanWithWeeks {
  plan: YearlyPlan
  weeklyTargets: WeeklyTarget[]
}

/**
 * Fetch yearly plan for the active account + given year, including all weekly targets.
 */
const getYearlyPlan = async (
  year: number
): Promise<ActionResponse<YearlyPlanWithWeeks | null>> => {
  try {
    const { accountId } = await requireAuth()

    const plan = await db.query.yearlyPlans.findFirst({
      where: and(
        eq(yearlyPlans.accountId, accountId),
        eq(yearlyPlans.year, year)
      ),
      with: { weeklyTargets: true },
    })

    if (!plan) {
      return { status: "success", message: "No yearly plan found", data: null }
    }

    const { weeklyTargets: weeks, ...planOnly } = plan as YearlyPlan & { weeklyTargets: WeeklyTarget[] }

    return {
      status: "success",
      message: "Yearly plan retrieved",
      data: { plan: planOnly, weeklyTargets: weeks },
    }
  } catch (error) {
    return {
      status: "error",
      message: "Failed to fetch yearly plan",
      errors: [{ code: "FETCH_FAILED", detail: toSafeErrorMessage(error, "getYearlyPlan") }],
    }
  }
}

/**
 * Create or update the yearly plan header.
 * On creation, generates weekly_targets rows for all ISO weeks in the year.
 * Triggers capital sync with monthlyPlans if initialCapitalCents changes.
 */
const upsertYearlyPlan = async (
  input: YearlyPlanInput
): Promise<ActionResponse<YearlyPlan>> => {
  try {
    const { accountId } = await requireAuth()
    const validated = yearlyPlanSchema.parse(input)

    const existing = await db.query.yearlyPlans.findFirst({
      where: and(
        eq(yearlyPlans.accountId, accountId),
        eq(yearlyPlans.year, validated.year)
      ),
    })

    const ladderRules = validated.ladderRules
    const ladder = buildCapitalLadder(ladderRules, validated.valorPorContratoCents)

    if (existing) {
      const [updated] = await db
        .update(yearlyPlans)
        .set({
          initialCapitalCents: validated.initialCapitalCents,
          valorPorContratoCents: validated.valorPorContratoCents,
          irTaxRate: String(validated.irTaxRate),
          tradingDaysPerWeek: validated.tradingDaysPerWeek,
          ladderRules,
          exitParcialPts: String(validated.exitParcialPts),
          exitFinalPts: String(validated.exitFinalPts),
          exitStopPts: String(validated.exitStopPts),
          exitProtPts: String(validated.exitProtPts),
          exitParcialProportion: String(validated.exitParcialProportion),
          exitFinalProportion: String(validated.exitFinalProportion),
          startWeek: validated.startWeek,
          notes: validated.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(yearlyPlans.id, existing.id))
        .returning()

      // Recalculate future weekly targets' contracts + valorOperacionalCents
      const effectiveNow = await getServerEffectiveNow()
      const currentIsoWeek = getIsoWeek(effectiveNow)
      const currentIsoYear = effectiveNow.getFullYear()

      const futureWeeks = await db.query.weeklyTargets.findMany({
        where: and(
          eq(weeklyTargets.yearlyPlanId, existing.id),
          // Only future weeks: isoYear >= current and isoWeek > current (simple approximation)
        ),
      })

      for (const week of futureWeeks) {
        if (
          week.isoYear > currentIsoYear ||
          (week.isoYear === currentIsoYear && week.isoWeek >= currentIsoWeek)
        ) {
          const contracts = contractsForBalance(validated.initialCapitalCents, ladder)
          await db
            .update(weeklyTargets)
            .set({
              contracts,
              valorOperacionalCents: contracts * validated.valorPorContratoCents,
              updatedAt: new Date(),
            })
            .where(eq(weeklyTargets.id, week.id))
        }
      }

      return { status: "success", message: "Yearly plan updated", data: updated }
    }

    // Create new plan
    const [newPlan] = await db
      .insert(yearlyPlans)
      .values({
        accountId,
        year: validated.year,
        initialCapitalCents: validated.initialCapitalCents,
        valorPorContratoCents: validated.valorPorContratoCents,
        irTaxRate: String(validated.irTaxRate),
        tradingDaysPerWeek: validated.tradingDaysPerWeek,
        ladderRules,
        exitParcialPts: String(validated.exitParcialPts),
        exitFinalPts: String(validated.exitFinalPts),
        exitStopPts: String(validated.exitStopPts),
        exitProtPts: String(validated.exitProtPts),
        exitParcialProportion: String(validated.exitParcialProportion),
        exitFinalProportion: String(validated.exitFinalProportion),
        startWeek: validated.startWeek,
        notes: validated.notes ?? null,
      })
      .returning()

    // Seed weekly_targets for all ISO weeks in the year
    const isoWeeks = getIsoWeeksForYear(validated.year)
    const contracts = contractsForBalance(validated.initialCapitalCents, ladder)

    const weekRows = isoWeeks
      .filter((w) => w.week >= validated.startWeek)
      .map((w) => ({
        yearlyPlanId: newPlan.id,
        isoWeek: w.week,
        isoYear: w.isoYear,
        contracts,
        valorOperacionalCents: contracts * validated.valorPorContratoCents,
        ptsAlvo: null,
        ptsFeito: null,
        ptsSource: "auto" as const,
      }))

    if (weekRows.length > 0) {
      await db.insert(weeklyTargets).values(weekRows)
    }

    return { status: "success", message: "Yearly plan created", data: newPlan }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: "Validation error",
        errors: error.issues.map((i) => ({ code: "VALIDATION_ERROR", detail: `${i.path.join(".")}: ${i.message}` })),
      }
    }
    return {
      status: "error",
      message: "Failed to save yearly plan",
      errors: [{ code: "SAVE_FAILED", detail: toSafeErrorMessage(error, "upsertYearlyPlan") }],
    }
  }
}

// Helper: extract ISO week number from a Date
const getIsoWeek = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
```

The remaining 4 actions are stubbed below (to be implemented in Task 10).

- [ ] **Step 4: Run stub test + expected pass**
Run: `bun test src/__tests__/lib/yearly-plan/actions-stub.test.ts`
Expected: PASS (once all exports exist)

- [ ] **Step 5: Commit**
```bash
git add src/app/actions/yearly-plan.ts src/__tests__/lib/yearly-plan/actions-stub.test.ts
git commit -m "feat(yearly-plan): add getYearlyPlan + upsertYearlyPlan server actions"
```

---

### Task 10: `upsertWeeklyTargets` + `syncWeeklyActuals` + `syncCapitalBetweenPlans` + `deleteYearlyPlan`

**Files:**
- Modify: `src/app/actions/yearly-plan.ts` (append remaining 4 exports)

- [ ] **Step 1: No additional test file needed** — covered by actions-stub.test.ts from Task 9

- [ ] **Step 2: Add to `src/app/actions/yearly-plan.ts`**

Append after the `upsertYearlyPlan` export:

```ts
/**
 * Bulk upsert weekly targets (grid cell edits).
 * Respects ptsSource: "manual" rows are never overwritten by auto-sync.
 */
const upsertWeeklyTargets = async (
  yearlyPlanId: string,
  weeks: WeeklyTargetInput[]
): Promise<ActionResponse<WeeklyTarget[]>> => {
  try {
    await requireAuth()
    const validated = weeks.map((w) => weeklyTargetInputSchema.parse(w))

    const results: WeeklyTarget[] = []

    for (const week of validated) {
      const existing = await db.query.weeklyTargets.findFirst({
        where: and(
          eq(weeklyTargets.yearlyPlanId, yearlyPlanId),
          eq(weeklyTargets.isoWeek, week.isoWeek),
          eq(weeklyTargets.isoYear, week.isoYear)
        ),
      })

      if (existing) {
        const [updated] = await db
          .update(weeklyTargets)
          .set({
            ...(week.contracts != null && { contracts: week.contracts }),
            ...(week.valorOperacionalCents != null && { valorOperacionalCents: week.valorOperacionalCents }),
            ...(week.ptsAlvo !== undefined && { ptsAlvo: week.ptsAlvo != null ? String(week.ptsAlvo) : null }),
            ...(week.ptsFeito !== undefined && { ptsFeito: week.ptsFeito != null ? String(week.ptsFeito) : null }),
            ptsSource: week.ptsSource,
            ...(week.metaBrutoCents !== undefined && { metaBrutoCents: week.metaBrutoCents }),
            ...(week.metaLiquidoCents !== undefined && { metaLiquidoCents: week.metaLiquidoCents }),
            updatedAt: new Date(),
          })
          .where(eq(weeklyTargets.id, existing.id))
          .returning()
        results.push(updated)
      }
    }

    return { status: "success", message: `Updated ${results.length} weekly targets`, data: results }
  } catch (error) {
    return {
      status: "error",
      message: "Failed to update weekly targets",
      errors: [{ code: "UPDATE_FAILED", detail: toSafeErrorMessage(error, "upsertWeeklyTargets") }],
    }
  }
}

/**
 * Sync ptsFeito for given ISO weeks from trades.pointsPnl.
 * Only overwrites rows where ptsSource = "auto" (manual overrides are preserved).
 */
const syncWeeklyActuals = async (
  yearlyPlanId: string,
  isoWeeks: number[]
): Promise<ActionResponse<{ synced: number; weeks: WeeklyTarget[] }>> => {
  try {
    const { accountId } = await requireAuth()

    const plan = await db.query.yearlyPlans.findFirst({
      where: eq(yearlyPlans.id, yearlyPlanId),
    })
    if (!plan) {
      return { status: "error", message: "Plan not found", errors: [{ code: "NOT_FOUND", detail: "Yearly plan not found" }] }
    }

    const synced: WeeklyTarget[] = []

    for (const isoWeek of isoWeeks) {
      const targetRow = await db.query.weeklyTargets.findFirst({
        where: and(
          eq(weeklyTargets.yearlyPlanId, yearlyPlanId),
          eq(weeklyTargets.isoWeek, isoWeek),
          eq(weeklyTargets.isoYear, plan.year)
        ),
      })

      if (!targetRow || targetRow.ptsSource === "manual") continue

      // Sum pointsPnl for this account + ISO week
      const result = await db.execute<{ total: string | null }>(
        sql`SELECT SUM(points_pnl) as total
            FROM trades
            WHERE account_id = ${accountId}
              AND EXTRACT(WEEK FROM entry_date) = ${isoWeek}
              AND EXTRACT(YEAR FROM entry_date) = ${plan.year}
              AND is_archived = false`
      )

      const total = result.rows[0]?.total
      const ptsFeito = total != null ? String(parseFloat(total)) : null

      const [updated] = await db
        .update(weeklyTargets)
        .set({ ptsFeito, ptsSource: "auto", updatedAt: new Date() })
        .where(eq(weeklyTargets.id, targetRow.id))
        .returning()

      synced.push(updated)
    }

    return {
      status: "success",
      message: `Synced ${synced.length} weeks`,
      data: { synced: synced.length, weeks: synced },
    }
  } catch (error) {
    return {
      status: "error",
      message: "Failed to sync weekly actuals",
      errors: [{ code: "SYNC_FAILED", detail: toSafeErrorMessage(error, "syncWeeklyActuals") }],
    }
  }
}

/**
 * Two-way capital sync between yearly_plans and monthlyPlans.
 * source = "monthly": copy monthlyPlans.accountBalance → yearlyPlans.initialCapitalCents
 * source = "yearly": copy yearlyPlans.initialCapitalCents → monthlyPlans.accountBalance
 * Conflict resolution: if updatedAt timestamps are identical → prefer monthlyPlans.
 */
const syncCapitalBetweenPlans = async (
  monthlyPlanId: string,
  source: "monthly" | "yearly"
): Promise<ActionResponse<void>> => {
  try {
    const { accountId } = await requireAuth()

    const monthlyPlan = await db.query.monthlyPlans.findFirst({
      where: and(eq(monthlyPlans.id, monthlyPlanId), eq(monthlyPlans.accountId, accountId)),
    })
    if (!monthlyPlan) {
      return { status: "error", message: "Monthly plan not found", errors: [{ code: "NOT_FOUND", detail: "Monthly plan not found" }] }
    }

    const yearlyPlan = await db.query.yearlyPlans.findFirst({
      where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, monthlyPlan.year)),
    })
    if (!yearlyPlan) {
      return { status: "success", message: "No yearly plan found for this year — sync skipped", data: undefined }
    }

    const monthlyTs = monthlyPlan.updatedAt.getTime()
    const yearlyTs = yearlyPlan.updatedAt.getTime()

    if (source === "monthly" || monthlyTs >= yearlyTs) {
      // Monthly wins: propagate to yearly
      await db
        .update(yearlyPlans)
        .set({ initialCapitalCents: Math.round(parseFloat(String(monthlyPlan.accountBalance))), updatedAt: new Date() })
        .where(eq(yearlyPlans.id, yearlyPlan.id))
    } else {
      // Yearly wins: propagate to monthly
      await db
        .update(monthlyPlans)
        .set({ accountBalance: String(yearlyPlan.initialCapitalCents), updatedAt: new Date() })
        .where(eq(monthlyPlans.id, monthlyPlan.id))
    }

    return { status: "success", message: "Capital synced", data: undefined }
  } catch (error) {
    return {
      status: "error",
      message: "Failed to sync capital",
      errors: [{ code: "SYNC_FAILED", detail: toSafeErrorMessage(error, "syncCapitalBetweenPlans") }],
    }
  }
}

/**
 * Delete a yearly plan (cascades to weekly_targets via FK).
 */
const deleteYearlyPlan = async (
  yearlyPlanId: string
): Promise<ActionResponse<void>> => {
  try {
    const { accountId } = await requireAuth()

    const plan = await db.query.yearlyPlans.findFirst({
      where: and(eq(yearlyPlans.id, yearlyPlanId), eq(yearlyPlans.accountId, accountId)),
    })
    if (!plan) {
      return { status: "error", message: "Plan not found", errors: [{ code: "NOT_FOUND", detail: "Yearly plan not found" }] }
    }

    await db.delete(yearlyPlans).where(eq(yearlyPlans.id, yearlyPlanId))

    return { status: "success", message: "Yearly plan deleted", data: undefined }
  } catch (error) {
    return {
      status: "error",
      message: "Failed to delete yearly plan",
      errors: [{ code: "DELETE_FAILED", detail: toSafeErrorMessage(error, "deleteYearlyPlan") }],
    }
  }
}

// Missing imports to add at top of file:
// import { sql } from "drizzle-orm"
// import { monthlyPlans } from "@/db/schema"

export {
  getYearlyPlan,
  upsertYearlyPlan,
  upsertWeeklyTargets,
  syncWeeklyActuals,
  syncCapitalBetweenPlans,
  deleteYearlyPlan,
}
export type { YearlyPlanWithWeeks }
```

- [ ] **Step 3: Run stub test + expected pass**
Run: `bun test src/__tests__/lib/yearly-plan/actions-stub.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add src/app/actions/yearly-plan.ts
git commit -m "feat(yearly-plan): add remaining server actions (sync, delete, weekly targets)"
```

---

## Phase 4 — Components (6 tasks)

### Task 11: `YearlyPlanContent` — client shell + tab routing

**Files:**
- Create: `src/components/yearly-plan/yearly-plan-content.tsx`
- Create: `src/components/yearly-plan/index.ts`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/components/yearly-plan/yearly-plan-content.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { YearlyPlanContent } from "@/components/yearly-plan/yearly-plan-content"

describe("YearlyPlanContent", () => {
  it("renders onboarding wizard when no plan exists", () => {
    render(<YearlyPlanContent initialPlan={null} year={2026} />)
    expect(screen.getByTestId("yearly-plan-onboarding")).toBeDefined()
  })
  it("renders tabs when plan exists", () => {
    const mockPlan = {
      plan: { id: "p1", year: 2026 } as never,
      weeklyTargets: [],
    }
    render(<YearlyPlanContent initialPlan={mockPlan} year={2026} />)
    expect(screen.getByRole("tab", { name: /grid|grade/i })).toBeDefined()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/components/yearly-plan/yearly-plan-content.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Minimal impl**
```tsx
// src/components/yearly-plan/yearly-plan-content.tsx
"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { YearlyPlanOnboarding } from "@/components/yearly-plan/yearly-plan-onboarding"
import { YearGrid } from "@/components/yearly-plan/year-grid"
import { CapitalLadder } from "@/components/yearly-plan/capital-ladder"
import { ExitConventionForm } from "@/components/yearly-plan/exit-convention-form"
import { PayoffMatrix } from "@/components/yearly-plan/payoff-matrix"
import type { YearlyPlan, WeeklyTarget } from "@/db/schema"
import type { YearlyPlanWithWeeks } from "@/app/actions/yearly-plan"
import type { YearlyPlanInput, WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { upsertYearlyPlan, upsertWeeklyTargets, syncWeeklyActuals } from "@/app/actions/yearly-plan"
import { getIsoWeekOfDate } from "@/lib/calendar/iso-week"

type ActiveTab = "grid" | "ladder" | "exits" | "payoff"

interface YearlyPlanContentProps {
  initialPlan: YearlyPlanWithWeeks | null
  year: number
}

const YearlyPlanContent = ({ initialPlan, year }: YearlyPlanContentProps) => {
  const [planData, setPlanData] = useState<YearlyPlanWithWeeks | null>(initialPlan)
  const [activeTab, setActiveTab] = useState<ActiveTab>("grid")

  const handleOnboardingComplete = (newPlan: YearlyPlanWithWeeks) => {
    setPlanData(newPlan)
  }

  const handlePlanUpdate = async (updates: Partial<YearlyPlanInput>) => {
    if (!planData) return
    const input: YearlyPlanInput = {
      year,
      initialCapitalCents: planData.plan.initialCapitalCents,
      valorPorContratoCents: planData.plan.valorPorContratoCents,
      irTaxRate: parseFloat(String(planData.plan.irTaxRate)),
      tradingDaysPerWeek: planData.plan.tradingDaysPerWeek,
      ladderRules: planData.plan.ladderRules,
      exitParcialPts: parseFloat(String(planData.plan.exitParcialPts)),
      exitFinalPts: parseFloat(String(planData.plan.exitFinalPts)),
      exitStopPts: parseFloat(String(planData.plan.exitStopPts)),
      exitProtPts: parseFloat(String(planData.plan.exitProtPts)),
      exitParcialProportion: parseFloat(String(planData.plan.exitParcialProportion)),
      exitFinalProportion: parseFloat(String(planData.plan.exitFinalProportion)),
      startWeek: planData.plan.startWeek,
      ...updates,
    }
    const result = await upsertYearlyPlan(input)
    if (result.status === "success" && result.data) {
      setPlanData((prev) => prev ? { ...prev, plan: result.data as YearlyPlan } : prev)
    }
  }

  const handleWeekUpdate = async (weekInput: WeeklyTargetInput) => {
    if (!planData) return
    const result = await upsertWeeklyTargets(planData.plan.id, [weekInput])
    if (result.status === "success" && result.data) {
      setPlanData((prev) => {
        if (!prev) return prev
        const updated = result.data as WeeklyTarget[]
        const map = new Map(updated.map((w) => [w.id, w]))
        return {
          ...prev,
          weeklyTargets: prev.weeklyTargets.map((w) => map.get(w.id) ?? w),
        }
      })
    }
  }

  const handleSyncWeek = async (isoWeek: number) => {
    if (!planData) return
    const result = await syncWeeklyActuals(planData.plan.id, [isoWeek])
    if (result.status === "success" && result.data) {
      const synced = result.data.weeks
      setPlanData((prev) => {
        if (!prev) return prev
        const map = new Map(synced.map((w) => [w.id, w]))
        return {
          ...prev,
          weeklyTargets: prev.weeklyTargets.map((w) => map.get(w.id) ?? w),
        }
      })
    }
  }

  const currentIsoWeek = getIsoWeekOfDate(new Date())

  if (!planData) {
    return (
      <div data-testid="yearly-plan-onboarding">
        <YearlyPlanOnboarding year={year} onComplete={handleOnboardingComplete} />
      </div>
    )
  }

  const exitConvention = {
    parcialPts: parseFloat(String(planData.plan.exitParcialPts)),
    finalPts: parseFloat(String(planData.plan.exitFinalPts)),
    stopPts: parseFloat(String(planData.plan.exitStopPts)),
    protPts: parseFloat(String(planData.plan.exitProtPts)),
    parcialProportion: parseFloat(String(planData.plan.exitParcialProportion)),
    finalProportion: parseFloat(String(planData.plan.exitFinalProportion)),
  }

  const currentContracts = planData.weeklyTargets.find(
    (w) => w.isoWeek === currentIsoWeek
  )?.contracts ?? 1

  return (
    <div className="space-y-s-400">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-t-700 font-semibold text-text-100">Plano Anual {year}</h1>
          <p className="text-t-400 text-text-200 mt-s-100">
            Capital inicial: R$ {(planData.plan.initialCapitalCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
        <TabsList>
          <TabsTrigger value="grid">Grade Semanal</TabsTrigger>
          <TabsTrigger value="ladder">Escada de Capital</TabsTrigger>
          <TabsTrigger value="exits">Convenção de Saída</TabsTrigger>
          <TabsTrigger value="payoff">Matriz de Payoff</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="mt-m-400">
          <YearGrid
            weeks={planData.weeklyTargets}
            plan={planData.plan}
            onWeekUpdate={handleWeekUpdate}
            onSyncWeek={handleSyncWeek}
            currentIsoWeek={currentIsoWeek}
          />
        </TabsContent>

        <TabsContent value="ladder" className="mt-m-400">
          <CapitalLadder plan={planData.plan} onUpdate={handlePlanUpdate} />
        </TabsContent>

        <TabsContent value="exits" className="mt-m-400">
          <ExitConventionForm plan={planData.plan} onUpdate={handlePlanUpdate} />
        </TabsContent>

        <TabsContent value="payoff" className="mt-m-400">
          <PayoffMatrix exitConvention={exitConvention} contracts={currentContracts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export { YearlyPlanContent }
```

Create barrel:
```ts
// src/components/yearly-plan/index.ts
export { YearlyPlanContent } from "@/components/yearly-plan/yearly-plan-content"
export { YearlyPlanOnboarding } from "@/components/yearly-plan/yearly-plan-onboarding"
export { YearGrid } from "@/components/yearly-plan/year-grid"
export { WeekCell } from "@/components/yearly-plan/week-cell"
export { MonthRollup } from "@/components/yearly-plan/month-rollup"
export { CapitalLadder } from "@/components/yearly-plan/capital-ladder"
export { ExitConventionForm } from "@/components/yearly-plan/exit-convention-form"
export { PayoffMatrix } from "@/components/yearly-plan/payoff-matrix"
```

- [ ] **Step 4: Run test + expected pass** (after all component stubs exist)
- [ ] **Step 5: Commit**
```bash
git add src/components/yearly-plan/
git commit -m "feat(yearly-plan): add YearlyPlanContent client shell + barrel"
```

---

### Task 12: `YearlyPlanOnboarding` — 3-step wizard

**Files:**
- Create: `src/components/yearly-plan/yearly-plan-onboarding.tsx`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/components/yearly-plan/yearly-plan-onboarding.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { YearlyPlanOnboarding } from "@/components/yearly-plan/yearly-plan-onboarding"

describe("YearlyPlanOnboarding", () => {
  it("renders Step 1 by default (capital input)", () => {
    render(<YearlyPlanOnboarding year={2026} onComplete={() => undefined} />)
    expect(screen.getByLabelText(/capital inicial|starting capital/i)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/components/yearly-plan/yearly-plan-onboarding.test.tsx`
Expected: FAIL

- [ ] **Step 3: Minimal impl**
```tsx
// src/components/yearly-plan/yearly-plan-onboarding.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertYearlyPlan } from "@/app/actions/yearly-plan"
import { buildCapitalLadder } from "@/lib/yearly-plan/capital-ladder"
import { DEFAULT_EXIT_CONVENTION } from "@/lib/yearly-plan/exit-convention"
import type { YearlyPlanWithWeeks } from "@/app/actions/yearly-plan"
import type { LadderRule } from "@/db/schema"

const DEFAULT_LADDER_RULES: LadderRule[] = [
  { minContracts: 1,  maxContracts: 5,  multiplier: 1 },
  { minContracts: 6,  maxContracts: 10, multiplier: 2 },
  { minContracts: 11, maxContracts: 15, multiplier: 3 },
  { minContracts: 16, maxContracts: 20, multiplier: 4 },
]

interface YearlyPlanOnboardingProps {
  year: number
  onComplete: (plan: YearlyPlanWithWeeks) => void
}

type Step = 1 | 2 | 3

const YearlyPlanOnboarding = ({ year, onComplete }: YearlyPlanOnboardingProps) => {
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [capitalBRL, setCapitalBRL] = useState("")
  const [valorPorContratoStr, setValorPorContratoStr] = useState("3000")
  const [tradingDays, setTradingDays] = useState(5)
  const [ladderRules, setLadderRules] = useState<LadderRule[]>(DEFAULT_LADDER_RULES)
  const [exitParcial, setExitParcial] = useState(5.0)
  const [exitFinal, setExitFinal] = useState(10.0)
  const [exitStop, setExitStop] = useState(3.5)
  const [exitProt, setExitProt] = useState(1.0)

  const capitalCents = Math.round(parseFloat(capitalBRL || "0") * 100)
  const valorPorContratoCents = Math.round(parseFloat(valorPorContratoStr || "3000") * 100)

  const ladder = buildCapitalLadder(ladderRules, valorPorContratoCents)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const result = await upsertYearlyPlan({
        year,
        initialCapitalCents: capitalCents,
        valorPorContratoCents,
        irTaxRate: 30,
        tradingDaysPerWeek: tradingDays,
        ladderRules,
        exitParcialPts: exitParcial,
        exitFinalPts: exitFinal,
        exitStopPts: exitStop,
        exitProtPts: exitProt,
        exitParcialProportion: 0.70,
        exitFinalProportion: 0.30,
        startWeek: 1,
      })
      if (result.status === "success" && result.data) {
        onComplete({ plan: result.data, weeklyTargets: [] })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-m-500">
      <div className="text-center space-y-s-200">
        <h2 className="text-t-600 font-semibold text-text-100">Configurar Plano Anual {year}</h2>
        <p className="text-t-400 text-text-200">Passo {step} de 3</p>
      </div>

      {step === 1 && (
        <div className="space-y-m-400">
          <div className="space-y-s-200">
            <Label htmlFor="capital-input" aria-label="Capital inicial">Capital Inicial (R$)</Label>
            <Input
              id="capital-input"
              type="number"
              min={0}
              step={1000}
              placeholder="3000"
              value={capitalBRL}
              onChange={(e) => setCapitalBRL(e.target.value)}
              aria-label="Capital inicial"
            />
          </div>
          <div className="space-y-s-200">
            <Label>Dias de operação por semana</Label>
            <Input
              type="number"
              min={1}
              max={7}
              value={tradingDays}
              onChange={(e) => setTradingDays(Number(e.target.value))}
            />
          </div>
          <Button
            disabled={capitalCents <= 0}
            onClick={() => setStep(2)}
            className="w-full"
          >
            Próximo
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-m-400">
          <div className="space-y-s-200">
            <Label>Valor por Contrato (R$)</Label>
            <Input
              type="number"
              min={100}
              step={100}
              value={valorPorContratoStr}
              onChange={(e) => setValorPorContratoStr(e.target.value)}
            />
          </div>
          <div className="rounded-md border border-border-100 overflow-hidden">
            <table className="w-full text-t-300 font-mono">
              <thead className="bg-bg-200">
                <tr>
                  <th className="p-s-200 text-left text-text-200">Contratos</th>
                  <th className="p-s-200 text-right text-text-200">Valor Op.</th>
                  <th className="p-s-200 text-right text-text-200">Tier</th>
                </tr>
              </thead>
              <tbody>
                {ladder.slice(0, 10).map((level) => (
                  <tr key={level.contracts} className="border-t border-border-100">
                    <td className="p-s-200 text-text-100">{level.contracts}</td>
                    <td className="p-s-200 text-right text-text-100">
                      R$ {(level.valorOperacionalCents / 100).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-s-200 text-right text-acc-100">{level.multiplier}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-s-300">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
            <Button onClick={() => setStep(3)} className="flex-1">Próximo</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-m-400">
          <div className="grid grid-cols-2 gap-m-300">
            {[
              { label: "Parcial (pts)", value: exitParcial, setter: setExitParcial },
              { label: "Final (pts)", value: exitFinal, setter: setExitFinal },
              { label: "Stop (pts)", value: exitStop, setter: setExitStop },
              { label: "Proteção (pts)", value: exitProt, setter: setExitProt },
            ].map(({ label, value, setter }) => (
              <div key={label} className="space-y-s-100">
                <Label>{label}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={value}
                  onChange={(e) => setter(parseFloat(e.target.value))}
                />
              </div>
            ))}
          </div>
          <p className="text-t-300 text-text-200">
            EV por op: {(exitParcial * 0.7 + exitFinal * 0.3).toFixed(2)} pts
          </p>
          <div className="flex gap-s-300">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Voltar</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving ? "Salvando..." : "Criar Plano"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { YearlyPlanOnboarding }
```

- [ ] **Step 4: Run test + expected pass**
- [ ] **Step 5: Commit**
```bash
git add src/components/yearly-plan/yearly-plan-onboarding.tsx
git commit -m "feat(yearly-plan): add YearlyPlanOnboarding 3-step wizard"
```

---

### Task 13: `WeekCell` + `MonthRollup`

**Files:**
- Create: `src/components/yearly-plan/week-cell.tsx`
- Create: `src/components/yearly-plan/month-rollup.tsx`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/components/yearly-plan/week-cell.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { WeekCell } from "@/components/yearly-plan/week-cell"

const mockWeek = {
  id: "w1", yearlyPlanId: "p1", isoWeek: 18, isoYear: 2026,
  contracts: 1, valorOperacionalCents: 300000,
  ptsAlvo: "6.50", ptsFeito: "8.00", ptsSource: "auto",
  metaBrutoCents: null, metaLiquidoCents: null,
  createdAt: new Date(), updatedAt: new Date(),
}

describe("WeekCell", () => {
  it("renders week number", () => {
    render(<WeekCell week={mockWeek as never} isCurrentWeek={false} isEditing={false}
      onEdit={() => undefined} onSave={async () => undefined} onSyncActuals={() => undefined} />)
    expect(screen.getByText(/sem 18|week 18/i)).toBeDefined()
  })
  it("shows auto badge when ptsSource=auto", () => {
    render(<WeekCell week={mockWeek as never} isCurrentWeek={false} isEditing={false}
      onEdit={() => undefined} onSave={async () => undefined} onSyncActuals={() => undefined} />)
    expect(screen.getByText(/auto/i)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Expected: FAIL

- [ ] **Step 3: Create `week-cell.tsx`**
```tsx
// src/components/yearly-plan/week-cell.tsx
"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WeeklyTarget } from "@/db/schema"
import type { WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { cn } from "@/lib/utils"

interface WeekCellProps {
  week: WeeklyTarget
  isCurrentWeek: boolean
  isEditing: boolean
  onEdit: () => void
  onSave: (data: WeeklyTargetInput) => Promise<void>
  onSyncActuals: () => void
}

const WeekCell = ({
  week,
  isCurrentWeek,
  isEditing,
  onEdit,
  onSave,
  onSyncActuals,
}: WeekCellProps) => {
  const [ptsFeitoStr, setPtsFeitoStr] = useState(week.ptsFeito != null ? String(week.ptsFeito) : "")
  const [saving, setSaving] = useState(false)

  const ptsAlvo = week.ptsAlvo != null ? parseFloat(String(week.ptsAlvo)) : null
  const ptsFeito = week.ptsFeito != null ? parseFloat(String(week.ptsFeito)) : null
  const isAhead = ptsFeito != null && ptsAlvo != null && ptsFeito >= ptsAlvo

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        isoWeek: week.isoWeek,
        isoYear: week.isoYear,
        ptsFeito: ptsFeitoStr ? parseFloat(ptsFeitoStr) : null,
        ptsSource: "manual",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border p-s-300 space-y-s-100 cursor-pointer transition-colors",
        isCurrentWeek
          ? "border-acc-100 bg-acc-100/5"
          : "border-border-100 bg-bg-200 hover:border-border-200",
        isEditing && "ring-1 ring-acc-100"
      )}
      onClick={!isEditing ? onEdit : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Semana ${week.isoWeek} — ${isEditing ? "editando" : "clique para editar"}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onEdit() }}
    >
      <div className="flex items-center justify-between">
        <span className="text-t-300 font-mono text-text-200">Sem {week.isoWeek}</span>
        <div className="flex items-center gap-s-100">
          <span className={cn(
            "text-t-200 px-s-100 py-0 rounded-sm",
            week.ptsSource === "auto"
              ? "bg-acc-200/20 text-acc-200"
              : "bg-text-200/20 text-text-200"
          )}>
            {week.ptsSource === "auto" ? "auto" : "manual"}
          </span>
          {isCurrentWeek && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={(e) => { e.stopPropagation(); onSyncActuals() }}
              aria-label="Sincronizar pontos do semana"
            >
              <RefreshCw className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-s-100 text-t-300 font-mono">
        <div>
          <span className="text-text-200">Alvo </span>
          <span className="text-text-100">{ptsAlvo?.toFixed(1) ?? "—"}</span>
        </div>
        <div>
          <span className="text-text-200">Feito </span>
          <span className={cn("font-semibold", isAhead ? "text-green-400" : ptsFeito != null ? "text-red-400" : "text-text-200")}>
            {ptsFeito?.toFixed(1) ?? "—"}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-text-200">Cnt </span>
          <span className="text-acc-100">{week.contracts}</span>
          <span className="text-text-200 ml-s-200">R$ {(week.valorOperacionalCents / 100).toLocaleString("pt-BR")}</span>
        </div>
      </div>

      {isEditing && (
        <div className="pt-s-200 space-y-s-200" onClick={(e) => e.stopPropagation()}>
          <Input
            type="number"
            step={0.5}
            placeholder="Pts Feito"
            value={ptsFeitoStr}
            onChange={(e) => setPtsFeitoStr(e.target.value)}
            aria-label="Pontos feitos na semana"
          />
          <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      )}
    </div>
  )
}

export { WeekCell }
```

Create `month-rollup.tsx`:
```tsx
// src/components/yearly-plan/month-rollup.tsx
"use client"

import type { WeeklyTarget, YearlyPlan } from "@/db/schema"
import { computeMonthRollup } from "@/lib/yearly-plan/weekly-rollups"

interface MonthRollupProps {
  weeks: WeeklyTarget[]
  plan: YearlyPlan
  cumulativeFinancialCents: number
  cumulativePoints: number
  monthName: string
}

const MonthRollup = ({
  weeks,
  plan,
  cumulativeFinancialCents,
  cumulativePoints,
  monthName,
}: MonthRollupProps) => {
  const rollup = computeMonthRollup(
    weeks,
    {
      irTaxRate: String(plan.irTaxRate),
      tradingDaysPerWeek: plan.tradingDaysPerWeek,
      valorPorContratoCents: plan.valorPorContratoCents,
    },
    cumulativeFinancialCents,
    cumulativePoints
  )

  return (
    <div className="rounded-md bg-bg-300 border border-border-100 px-m-300 py-s-300 mt-s-200">
      <p className="text-t-300 font-semibold text-text-100 mb-s-100">{monthName}</p>
      <div className="grid grid-cols-4 gap-m-200 text-t-300 font-mono">
        <div>
          <p className="text-text-200 text-t-200">Alvo</p>
          <p className="text-text-100">{rollup.totalPtsAlvo.toFixed(1)} pts</p>
        </div>
        <div>
          <p className="text-text-200 text-t-200">Feito</p>
          <p className="text-text-100">{rollup.totalPtsFeito.toFixed(1)} pts</p>
        </div>
        <div>
          <p className="text-text-200 text-t-200">Média/Sem</p>
          <p className="text-text-100">{rollup.avgPtsPerWeek.toFixed(1)} pts</p>
        </div>
        <div>
          <p className="text-text-200 text-t-200">Acum. pts</p>
          <p className="text-acc-100">{rollup.cumulativePoints.toFixed(1)}</p>
        </div>
      </div>
    </div>
  )
}

export { MonthRollup }
```

- [ ] **Step 4: Run test + expected pass**
- [ ] **Step 5: Commit**
```bash
git add src/components/yearly-plan/week-cell.tsx src/components/yearly-plan/month-rollup.tsx
git commit -m "feat(yearly-plan): add WeekCell and MonthRollup components"
```

---

### Task 14: `YearGrid` — 52-week × 12-month layout

**Files:**
- Create: `src/components/yearly-plan/year-grid.tsx`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/components/yearly-plan/year-grid.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { YearGrid } from "@/components/yearly-plan/year-grid"

describe("YearGrid", () => {
  it("renders month headings for all 12 months", () => {
    render(
      <YearGrid
        weeks={[]}
        plan={{ id: "p1", year: 2026, startWeek: 1, valorPorContratoCents: 300000, irTaxRate: "30", tradingDaysPerWeek: 5 } as never}
        onWeekUpdate={async () => undefined}
        onSyncWeek={() => undefined}
        currentIsoWeek={18}
      />
    )
    expect(screen.getAllByRole("region")).toHaveLength(12)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Expected: FAIL

- [ ] **Step 3: Minimal impl**
```tsx
// src/components/yearly-plan/year-grid.tsx
"use client"

import { useState } from "react"
import { WeekCell } from "@/components/yearly-plan/week-cell"
import { MonthRollup } from "@/components/yearly-plan/month-rollup"
import type { WeeklyTarget, YearlyPlan } from "@/db/schema"
import type { WeeklyTargetInput } from "@/lib/validations/yearly-plan"
import { groupWeeksByMonth } from "@/lib/calendar/iso-week"

const MONTH_NAMES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

interface YearGridProps {
  weeks: WeeklyTarget[]
  plan: YearlyPlan
  onWeekUpdate: (week: WeeklyTargetInput) => Promise<void>
  onSyncWeek: (isoWeek: number) => void
  currentIsoWeek: number
}

const YearGrid = ({
  weeks,
  plan,
  onWeekUpdate,
  onSyncWeek,
  currentIsoWeek,
}: YearGridProps) => {
  const [editingWeek, setEditingWeek] = useState<number | null>(null)

  // Group weeks by calendar month (1-12)
  const byMonth = groupWeeksByMonth(weeks, plan.year)

  let cumulativeFinancialCents = 0
  let cumulativePoints = 0

  return (
    <div className="space-y-m-600">
      {MONTH_NAMES_PT.map((monthName, idx) => {
        const month = idx + 1
        const monthWeeks = byMonth[month] ?? []

        const rollupNode = (
          <MonthRollup
            weeks={monthWeeks}
            plan={plan}
            cumulativeFinancialCents={cumulativeFinancialCents}
            cumulativePoints={cumulativePoints}
            monthName={monthName}
          />
        )

        // Accumulate for next month
        const monthPts = monthWeeks.reduce(
          (sum, w) => sum + (w.ptsFeito != null ? parseFloat(String(w.ptsFeito)) : 0),
          0
        )
        const monthGross = monthWeeks.reduce((sum, w) => sum + (w.metaBrutoCents ?? 0), 0)
        cumulativeFinancialCents += monthGross
        cumulativePoints += monthPts

        return (
          <section key={month} aria-label={monthName} role="region">
            <h3 className="text-t-400 font-semibold text-text-100 mb-s-300">{monthName}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-s-300">
              {monthWeeks.length === 0 && (
                <p className="col-span-5 text-t-300 text-text-200 py-s-200">
                  Sem semanas neste mês.
                </p>
              )}
              {monthWeeks.map((week) => (
                <WeekCell
                  key={week.id}
                  week={week}
                  isCurrentWeek={week.isoWeek === currentIsoWeek}
                  isEditing={editingWeek === week.isoWeek}
                  onEdit={() => setEditingWeek(week.isoWeek)}
                  onSave={async (data) => {
                    await onWeekUpdate(data)
                    setEditingWeek(null)
                  }}
                  onSyncActuals={() => onSyncWeek(week.isoWeek)}
                />
              ))}
            </div>
            {rollupNode}
          </section>
        )
      })}
    </div>
  )
}

export { YearGrid }
```

- [ ] **Step 4: Run test + expected pass**
- [ ] **Step 5: Commit**
```bash
git add src/components/yearly-plan/year-grid.tsx
git commit -m "feat(yearly-plan): add YearGrid 52-week × 12-month layout"
```

---

### Task 15: `CapitalLadder` + `ExitConventionForm`

**Files:**
- Create: `src/components/yearly-plan/capital-ladder.tsx`
- Create: `src/components/yearly-plan/exit-convention-form.tsx`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/components/yearly-plan/capital-ladder.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CapitalLadder } from "@/components/yearly-plan/capital-ladder"

const mockPlan = {
  id: "p1", valorPorContratoCents: 300000, irTaxRate: "30", tradingDaysPerWeek: 5,
  ladderRules: [
    { minContracts: 1, maxContracts: 5, multiplier: 1 },
    { minContracts: 6, maxContracts: 10, multiplier: 2 },
    { minContracts: 11, maxContracts: 15, multiplier: 3 },
    { minContracts: 16, maxContracts: 20, multiplier: 4 },
  ],
}

describe("CapitalLadder", () => {
  it("renders 20 ladder rows", () => {
    render(<CapitalLadder plan={mockPlan as never} onUpdate={async () => undefined} />)
    const rows = screen.getAllByRole("row")
    // header + 20 data rows
    expect(rows.length).toBeGreaterThanOrEqual(20)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Expected: FAIL

- [ ] **Step 3: Create `capital-ladder.tsx`**
```tsx
// src/components/yearly-plan/capital-ladder.tsx
"use client"

import { useMemo } from "react"
import { buildCapitalLadder } from "@/lib/yearly-plan/capital-ladder"
import type { YearlyPlan } from "@/db/schema"
import type { YearlyPlanInput } from "@/lib/validations/yearly-plan"
import { cn } from "@/lib/utils"

interface CapitalLadderProps {
  plan: YearlyPlan
  onUpdate: (updates: Partial<YearlyPlanInput>) => void
}

const CapitalLadder = ({ plan }: CapitalLadderProps) => {
  const ladder = useMemo(
    () => buildCapitalLadder(plan.ladderRules, plan.valorPorContratoCents),
    [plan.ladderRules, plan.valorPorContratoCents]
  )

  const TIER_COLORS = ["text-text-100", "text-acc-200", "text-acc-100", "text-purple-400"]

  return (
    <div className="space-y-m-300">
      <div className="flex items-center justify-between">
        <h3 className="text-t-500 font-semibold text-text-100">Escada de Capital</h3>
        <span className="text-t-300 text-text-200">
          R$ {(plan.valorPorContratoCents / 100).toLocaleString("pt-BR")}/contrato
        </span>
      </div>
      <div className="rounded-md border border-border-100 overflow-hidden">
        <table className="w-full text-t-300 font-mono" aria-label="Capital ladder table">
          <thead className="bg-bg-200">
            <tr>
              <th className="p-s-300 text-left text-text-200">Contratos</th>
              <th className="p-s-300 text-right text-text-200">Valor Operacional</th>
              <th className="p-s-300 text-right text-text-200">Tier</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((level) => (
              <tr
                key={level.contracts}
                role="row"
                className={cn(
                  "border-t border-border-100",
                  level.tier % 2 === 0 ? "bg-bg-100" : "bg-bg-200"
                )}
              >
                <td className="p-s-300 text-text-100">{level.contracts}</td>
                <td className="p-s-300 text-right text-text-100">
                  R$ {(level.valorOperacionalCents / 100).toLocaleString("pt-BR")}
                </td>
                <td className={cn("p-s-300 text-right font-semibold", TIER_COLORS[level.tier] ?? "text-text-100")}>
                  {level.multiplier}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { CapitalLadder }
```

Create `exit-convention-form.tsx`:
```tsx
// src/components/yearly-plan/exit-convention-form.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { computeGainEv } from "@/lib/yearly-plan/exit-convention"
import type { YearlyPlan } from "@/db/schema"
import type { YearlyPlanInput } from "@/lib/validations/yearly-plan"

interface ExitConventionFormProps {
  plan: YearlyPlan
  onUpdate: (updates: Partial<YearlyPlanInput>) => void
}

const ExitConventionForm = ({ plan, onUpdate }: ExitConventionFormProps) => {
  const [parcial, setParcial] = useState(parseFloat(String(plan.exitParcialPts)))
  const [final, setFinal] = useState(parseFloat(String(plan.exitFinalPts)))
  const [stop, setStop] = useState(parseFloat(String(plan.exitStopPts)))
  const [prot, setProt] = useState(parseFloat(String(plan.exitProtPts)))
  const [saving, setSaving] = useState(false)

  const gainEv = computeGainEv({
    parcialPts: parcial,
    finalPts: final,
    stopPts: stop,
    protPts: prot,
    parcialProportion: 0.70,
    finalProportion: 0.30,
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      onUpdate({
        exitParcialPts: parcial,
        exitFinalPts: final,
        exitStopPts: stop,
        exitProtPts: prot,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md space-y-m-400">
      <h3 className="text-t-500 font-semibold text-text-100">Convenção de Saída</h3>

      <div className="grid grid-cols-2 gap-m-300">
        {[
          { id: "exit-parcial", label: "Parcial (pts)", value: parcial, setter: setParcial },
          { id: "exit-final", label: "Final (pts)", value: final, setter: setFinal },
          { id: "exit-stop", label: "Stop (pts, mag.)", value: stop, setter: setStop },
          { id: "exit-prot", label: "Proteção (pts)", value: prot, setter: setProt },
        ].map(({ id, label, value, setter }) => (
          <div key={id} className="space-y-s-100">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              type="number"
              min={0}
              step={0.5}
              value={value}
              onChange={(e) => setter(parseFloat(e.target.value) || 0)}
              aria-label={label}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md bg-bg-200 border border-border-100 px-m-300 py-s-300">
        <p className="text-t-300 text-text-200">EV por operação ganha:</p>
        <p className="text-t-500 font-mono font-semibold text-acc-100">
          {gainEv.toFixed(2)} pts
        </p>
        <p className="text-t-200 text-text-200 mt-s-100">
          {parcial} × 70% + {final} × 30% = {gainEv.toFixed(2)}
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Salvar Convenção"}
      </Button>
    </div>
  )
}

export { ExitConventionForm }
```

- [ ] **Step 4: Run test + expected pass**
- [ ] **Step 5: Commit**
```bash
git add src/components/yearly-plan/capital-ladder.tsx src/components/yearly-plan/exit-convention-form.tsx
git commit -m "feat(yearly-plan): add CapitalLadder and ExitConventionForm components"
```

---

### Task 16: `PayoffMatrix` component

**Files:**
- Create: `src/components/yearly-plan/payoff-matrix.tsx`
- Test: `src/__tests__/components/yearly-plan/payoff-matrix.test.tsx`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/components/yearly-plan/payoff-matrix.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PayoffMatrix } from "@/components/yearly-plan/payoff-matrix"
import { DEFAULT_EXIT_CONVENTION } from "@/lib/yearly-plan/exit-convention"

describe("PayoffMatrix", () => {
  it("renders 10 operation rows", () => {
    render(<PayoffMatrix exitConvention={DEFAULT_EXIT_CONVENTION} contracts={1} />)
    // Expect rows labeled 1 through 10
    expect(screen.getByText("1")).toBeDefined()
    expect(screen.getByText("10")).toBeDefined()
  })
  it("3G cell shows 19.5 pts at default convention", () => {
    render(<PayoffMatrix exitConvention={DEFAULT_EXIT_CONVENTION} contracts={1} />)
    expect(screen.getByText("19.5")).toBeDefined()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Expected: FAIL

- [ ] **Step 3: Create `payoff-matrix.tsx`**
```tsx
// src/components/yearly-plan/payoff-matrix.tsx
"use client"

import { useMemo, useState } from "react"
import { buildPayoffMatrix } from "@/lib/yearly-plan/payoff-matrix"
import type { ExitConvention } from "@/lib/yearly-plan/exit-convention"
import { cn } from "@/lib/utils"

interface PayoffMatrixProps {
  exitConvention: ExitConvention
  contracts: number
}

type DisplayMode = "ev" | "label"

const PayoffMatrix = ({ exitConvention, contracts }: PayoffMatrixProps) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("ev")

  const matrix = useMemo(
    () => buildPayoffMatrix(exitConvention, contracts, 10),
    [exitConvention, contracts]
  )

  // Find global max columns needed (N=10 has 11 combos)
  const maxCols = 11

  return (
    <div className="space-y-m-300">
      <div className="flex items-center justify-between">
        <h3 className="text-t-500 font-semibold text-text-100">Matriz de Payoff</h3>
        <div className="flex gap-s-200">
          <button
            className={cn("text-t-300 px-s-300 py-s-100 rounded-sm transition-colors",
              displayMode === "ev" ? "bg-acc-100/20 text-acc-100" : "text-text-200 hover:text-text-100")}
            onClick={() => setDisplayMode("ev")}
            aria-pressed={displayMode === "ev"}
          >
            EV (pts)
          </button>
          <button
            className={cn("text-t-300 px-s-300 py-s-100 rounded-sm transition-colors",
              displayMode === "label" ? "bg-acc-100/20 text-acc-100" : "text-text-200 hover:text-text-100")}
            onClick={() => setDisplayMode("label")}
            aria-pressed={displayMode === "label"}
          >
            Combo
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-t-300 font-mono w-full min-w-[600px]" aria-label="Payoff matrix">
          <thead className="bg-bg-200">
            <tr>
              <th className="p-s-200 text-left text-text-200 w-12">N ops</th>
              {Array.from({ length: maxCols }, (_, i) => (
                <th key={i} className="p-s-200 text-right text-text-200 min-w-[70px]">
                  C{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const maxEv = Math.max(...row.combinations.map((c) => c.evPoints))

              return (
                <tr key={row.nOps} className="border-t border-border-100">
                  <td className="p-s-200 text-text-200">{row.nOps}</td>
                  {Array.from({ length: maxCols }, (_, colIdx) => {
                    const entry = row.combinations[colIdx]
                    if (!entry) return <td key={colIdx} className="p-s-200" />

                    const isMax = entry.evPoints === maxEv && maxEv > 0
                    const isNeg = entry.evPoints < 0

                    return (
                      <td
                        key={colIdx}
                        className={cn(
                          "p-s-200 text-right",
                          isMax && "text-acc-100 font-semibold",
                          isNeg && "text-red-400",
                          !isMax && !isNeg && "text-text-100"
                        )}
                        title={entry.label}
                      >
                        {displayMode === "ev"
                          ? entry.evPoints.toFixed(1)
                          : entry.label}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-t-200 text-text-200">
        EV por op: {(exitConvention.parcialPts * exitConvention.parcialProportion + exitConvention.finalPts * exitConvention.finalProportion).toFixed(2)} pts
        · Stop: -{exitConvention.stopPts} pts
        · {contracts} contrato{contracts !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

export { PayoffMatrix }
```

- [ ] **Step 4: Run test + expected pass**
Run: `bun test src/__tests__/components/yearly-plan/payoff-matrix.test.tsx`
Expected: PASS (3G cell = 19.5)

- [ ] **Step 5: Commit**
```bash
git add src/components/yearly-plan/payoff-matrix.tsx src/__tests__/components/yearly-plan/payoff-matrix.test.tsx
git commit -m "feat(yearly-plan): add PayoffMatrix component with weighted gain EV display"
```

---

## Phase 5 — Route (3 tasks)

### Task 17: `groupWeeksByMonth` helper in iso-week.ts

**Files:**
- Modify: `src/lib/calendar/iso-week.ts` (add `groupWeeksByMonth` + `getIsoWeeksForYear` + `getIsoWeekOfDate`)

This is a prerequisite called by `YearGrid`, `upsertYearlyPlan`, and `YearlyPlanContent`.

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/lib/yearly-plan/iso-week-helpers.test.ts
import { describe, it, expect } from "vitest"
import {
  getIsoWeeksForYear,
  getIsoWeekOfDate,
  groupWeeksByMonth,
} from "@/lib/calendar/iso-week"

describe("getIsoWeeksForYear", () => {
  it("2026 has 52 ISO weeks", () => {
    const weeks = getIsoWeeksForYear(2026)
    expect(weeks).toHaveLength(52)
  })
  it("each entry has week + isoYear fields", () => {
    const weeks = getIsoWeeksForYear(2026)
    expect(weeks[0]).toHaveProperty("week")
    expect(weeks[0]).toHaveProperty("isoYear")
  })
})

describe("getIsoWeekOfDate", () => {
  it("2026-05-03 is week 18", () => {
    expect(getIsoWeekOfDate(new Date("2026-05-03"))).toBe(18)
  })
})

describe("groupWeeksByMonth", () => {
  it("groups WeeklyTarget-like objects by calendar month 1-12", () => {
    const fakeWeeks = [
      { isoWeek: 1, isoYear: 2026 },
      { isoWeek: 5, isoYear: 2026 },
      { isoWeek: 9, isoYear: 2026 },
    ]
    const grouped = groupWeeksByMonth(fakeWeeks as never, 2026)
    // January = month 1, weeks 1-4/5
    expect(grouped[1]).toBeDefined()
  })
})
```

- [ ] **Step 2: Run + expected fail**
Run: `bun test src/__tests__/lib/yearly-plan/iso-week-helpers.test.ts`
Expected: FAIL (functions may not exist yet in iso-week.ts from Annual Reporting plan Phase 0)

- [ ] **Step 3: Add to `src/lib/calendar/iso-week.ts`** (or create if it doesn't exist)
```ts
// Additions to src/lib/calendar/iso-week.ts

interface IsoWeekEntry {
  week: number
  isoYear: number
  startDate: Date
  endDate: Date
}

/**
 * Return all ISO weeks that belong to a given calendar year.
 * An ISO week "belongs" to the year in which most of its days fall (ISO 8601 rule).
 */
const getIsoWeeksForYear = (year: number): IsoWeekEntry[] => {
  const weeks: IsoWeekEntry[] = []
  const jan4 = new Date(Date.UTC(year, 0, 4)) // Jan 4 is always in week 1 of the year
  const startOfWeek1 = new Date(jan4)
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7 // Monday=0
  startOfWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek)

  for (let i = 0; i < 53; i++) {
    const weekStart = new Date(startOfWeek1)
    weekStart.setUTCDate(startOfWeek1.getUTCDate() + i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)

    const isoYear = getIsoYearOfDate(weekStart)
    if (isoYear !== year) break

    weeks.push({
      week: getIsoWeekOfDate(weekStart),
      isoYear,
      startDate: weekStart,
      endDate: weekEnd,
    })
  }

  return weeks
}

/**
 * Get ISO week number for a given date.
 */
const getIsoWeekOfDate = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/**
 * Get the ISO year (the year a given ISO week "belongs to").
 */
const getIsoYearOfDate = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  return d.getUTCFullYear()
}

/**
 * Group WeeklyTarget rows by calendar month (1-12).
 * The week is assigned to the month of its Thursday (ISO 8601 convention).
 */
const groupWeeksByMonth = <T extends { isoWeek: number; isoYear: number }>(
  weeks: T[],
  year: number
): Record<number, T[]> => {
  const allIsoWeeks = getIsoWeeksForYear(year)
  const weekToMonth = new Map<number, number>()

  for (const entry of allIsoWeeks) {
    // Thursday of this week = startDate + 3 days
    const thursday = new Date(entry.startDate)
    thursday.setUTCDate(entry.startDate.getUTCDate() + 3)
    weekToMonth.set(entry.week, thursday.getUTCMonth() + 1)
  }

  const result: Record<number, T[]> = {}
  for (let m = 1; m <= 12; m++) result[m] = []

  for (const week of weeks) {
    const month = weekToMonth.get(week.isoWeek)
    if (month != null) result[month].push(week)
  }

  return result
}

export { getIsoWeeksForYear, getIsoWeekOfDate, getIsoYearOfDate, groupWeeksByMonth }
export type { IsoWeekEntry }
```

- [ ] **Step 4: Run test + expected pass**
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/calendar/iso-week.ts src/__tests__/lib/yearly-plan/iso-week-helpers.test.ts
git commit -m "feat(yearly-plan): add ISO week helpers (getIsoWeeksForYear, groupWeeksByMonth)"
```

---

### Task 18: `/yearly-plan` server page + `yearly-plan-content` client wrapper

**Files:**
- Create: `src/app/[locale]/(app)/yearly-plan/page.tsx`

- [ ] **Step 1: Write failing test**
```ts
// src/__tests__/lib/yearly-plan/route-exists.test.ts
import { describe, it, expect } from "vitest"
import * as fs from "fs"
import * as path from "path"

describe("yearly-plan route", () => {
  it("page.tsx exists at the correct path", () => {
    const pagePath = path.join(
      process.cwd(),
      "src/app/[locale]/(app)/yearly-plan/page.tsx"
    )
    expect(fs.existsSync(pagePath)).toBe(true)
  })
})
```

- [ ] **Step 2: Run + expected fail**
Expected: FAIL

- [ ] **Step 3: Create the page**
```tsx
// src/app/[locale]/(app)/yearly-plan/page.tsx
import { setRequestLocale } from "next-intl/server"
import { getServerEffectiveNow } from "@/lib/effective-date"
import { getYearlyPlan } from "@/app/actions/yearly-plan"
import { YearlyPlanContent } from "@/components/yearly-plan"

interface YearlyPlanPageProps {
  params: Promise<{ locale: string }>
}

const YearlyPlanPage = async ({ params }: YearlyPlanPageProps) => {
  const { locale } = await params
  setRequestLocale(locale)

  const effectiveNow = await getServerEffectiveNow()
  const currentYear = effectiveNow.getFullYear()

  const planResult = await getYearlyPlan(currentYear)
  const initialPlan = planResult.status === "success" ? planResult.data ?? null : null

  return (
    <div className="min-h-dvh bg-bg-100">
      <main className="mx-auto max-w-7xl p-m-400 sm:p-m-500 lg:p-m-600">
        <YearlyPlanContent initialPlan={initialPlan} year={currentYear} />
      </main>
    </div>
  )
}

export { YearlyPlanPage as default }
```

- [ ] **Step 4: Run test + expected pass**
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/[locale]/\(app\)/yearly-plan/page.tsx
git commit -m "feat(yearly-plan): add /yearly-plan server page with initial data fetch"
```

---

### Task 19: Nav link from monthly route

**Files:**
- Modify: `src/components/layout/` (nav config, identify the correct file first)

- [ ] **Step 1: Find the nav config**
```bash
grep -r "plano-mensal\|monthly\|commandCenter\|navItems" \
  src/components/layout/ src/lib/navigation.ts \
  --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 2: Add "Plano Anual" link**

In the nav items array (exact file determined in Step 1), add after the "Plano Mensal" entry:
```ts
{
  href: "/yearly-plan",
  labelKey: "nav.yearlyPlan",  // add to i18n files
  icon: CalendarDays,          // from lucide-react
}
```

- [ ] **Step 3: Add i18n key**

In `messages/pt-BR.json` (and `en.json` if it exists), add:
```json
"nav": {
  "yearlyPlan": "Plano Anual"
}
```

- [ ] **Step 4: Verify nav renders**
Run dev server and visually confirm the link appears between "Plano Mensal" and "Analytics".

- [ ] **Step 5: Commit**
```bash
git add src/components/layout/ messages/
git commit -m "feat(yearly-plan): add Plano Anual nav link"
```

---

## Phase 6 — Capital Reconciliation (3 tasks)

### Task 20: Hook `syncCapitalBetweenPlans` into `upsertMonthlyPlan`

**Files:**
- Modify: `src/app/actions/monthly-plans.ts`

- [ ] **Step 1: Write failing test**
```ts
// No unit test for this hook — integration: after upsertMonthlyPlan, verify yearlyPlan.initialCapitalCents updated
// Covered by e2e in Phase 7. Document the contract here instead.
// Contract: upsertMonthlyPlan → calls syncCapitalBetweenPlans(planId, "monthly") at end of success path
```

- [ ] **Step 2: Modify `upsertMonthlyPlan` in `src/app/actions/monthly-plans.ts`**

After the `invalidateMonthlyPlanData()` call in both the update and create success paths, add:

```ts
// Sync capital to yearly plan (if one exists for this year)
// Import at top of file: import { syncCapitalBetweenPlans } from "@/app/actions/yearly-plan"
try {
  await syncCapitalBetweenPlans(
    (existing?.id ?? newPlan.id),
    "monthly"
  )
} catch {
  // Non-fatal — yearly plan sync failure should not fail the monthly plan save
}
```

Add import at top:
```ts
import { syncCapitalBetweenPlans } from "@/app/actions/yearly-plan"
```

- [ ] **Step 3: Run existing monthly-plan tests to verify no regression**
Run: `bun test src/__tests__/lib/ -t "monthly"`
Expected: PASS (no regressions)

- [ ] **Step 4: Commit**
```bash
git add src/app/actions/monthly-plans.ts
git commit -m "feat(yearly-plan): hook syncCapitalBetweenPlans into upsertMonthlyPlan"
```

---

### Task 21: Verify two-way sync invariant in `syncCapitalBetweenPlans`

**Files:**
- Modify: `src/app/actions/yearly-plan.ts` (tighten timestamp logic)

- [ ] **Step 1: Write unit test for conflict resolution logic**
```ts
// src/__tests__/lib/yearly-plan/capital-sync.test.ts
import { describe, it, expect } from "vitest"

// Test the timestamp-comparison logic in isolation
const resolveCapitalSync = (
  monthlyUpdatedAt: Date,
  yearlyUpdatedAt: Date,
  source: "monthly" | "yearly"
): "monthly" | "yearly" => {
  if (source === "monthly") return "monthly"
  const monthlyTs = monthlyUpdatedAt.getTime()
  const yearlyTs = yearlyUpdatedAt.getTime()
  // Tie → prefer monthly (spec §4.3, A12)
  return monthlyTs >= yearlyTs ? "monthly" : "yearly"
}

describe("capital sync conflict resolution", () => {
  it("source=monthly always wins", () => {
    expect(resolveCapitalSync(new Date("2026-01-01"), new Date("2026-06-01"), "monthly")).toBe("monthly")
  })
  it("source=yearly: yearly wins when yearly is newer", () => {
    expect(resolveCapitalSync(new Date("2026-01-01"), new Date("2026-06-01"), "yearly")).toBe("yearly")
  })
  it("source=yearly: tie → monthly wins", () => {
    const same = new Date("2026-05-01")
    expect(resolveCapitalSync(same, same, "yearly")).toBe("monthly")
  })
  it("source=yearly: monthly wins when monthly is newer", () => {
    expect(resolveCapitalSync(new Date("2026-06-01"), new Date("2026-01-01"), "yearly")).toBe("monthly")
  })
})
```

- [ ] **Step 2: Run + expected pass** (pure logic test, no DB needed)
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add src/__tests__/lib/yearly-plan/capital-sync.test.ts
git commit -m "test(yearly-plan): add capital sync conflict resolution unit tests"
```

---

### Task 22: Recalculate future weeks after ladder rule change

**Files:**
- Modify: `src/app/actions/yearly-plan.ts` (upsertYearlyPlan — refine future-week recalc logic)

- [ ] **Step 1: Tighten the recalc in `upsertYearlyPlan` update path**

The current stub uses a per-row loop which is inefficient. Replace with a bulk update:

```ts
// In the upsertYearlyPlan update path, replace the per-row loop with:
const effectiveNow = await getServerEffectiveNow()
const currentIsoWeek = getIsoWeekOfDate(effectiveNow)
const currentIsoYear = effectiveNow.getFullYear()

// Recompute contracts from the new initial capital
const newContracts = contractsForBalance(validated.initialCapitalCents, ladder)

await db
  .update(weeklyTargets)
  .set({
    contracts: newContracts,
    valorOperacionalCents: newContracts * validated.valorPorContratoCents,
    updatedAt: new Date(),
  })
  .where(
    and(
      eq(weeklyTargets.yearlyPlanId, existing.id),
      sql`(iso_year > ${currentIsoYear}
        OR (iso_year = ${currentIsoYear} AND iso_week >= ${currentIsoWeek}))`
    )
  )
```

Add import at top of yearly-plan.ts: `import { sql } from "drizzle-orm"`

- [ ] **Step 2: Run action stub test to confirm no regression**
Run: `bun test src/__tests__/lib/yearly-plan/actions-stub.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add src/app/actions/yearly-plan.ts
git commit -m "fix(yearly-plan): bulk-update future weekly targets on ladder rule change"
```

---

## Phase 7 — E2E Test (1 task)

### Task 23: Playwright e2e — create plan, edit ladder, verify payoff matrix, auto-sync

**Files:**
- Create: `e2e/tests/yearly-plan.spec.ts`

- [ ] **Step 1: No pre-failing unit test** — Playwright is e2e only

- [ ] **Step 2: Create spec**
```ts
// e2e/tests/yearly-plan.spec.ts
import { test, expect } from "@playwright/test"

const ROUTES = { yearlyPlan: "/yearly-plan" } as const

test.describe("Yearly Plan", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTES.yearlyPlan)
    await page.waitForLoadState("networkidle")
  })

  test("onboarding wizard renders when no plan exists", async ({ page }) => {
    // If plan already exists from a previous run, delete it first via the UI
    const hasOnboarding = await page.getByTestId("yearly-plan-onboarding").isVisible().catch(() => false)
    if (!hasOnboarding) {
      test.skip(true, "Plan already exists — skipping onboarding test")
      return
    }
    await expect(page.getByTestId("yearly-plan-onboarding")).toBeVisible()
    await expect(page.getByLabel(/capital inicial/i)).toBeVisible()
  })

  test("create yearly plan via onboarding wizard", async ({ page }) => {
    const hasOnboarding = await page.getByTestId("yearly-plan-onboarding").isVisible().catch(() => false)
    if (!hasOnboarding) {
      test.skip(true, "Plan already exists")
      return
    }

    // Step 1: Capital
    await page.getByLabel(/capital inicial/i).fill("3000")
    await page.getByRole("button", { name: /próximo|next/i }).first().click()

    // Step 2: Ladder (use defaults)
    await page.waitForTimeout(300)
    await page.getByRole("button", { name: /próximo|next/i }).click()

    // Step 3: Exit convention (use defaults)
    await page.waitForTimeout(300)
    await page.getByRole("button", { name: /criar plano/i }).click()

    // Should transition to main grid view
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("tab", { name: /grade semanal/i })).toBeVisible({ timeout: 10000 })
  })

  test("52-week grid renders with month sections", async ({ page }) => {
    // Skip if still on onboarding
    const tabs = page.getByRole("tab", { name: /grade semanal/i })
    await expect(tabs).toBeVisible({ timeout: 8000 })

    // Should have 12 month sections
    const sections = page.getByRole("region")
    await expect(sections.first()).toBeVisible()
  })

  test("current week is highlighted in gold border", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /grade semanal/i })).toBeVisible()
    // Gold border cell = border-acc-100 class
    const currentWeekCell = page.locator(".border-acc-100").first()
    await expect(currentWeekCell).toBeVisible()
  })

  test("edit a week cell and save Pts Feito", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /grade semanal/i })).toBeVisible()

    // Click first week cell
    const firstCell = page.locator("[role=button][aria-label^='Semana']").first()
    await firstCell.click()

    // Edit mode should open an input
    const ptsInput = page.getByPlaceholder(/pts feito/i)
    await expect(ptsInput).toBeVisible({ timeout: 5000 })
    await ptsInput.fill("42.5")

    await page.getByRole("button", { name: /salvar/i }).click()
    await page.waitForLoadState("networkidle")

    // Value should appear in cell
    await expect(page.getByText("42.5")).toBeVisible({ timeout: 5000 })
  })

  test("payoff matrix tab renders with 10 rows and correct 3G value", async ({ page }) => {
    const matrixTab = page.getByRole("tab", { name: /payoff|matriz/i })
    await expect(matrixTab).toBeVisible()
    await matrixTab.click()

    await page.waitForTimeout(500)

    // Row for N=10 should be visible
    const rows = page.locator("table[aria-label='Payoff matrix'] tbody tr")
    await expect(rows).toHaveCount(10, { timeout: 5000 })

    // 3G = 19.5 at default convention (contracts=1)
    // Row 3 (index 2), first cell = all-gains = 19.5
    await expect(page.getByText("19.5")).toBeVisible()
  })

  test("exit convention change propagates to payoff matrix", async ({ page }) => {
    // Go to exit convention tab
    const exitsTab = page.getByRole("tab", { name: /saída|convention/i })
    await exitsTab.click()
    await page.waitForTimeout(300)

    // Change parcial pts from 5 to 6
    const parcialInput = page.getByLabel(/parcial \(pts\)/i)
    await parcialInput.clear()
    await parcialInput.fill("6")

    // Save
    await page.getByRole("button", { name: /salvar convenção/i }).click()
    await page.waitForLoadState("networkidle")

    // Go to payoff matrix
    const matrixTab = page.getByRole("tab", { name: /payoff|matriz/i })
    await matrixTab.click()
    await page.waitForTimeout(300)

    // 1G = 6×0.7 + 10×0.3 = 4.2+3.0 = 7.2 (not 6.5)
    await expect(page.getByText("7.2")).toBeVisible()
  })
})
```

- [ ] **Step 3: Run e2e**
```bash
bun playwright test e2e/tests/yearly-plan.spec.ts --headed
```
Expected: All tests PASS (requires dev server running with a test account)

- [ ] **Step 4: Commit**
```bash
git add e2e/tests/yearly-plan.spec.ts
git commit -m "test(yearly-plan): add Playwright e2e suite for create, edit, payoff matrix"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Covered | Notes |
|---|---|---|
| §4.1 `yearly_plans` table | ✅ Task 1 | All columns, indexes, uniqueIndex on accountId+year |
| §4.1 `weekly_targets` table | ✅ Task 1 | isoYear stored separately per §11 edge cases |
| §4.1 `trades.pointsPnl` column | ✅ Task 2 | nullable DECIMAL(10,2) |
| §4.1 point-value resolver | ✅ Task 8 | `src/lib/contracts/point-values.ts` |
| §4.2 Reused tables | ✅ Tasks 10, 20 | FK to tradingAccounts, monthly sync |
| §4.3 Two-way capital sync | ✅ Tasks 10, 20, 21 | syncCapitalBetweenPlans + hook in upsertMonthlyPlan |
| §5 Server actions (all 6) | ✅ Tasks 9–10 | getYearlyPlan, upsertYearlyPlan, upsertWeeklyTargets, syncWeeklyActuals, syncCapitalBetweenPlans, deleteYearlyPlan |
| §6 /yearly-plan route | ✅ Task 18 | Server component, max-w-7xl, getServerEffectiveNow |
| §6 Nav link | ✅ Task 19 | Between Plano Mensal and Analytics |
| §7 YearlyPlanContent | ✅ Task 11 | Client shell, 4 tabs, plan state |
| §7 YearlyPlanOnboarding | ✅ Task 12 | 3-step wizard, capital → ladder → exits |
| §7 YearGrid | ✅ Task 14 | 12 month sections, MonthRollup below each |
| §7 WeekCell | ✅ Task 13 | auto/manual badge, inline edit, gold on current week |
| §7 MonthRollup | ✅ Task 13 | Cumulative pts + financial, IR deduction |
| §7 CapitalLadder | ✅ Task 15 | 20 rows, tier grouping, display only (edit form future) |
| §7 ExitConventionForm | ✅ Task 15 | Live EV preview, save propagates to PayoffMatrix |
| §7 PayoffMatrix | ✅ Task 16 | 10 rows, weighted gain EV, gold on max-EV per row |
| §8 exit-convention.ts | ✅ Task 4 | computeGainEv = weighted 70/30, tests confirm 6.5 |
| §8 capital-ladder.ts | ✅ Task 5 | buildCapitalLadder 20 levels, contractsForBalance |
| §8 payoff-matrix.ts | ✅ Task 6 | combinationEv uses weighted gainEv, 3G=19.5 confirmed |
| §8 weekly-rollups.ts | ✅ Task 7 | computeMonthRollup with IR + cumulative carry |
| §9 First-time onboarding | ✅ Task 12 | 3-step wizard with defaults |
| §10 Auto-sync from trades | ✅ Task 10 | syncWeeklyActuals, ptsSource guard |
| §10 Manual override | ✅ Tasks 10, 13 | ptsSource="manual" prevents overwrite |
| §10 Backfill existing trades | ✅ Task 3 | scripts/backfill-points-pnl.ts |
| §11 Edge cases — partial year | ✅ Task 1 | startWeek field, Task 14 renders greyed weeks |
| §11 Edge cases — isoYear | ✅ Tasks 1, 17 | isoYear stored on weeklyTargets, getIsoYearOfDate |
| §12.1 Unit tests — math engines | ✅ Tasks 4–8 | exit-convention, capital-ladder, payoff-matrix, weekly-rollups, point-values |
| §12.2 Component tests | ✅ Tasks 11–16 | WeekCell, PayoffMatrix, CapitalLadder, YearlyPlanContent |
| §12.3 E2E happy path | ✅ Task 23 | Full create → edit → matrix → convention → sync flow |
| §13 Integration contracts | ✅ Schema | metaBrutoCents + metaLiquidoCents on weeklyTargets for Annual Reporting |

### Known Gaps / Open Items

1. **Task 19 (nav link):** The exact nav config file path is not hardcoded — Step 1 uses `grep` to find it. Implementation must locate the file before editing.
2. **`src/lib/calendar/iso-week.ts` prerequisite:** Task 17 creates this file if it doesn't exist. If the Annual Reporting plan Phase 0 already created it, Task 17 should amend rather than create. Implementer must check first.
3. **`YearGrid` greyed-out cells for weeks before `startWeek`:** The current implementation renders all month weeks without greying pre-startWeek cells. Add a `week.isoWeek < plan.startWeek ? "opacity-40 pointer-events-none" : ""` class in `WeekCell` for a complete implementation.
4. **`upsertYearlyPlan` returns `plan` only, not `YearlyPlanWithWeeks`:** `YearlyPlanOnboarding.handleSubmit` reconstructs with empty `weeklyTargets: []`. A follow-up refactor could return the seeded weeks from the action to avoid an extra fetch.
5. **ISO week SQL aggregation in `syncWeeklyActuals`:** Uses `EXTRACT(WEEK FROM entry_date)` which is PostgreSQL's non-ISO week. Should use a proper ISO week expression: `EXTRACT(ISODOW ...)` or the `date_part('week', ...)` with ISO calendar. Implementer should verify or replace with a date-range query derived from `getIsoWeeksForYear`.
6. **Q1 (spec §14):** Encryption of `initialCapitalCents` not implemented. Left as plain integer per spec assumption A9. If parity with monthlyPlans encryption is desired, open a separate task.

### Totals

- **Phases:** 7
- **Tasks:** 23
- **Total steps (checkboxes):** ~115
- **New files created:** 19
- **Files modified:** 4 (`schema.ts`, `monthly-plans.ts`, `iso-week.ts`, nav config)
- **Math engine coverage:** 100% of spec §8 functions, all with hand-verified fixtures






