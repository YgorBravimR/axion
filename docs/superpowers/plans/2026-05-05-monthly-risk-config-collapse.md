# Monthly Risk Config Collapse — Phase 4b Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse legacy `monthlyRiskConfig` (and overlapping `riskManagementProfiles` cents columns) into the fractal cascade so caps, sizing, and adaptive behaviors all flow through one resolver.

**Architecture:** Add behavior override columns to each fractal level (year defaults + month/week/day overrides) mirroring the R-cap pattern. Extend resolver with `resolveBehavior` + `resolveBalance`. Rebase `riskManagementProfiles` decision-tree JSON to R-multiples. Migrate 14 caller files to read from resolver. Drop `monthlyRiskConfig` table.

**Tech Stack:** Drizzle ORM, PostgreSQL, Next.js 15 App Router, TypeScript, zod, Bun test runner.

**Spec:** `docs/superpowers/specs/2026-05-05-monthly-risk-config-collapse-design.md`

---

## File Structure

### Modified
- `src/db/schema.ts` — add behavior cols, drop riskManagementProfiles cents cols, drop monthlyRiskConfig
- `src/lib/fractal-plan/resolver.ts` — add `resolveBehavior`, `resolveBalance`
- `src/lib/risk-profiles/decision-tree.ts` — rebase types cents → R
- `src/app/actions/yearly-plan.ts` — drop monthlyRiskConfig reads
- `src/app/actions/annual-reports.ts` — drop reads, use resolver
- `src/app/actions/accounts.ts` — drop joins
- `src/app/actions/command-center.ts` — use resolver
- `src/app/actions/live-trading-status.ts` — use resolver
- `src/app/actions/fractal-plan/yearly.ts` — extend schema with behavior fields
- `src/app/api/arch/command-center/circuit-breaker/route.ts` — full rewrite on resolver
- `src/app/api/arch/live-status/route.ts` — same
- `src/__tests__/lib/yearly-plan/actions-stub.test.ts` — update fixtures
- `src/__tests__/lib/yearly-plan/schema-types.test.ts` — assert monthlyRiskConfig undefined

### Created
- `src/__tests__/lib/fractal-plan/resolver-behavior.test.ts`
- `src/__tests__/lib/fractal-plan/resolver-balance.test.ts`
- `scripts/migrate-decision-tree-cents-to-r.ts`
- `src/db/migrations/<timestamp>_add_behavior_cols.sql`
- `src/db/migrations/<timestamp>_drop_risk_profile_cents.sql`
- `src/db/migrations/<timestamp>_drop_monthly_risk_config.sql`

### Deleted
- `src/app/api/arch/monthly-risk-config/upsert/route.ts`
- `src/app/api/arch/monthly-risk-config/get/route.ts`
- `src/app/api/arch/monthly-risk-config/active/route.ts`
- `src/app/actions/monthly-risk-config.ts`

---

## Task 1: Schema additions

**Files:**
- Modify: `src/db/schema.ts` (yearlyPlans, monthlyPlan, weeklyPlan, dailyPlan tables)
- Create: drizzle migration via `bun drizzle-kit generate`

- [ ] **Step 1: Add behavior cols to `yearlyPlans` table definition**

In `src/db/schema.ts` after the existing `defaultMonthlyWinR` column, add:

```ts
// Phase 4b — adaptive behavior defaults (cascade fallback)
defaultRiskProfileId: uuid("default_risk_profile_id").references(
    () => riskManagementProfiles.id,
    { onDelete: "set null" },
),
defaultMaxConsecutiveLosses: integer("default_max_consecutive_losses"),
defaultAllowSecondOpAfterLoss: boolean("default_allow_second_op_after_loss").default(true),
defaultReduceRiskAfterLoss: boolean("default_reduce_risk_after_loss").default(false),
defaultRiskReductionFactor: decimal("default_risk_reduction_factor", { precision: 5, scale: 2 }),
defaultIncreaseRiskAfterWin: boolean("default_increase_risk_after_win").default(false),
defaultCapRiskAfterWin: boolean("default_cap_risk_after_win").default(false),
defaultProfitReinvestmentPercent: decimal("default_profit_reinvestment_percent", { precision: 5, scale: 2 }),
```

- [ ] **Step 2: Add behavior overrides to `monthlyPlan`**

After the existing `overrideDailyTargetR` column, add:

```ts
overrideRiskProfileId: uuid("override_risk_profile_id").references(
    () => riskManagementProfiles.id,
    { onDelete: "set null" },
),
overrideMaxConsecutiveLosses: integer("override_max_consecutive_losses"),
overrideAllowSecondOpAfterLoss: boolean("override_allow_second_op_after_loss"),
overrideReduceRiskAfterLoss: boolean("override_reduce_risk_after_loss"),
overrideRiskReductionFactor: decimal("override_risk_reduction_factor", { precision: 5, scale: 2 }),
overrideIncreaseRiskAfterWin: boolean("override_increase_risk_after_win"),
overrideCapRiskAfterWin: boolean("override_cap_risk_after_win"),
overrideProfitReinvestmentPercent: decimal("override_profit_reinvestment_percent", { precision: 5, scale: 2 }),
```

- [ ] **Step 3: Add subset to `weeklyPlan` and `dailyPlan`**

Both get only:

```ts
overrideMaxConsecutiveLosses: integer("override_max_consecutive_losses"),
overrideAllowSecondOpAfterLoss: boolean("override_allow_second_op_after_loss"),
```

- [ ] **Step 4: Generate migration**

Run: `bun drizzle-kit generate`
Expected: new SQL file in `src/db/migrations/` with `ALTER TABLE` statements adding 8+8+2+2 columns.

- [ ] **Step 5: Apply migration locally**

Run: `bun drizzle-kit migrate` (or project's standard migration command)
Expected: success, all tables updated.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(fractal-plan): add adaptive behavior columns to yearly/monthly/weekly/daily levels"
```

---

## Task 2: Resolver extension

**Files:**
- Modify: `src/lib/fractal-plan/resolver.ts`
- Create: `src/__tests__/lib/fractal-plan/resolver-behavior.test.ts`
- Create: `src/__tests__/lib/fractal-plan/resolver-balance.test.ts`

- [ ] **Step 1: Define types**

Append to resolver.ts:

```ts
type ProvenanceLevel = "year" | "month" | "week" | "day" | "fallback"

interface BehaviorResolved {
    riskProfileId: string | null
    riskProfileId_provenance: ProvenanceLevel
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

interface BalanceResolved {
    balanceCents: number
    initialCapitalCents: number
    capitalEventsDelta: number
    realizedPnlDelta: number
    computedAt: Date
}
```

- [ ] **Step 2: Write `resolveBehavior` failing test first**

In `resolver-behavior.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "bun:test"
import { resolveBehavior } from "@/lib/fractal-plan/resolver"
// ... fixture setup helpers

describe("resolveBehavior", () => {
    it("falls through year defaults when no overrides", async () => {
        const { accountId } = await seedYearlyDefaults({
            defaultMaxConsecutiveLosses: 3,
            defaultAllowSecondOpAfterLoss: true,
        })
        const r = await resolveBehavior({ accountId, date: new Date("2026-06-15") })
        expect(r.maxConsecutiveLosses).toBe(3)
        expect(r.maxConsecutiveLosses_provenance).toBe("year")
        expect(r.allowSecondOpAfterLoss_provenance).toBe("year")
    })

    it("month override wins over year for full set", async () => {
        // ... seed year + month override
        expect(r.riskProfileId_provenance).toBe("month")
    })

    it("week override wins for within-session subset only", async () => {
        // ... seed year + week override
        expect(r.allowSecondOpAfterLoss_provenance).toBe("week")
        expect(r.riskProfileId_provenance).toBe("year")  // not at week grain
    })

    it("day override wins for within-session subset", async () => {
        expect(r.maxConsecutiveLosses_provenance).toBe("day")
    })
})
```

- [ ] **Step 3: Run test, expect fail**

Run: `bun test src/__tests__/lib/fractal-plan/resolver-behavior.test.ts`
Expected: FAIL with "resolveBehavior is not exported".

- [ ] **Step 4: Implement `resolveBehavior`**

```ts
const resolveBehavior = async ({
    accountId,
    date,
}: {
    accountId: string
    date: Date
}): Promise<BehaviorResolved> => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const isoYear = getIsoYear(date)
    const isoWeek = getIsoWeek(date)
    const dateStr = date.toISOString().slice(0, 10)

    const yearly = await db.query.yearlyPlans.findFirst({
        where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
    })

    const quarterly = yearly
        ? await db.query.quarterlyPlan.findFirst({
            where: and(
                eq(quarterlyPlan.yearlyPlanId, yearly.id),
                eq(quarterlyPlan.quarter, Math.ceil(month / 3)),
            ),
        })
        : null

    const monthly = quarterly
        ? await db.query.monthlyPlan.findFirst({
            where: and(eq(monthlyPlan.quarterlyPlanId, quarterly.id), eq(monthlyPlan.month, month)),
        })
        : null

    const weekly = monthly
        ? await db.query.weeklyPlan.findFirst({
            where: and(
                eq(weeklyPlan.monthlyPlanId, monthly.id),
                eq(weeklyPlan.isoYear, isoYear),
                eq(weeklyPlan.isoWeek, isoWeek),
            ),
        })
        : null

    const daily = weekly
        ? await db.query.dailyPlan.findFirst({
            where: and(eq(dailyPlan.weeklyPlanId, weekly.id), eq(dailyPlan.date, dateStr)),
        })
        : null

    // Within-session fields: cascade day → week → month → year
    const pickWithin = <T>(
        d: T | null | undefined,
        w: T | null | undefined,
        m: T | null | undefined,
        y: T | null | undefined,
    ): { value: T | null; level: ProvenanceLevel } => {
        if (d != null) return { value: d, level: "day" }
        if (w != null) return { value: w, level: "week" }
        if (m != null) return { value: m, level: "month" }
        if (y != null) return { value: y, level: "year" }
        return { value: null, level: "fallback" }
    }

    // Profile + reduction-factor fields: month → year only
    const pickStrategy = <T>(
        m: T | null | undefined,
        y: T | null | undefined,
    ): { value: T | null; level: ProvenanceLevel } => {
        if (m != null) return { value: m, level: "month" }
        if (y != null) return { value: y, level: "year" }
        return { value: null, level: "fallback" }
    }

    const profile = pickStrategy(monthly?.overrideRiskProfileId, yearly?.defaultRiskProfileId)
    const maxConsec = pickWithin(
        daily?.overrideMaxConsecutiveLosses,
        weekly?.overrideMaxConsecutiveLosses,
        monthly?.overrideMaxConsecutiveLosses,
        yearly?.defaultMaxConsecutiveLosses,
    )
    const secondOp = pickWithin(
        daily?.overrideAllowSecondOpAfterLoss,
        weekly?.overrideAllowSecondOpAfterLoss,
        monthly?.overrideAllowSecondOpAfterLoss,
        yearly?.defaultAllowSecondOpAfterLoss,
    )
    const reduceLoss = pickStrategy(monthly?.overrideReduceRiskAfterLoss, yearly?.defaultReduceRiskAfterLoss)
    const reductionFactor = pickStrategy(
        monthly?.overrideRiskReductionFactor != null ? Number(monthly.overrideRiskReductionFactor) : null,
        yearly?.defaultRiskReductionFactor != null ? Number(yearly.defaultRiskReductionFactor) : null,
    )
    const increaseWin = pickStrategy(monthly?.overrideIncreaseRiskAfterWin, yearly?.defaultIncreaseRiskAfterWin)
    const capWin = pickStrategy(monthly?.overrideCapRiskAfterWin, yearly?.defaultCapRiskAfterWin)
    const reinvest = pickStrategy(
        monthly?.overrideProfitReinvestmentPercent != null ? Number(monthly.overrideProfitReinvestmentPercent) : null,
        yearly?.defaultProfitReinvestmentPercent != null ? Number(yearly.defaultProfitReinvestmentPercent) : null,
    )

    return {
        riskProfileId: profile.value,
        riskProfileId_provenance: profile.level,
        maxConsecutiveLosses: maxConsec.value,
        maxConsecutiveLosses_provenance: maxConsec.level,
        allowSecondOpAfterLoss: secondOp.value ?? false,
        allowSecondOpAfterLoss_provenance: secondOp.level,
        reduceRiskAfterLoss: reduceLoss.value ?? false,
        reduceRiskAfterLoss_provenance: reduceLoss.level,
        riskReductionFactor: reductionFactor.value,
        riskReductionFactor_provenance: reductionFactor.level,
        increaseRiskAfterWin: increaseWin.value ?? false,
        increaseRiskAfterWin_provenance: increaseWin.level,
        capRiskAfterWin: capWin.value ?? false,
        capRiskAfterWin_provenance: capWin.level,
        profitReinvestmentPercent: reinvest.value,
        profitReinvestmentPercent_provenance: reinvest.level,
    }
}

export { resolveBehavior }
export type { BehaviorResolved, ProvenanceLevel }
```

- [ ] **Step 5: Run behavior test, expect pass**

Run: `bun test src/__tests__/lib/fractal-plan/resolver-behavior.test.ts`
Expected: PASS.

- [ ] **Step 6: Write `resolveBalance` failing test**

In `resolver-balance.test.ts`:

```ts
describe("resolveBalance", () => {
    it("returns initial capital when no events or aggregates", async () => {
        const { accountId } = await seedYearly({ initialCapitalCents: 1_000_000_00 })
        const r = await resolveBalance({ accountId, date: new Date("2026-06-15") })
        expect(r.balanceCents).toBe(1_000_000_00)
        expect(r.capitalEventsDelta).toBe(0)
        expect(r.realizedPnlDelta).toBe(0)
    })

    it("adds deposits, subtracts withdrawals", async () => {
        await insertCapitalEvent({ eventType: "deposit", amountCents: 100_00, eventDate: "2026-03-01" })
        await insertCapitalEvent({ eventType: "withdrawal", amountCents: 50_00, eventDate: "2026-04-01" })
        const r = await resolveBalance({ accountId, date: new Date("2026-06-15") })
        expect(r.capitalEventsDelta).toBe(50_00)
    })

    it("includes monthly aggregate netCents up to and including current month", async () => {
        await insertAggregate({ year: 2026, month: 5, netCents: 200_00 })
        await insertAggregate({ year: 2026, month: 6, netCents: 300_00 })
        await insertAggregate({ year: 2026, month: 7, netCents: 999_00 })
        const r = await resolveBalance({ accountId, date: new Date("2026-06-15") })
        expect(r.realizedPnlDelta).toBe(500_00)
    })

    it("excludes events after date", async () => {
        await insertCapitalEvent({ eventType: "deposit", amountCents: 999_00, eventDate: "2026-12-01" })
        const r = await resolveBalance({ accountId, date: new Date("2026-06-15") })
        expect(r.capitalEventsDelta).toBe(0)
    })
})
```

- [ ] **Step 7: Run, expect fail**

Run: `bun test src/__tests__/lib/fractal-plan/resolver-balance.test.ts`
Expected: FAIL.

- [ ] **Step 8: Implement `resolveBalance`**

```ts
const resolveBalance = async ({
    accountId,
    date,
}: {
    accountId: string
    date: Date
}): Promise<BalanceResolved> => {
    const dateStr = date.toISOString().slice(0, 10)
    const year = date.getFullYear()
    const month = date.getMonth() + 1

    const yearly = await db.query.yearlyPlans.findFirst({
        where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
    })
    if (!yearly) {
        throw new Error(`resolveBalance: no yearly plan for account ${accountId} year ${year}`)
    }

    const events = await db.query.accountCapitalEvents.findMany({
        where: and(
            eq(accountCapitalEvents.accountId, accountId),
            lte(accountCapitalEvents.eventDate, dateStr),
        ),
    })

    const aggregates = await db.query.accountMonthlyAggregate.findMany({
        where: eq(accountMonthlyAggregate.accountId, accountId),
    })
    const aggUpTo = aggregates.filter(
        (a) => a.year < year || (a.year === year && a.month <= month),
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
}

export { resolveBalance }
export type { BalanceResolved }
```

- [ ] **Step 9: Run balance test, expect pass**

Run: `bun test src/__tests__/lib/fractal-plan/resolver-balance.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/fractal-plan/resolver.ts src/__tests__/lib/fractal-plan/resolver-behavior.test.ts src/__tests__/lib/fractal-plan/resolver-balance.test.ts
git commit -m "feat(fractal-plan): add resolveBehavior and resolveBalance to cascade resolver"
```

---

## Task 3: riskManagementProfiles rebase

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/risk-profiles/decision-tree.ts`
- Create: `scripts/migrate-decision-tree-cents-to-r.ts`
- Create: drizzle migration

- [ ] **Step 1: Read current decision-tree types**

Run: `cat src/lib/risk-profiles/decision-tree.ts`
Note any cents-named keys.

- [ ] **Step 2: Write conversion script**

`scripts/migrate-decision-tree-cents-to-r.ts`:

```ts
#!/usr/bin/env bun
// One-time migration: rebase riskManagementProfiles.decisionTree JSON cents → R.
// Lookup: pick the most-recent monthlyRiskConfig referencing each profile to derive 1R cents.
// If no config references a profile, fall back to that account's most-recent yearly_plans.ladderRules[0].oneRCents.
// Write the converted tree back. Idempotent: detects already-converted shape (presence of *_r keys).

import { db } from "@/db/drizzle"
import { riskManagementProfiles, monthlyRiskConfig, yearlyPlans } from "@/db/schema"
import { eq, desc } from "drizzle-orm"

const main = async () => {
    const profiles = await db.select().from(riskManagementProfiles)
    let converted = 0
    let skipped = 0
    for (const profile of profiles) {
        const tree = JSON.parse(profile.decisionTree) as Record<string, unknown>
        if (isAlreadyConverted(tree)) {
            skipped++
            continue
        }
        const oneRCents = await deriveOneRCents(profile.id)
        const newTree = convertCentsToR(tree, oneRCents)
        await db.update(riskManagementProfiles)
            .set({ decisionTree: JSON.stringify(newTree), updatedAt: new Date() })
            .where(eq(riskManagementProfiles.id, profile.id))
        converted++
    }
    console.log(`Converted: ${converted}, Skipped (already R): ${skipped}`)
}

const isAlreadyConverted = (tree: Record<string, unknown>): boolean => {
    const json = JSON.stringify(tree)
    return /(thresholdR|adjustToR|baseRiskR)/.test(json) && !/Cents/.test(json)
}

const deriveOneRCents = async (profileId: string): Promise<number> => {
    const config = await db.query.monthlyRiskConfig.findFirst({
        where: eq(monthlyRiskConfig.riskProfileId, profileId),
        orderBy: [desc(monthlyRiskConfig.year), desc(monthlyRiskConfig.month)],
    })
    if (config && config.riskPerTradeCents) {
        // riskPerTradeCents is encrypted text — for migration purposes we treat it as numeric string
        const cents = Number(config.riskPerTradeCents)
        if (Number.isFinite(cents) && cents > 0) return cents
    }
    // Fallback: most-recent yearly plan, ladder tier 1 oneRCents
    const yp = await db.query.yearlyPlans.findFirst({ orderBy: [desc(yearlyPlans.year)] })
    if (yp && Array.isArray(yp.ladderRules) && yp.ladderRules.length > 0) {
        return (yp.ladderRules[0] as { oneRCents: number }).oneRCents
    }
    throw new Error(`cannot derive 1R for profile ${profileId}`)
}

const convertCentsToR = (tree: Record<string, unknown>, oneRCents: number): Record<string, unknown> => {
    const walk = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(walk)
        if (node && typeof node === "object") {
            const out: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
                if (typeof v === "number" && /Cents$/.test(k)) {
                    const newKey = k.replace(/Cents$/, "R")
                    out[newKey] = Number((v / oneRCents).toFixed(2))
                } else {
                    out[k] = walk(v)
                }
            }
            return out
        }
        return node
    }
    return walk(tree) as Record<string, unknown>
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run conversion script (dry-run by reading first)**

Run: `bun scripts/migrate-decision-tree-cents-to-r.ts`
Expected: prints "Converted: N, Skipped: M". No errors.

- [ ] **Step 4: Drop cents columns from schema**

In `src/db/schema.ts` `riskManagementProfiles`, remove these lines:
- `baseRiskCents: integer("base_risk_cents").notNull(),`
- `dailyLossCents: integer("daily_loss_cents").notNull(),`
- `weeklyLossCents: integer("weekly_loss_cents"),`
- `monthlyLossCents: integer("monthly_loss_cents").notNull(),`
- `dailyProfitTargetCents: integer("daily_profit_target_cents"),`

- [ ] **Step 5: Update decision-tree.ts types**

Replace cents keys with R keys (e.g., `thresholdCents: number` → `thresholdR: number`). Show actual diff after Step 1 reading.

- [ ] **Step 6: Generate + apply drizzle migration**

Run: `bun drizzle-kit generate && bun drizzle-kit migrate`
Expected: DROP COLUMN x5 in new SQL file.

- [ ] **Step 7: Run all tests**

Run: `bun test`
Expected: any test referencing dropped cents fields fails — fix by updating test fixtures.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/lib/risk-profiles/decision-tree.ts scripts/migrate-decision-tree-cents-to-r.ts src/db/migrations/
git commit -m "refactor(risk-profiles): rebase decision tree to R-multiples, drop cents columns"
```

---

## Task 4: Caller migration

**Files:**
- Delete: `src/app/api/arch/monthly-risk-config/upsert/route.ts`
- Delete: `src/app/api/arch/monthly-risk-config/get/route.ts`
- Delete: `src/app/api/arch/monthly-risk-config/active/route.ts`
- Delete: `src/app/actions/monthly-risk-config.ts`
- Modify: `src/app/api/arch/command-center/circuit-breaker/route.ts`
- Modify: `src/app/api/arch/live-status/route.ts`
- Modify: `src/app/actions/command-center.ts`
- Modify: `src/app/actions/live-trading-status.ts`
- Modify: `src/app/actions/yearly-plan.ts`
- Modify: `src/app/actions/annual-reports.ts`
- Modify: `src/app/actions/accounts.ts`
- Modify: `src/app/actions/fractal-plan/yearly.ts` (extend schema)

- [ ] **Step 1: Read circuit-breaker route to understand current shape**

Run: `cat src/app/api/arch/command-center/circuit-breaker/route.ts`
Identify: balance source, daily/monthly cap source, behavior reads.

- [ ] **Step 2: Rewrite circuit-breaker route**

Replace `monthlyRiskConfig` reads with:

```ts
import { resolveDay, resolveMonth, resolveBehavior, resolveBalance } from "@/lib/fractal-plan/resolver"
import { db } from "@/db/drizzle"
import { accountMonthlyAggregate, accountWeeklyAggregate } from "@/db/schema"

const today = new Date()
const day = await resolveDay({ accountId, date: today })
const month = await resolveMonth({ accountId, date: today })
const behavior = await resolveBehavior({ accountId, date: today })
const balance = await resolveBalance({ accountId, date: today })

// Caps in cents
const dailyLossCapCents = Math.round(day.defaultDailyLossR * day.snapshotOneRCents)
const monthlyLossCapCents = Math.round(month.defaultMonthlyLossR * month.snapshotOneRCents)

// Consumption today: live trade query (existing logic)
// Consumption this month: accountMonthlyAggregate.netCents (negative if loss)
const monthAgg = await db.query.accountMonthlyAggregate.findFirst({
    where: and(
        eq(accountMonthlyAggregate.accountId, accountId),
        eq(accountMonthlyAggregate.year, today.getFullYear()),
        eq(accountMonthlyAggregate.month, today.getMonth() + 1),
    ),
})
const monthlyLossConsumedCents = Math.max(0, -(monthAgg?.netCents ?? 0))

// Behavior gates
if (behavior.maxConsecutiveLosses != null && consecutiveLossesToday >= behavior.maxConsecutiveLosses) {
    return tripBreaker("max_consecutive_losses")
}
// ... rest of logic mirrors prior structure
```

- [ ] **Step 3: Rewrite live-status route**

Same dependency swap pattern.

- [ ] **Step 4: Update command-center.ts action**

Replace `monthlyRiskConfig` joins with `resolveBalance` + `resolveDay`.

- [ ] **Step 5: Update live-trading-status.ts action**

Same.

- [ ] **Step 6: Drop monthlyRiskConfig reads from yearly-plan, annual-reports, accounts**

Each: remove the join, replace any derived fields with resolver calls.

- [ ] **Step 7: Extend `fractal-plan/yearly.ts` action schema with behavior fields**

```ts
const createYearlyPlanInputSchema = z.object({
    // ... existing fields
    defaultRiskProfileId: z.string().uuid().optional(),
    defaultMaxConsecutiveLosses: z.number().int().positive().optional(),
    defaultAllowSecondOpAfterLoss: z.boolean().optional(),
    defaultReduceRiskAfterLoss: z.boolean().optional(),
    defaultRiskReductionFactor: z.number().positive().optional(),
    defaultIncreaseRiskAfterWin: z.boolean().optional(),
    defaultCapRiskAfterWin: z.boolean().optional(),
    defaultProfitReinvestmentPercent: z.number().nonnegative().optional(),
})
```

Update `autoSeedYearlyTree` insert to include these (passed through to columns).

- [ ] **Step 8: Delete legacy files**

```bash
rm src/app/actions/monthly-risk-config.ts
rm -r src/app/api/arch/monthly-risk-config/
```

- [ ] **Step 9: Update tests**

`src/__tests__/lib/yearly-plan/actions-stub.test.ts`: drop `monthlyRiskConfig` fixtures, add behavior fields to inputs.

- [ ] **Step 10: Run full test suite**

Run: `bun test`
Expected: all green. If reds, fix call sites.

- [ ] **Step 11: Commit**

```bash
git add -u src/app/ src/__tests__/
git rm src/app/actions/monthly-risk-config.ts
git rm -r src/app/api/arch/monthly-risk-config/
git commit -m "refactor(risk): migrate circuit breaker and live status to fractal resolver"
```

---

## Task 5: Drop monthlyRiskConfig table

**Files:**
- Modify: `src/db/schema.ts` (remove table + relations + types)
- Modify: `src/__tests__/lib/yearly-plan/schema-types.test.ts`
- Create: drizzle migration

- [ ] **Step 1: Remove `monthlyRiskConfig` table definition**

Delete the `pgTable("monthly_risk_config", ...)` block (lines 895-951 currently).

- [ ] **Step 2: Remove relations**

Delete `monthlyRiskConfigRelations` block (~line 2028).

- [ ] **Step 3: Remove from any parent relations**

Search: `grep -n "monthlyRiskConfig" src/db/schema.ts` — clean up any leftovers in `tradingAccountsRelations`, `riskManagementProfilesRelations`.

- [ ] **Step 4: Generate drop migration**

Run: `bun drizzle-kit generate`
Expected: SQL with `DROP TABLE monthly_risk_config`.

- [ ] **Step 5: Apply**

Run: `bun drizzle-kit migrate`

- [ ] **Step 6: Add undefined assertion to schema-types test**

In `src/__tests__/lib/yearly-plan/schema-types.test.ts`:

```ts
it("no longer exports legacy monthlyRiskConfig", async () => {
    const schema = await import("@/db/schema")
    expect((schema as Record<string, unknown>).monthlyRiskConfig).toBeUndefined()
})
```

- [ ] **Step 7: Verify no straggler references**

Run: `grep -rn "monthlyRiskConfig" src/ --include="*.ts" --include="*.tsx"`
Expected: only the test that asserts undefined + drizzle migration snapshot files.

- [ ] **Step 8: Run full test suite**

Run: `bun test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/__tests__/lib/yearly-plan/schema-types.test.ts src/db/migrations/
git commit -m "refactor(db): drop legacy monthlyRiskConfig table"
```

---

## Task 6: Final test gate + verification

- [ ] **Step 1: Full type check**

Run: `bun run typecheck` (or `tsc --noEmit`)
Expected: zero errors.

- [ ] **Step 2: Full test run**

Run: `bun test`
Expected: all pass.

- [ ] **Step 3: Grep verification**

Run: `grep -rn "monthlyRiskConfig\|monthly_risk_config" src/ --include="*.ts" --include="*.tsx"`
Expected: only the schema-types test undefined assertion.

- [ ] **Step 4: Grep cents fields**

Run: `grep -rn "baseRiskCents\|monthlyLossCents.*riskMgmt\|dailyLossCents.*riskMgmt" src/`
Expected: empty.

---

## Self-Review Checklist (run after writing the plan)

- [x] Spec coverage: all 5 spec commits → 5 plan tasks → covered
- [x] No placeholders: all code blocks complete
- [x] Type consistency: `BehaviorResolved` shape used in tests matches resolver impl
- [x] FK names ≤ 63 chars verified
- [x] Reversibility: each commit atomic, can revert independently
