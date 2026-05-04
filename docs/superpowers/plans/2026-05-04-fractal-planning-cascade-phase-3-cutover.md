# Fractal Planning Cascade — Phase 3: Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the user-visible cutover for the fractal planning cascade — extend yearly schema with R-defaults, build the `/plan/[…]` UI tree, wire trade-time hooks across all three trade paths, redirect legacy routes, and turn the `FRACTAL_PLAN_DUAL_WRITE` flag ON in production.

**Architecture:** Additive-only schema bump on legacy `yearlyPlans` (cascade defaults), minimal new UI route group `(plan)/plan/[year]/[…]/page.tsx` reading the cascade resolver, redirect-only treatment for `/yearly-plan` and `/monthly` to preserve any external links, and feature-flag flip via `.env.example` documentation. No legacy data is destroyed in Phase 3 — Phase 4 owns deletions.

**Tech Stack:** Next.js 16 (proxy.ts), React 19 server components, Drizzle ORM, Zod v4, Vitest, Tailwind, lucide-react, next-intl.

**Phase 2 baseline (already merged on `feat/yearly-tax-reporting`):**
- 1073 unit tests passing on tip commit `e7286ac`
- Feature flag `FRACTAL_PLAN_DUAL_WRITE` defaults OFF
- `resolveDay`, `autoSeedYearlyTree`, `autoLinkTaxLedger`, `checkDrawdownTrigger` all live but only `captureROnEntry`/`computeROutcome` is wired into `createTrade` (single-trade path)
- Server actions exist for yearly v2, quarterly, monthly, weekly, daily upsert + reset, and `lazyEnsureDailyPlan`
- New types: `FractalMonthlyPlan`/`NewFractalMonthlyPlan`, `QuarterlyPlan`, `WeeklyPlan`, `DailyPlan`, `TierChangeLog`

**Critical operational notes:**
- `bun run test:unit` is the unit test runner (NOT `bun test`).
- `bun run db:migrate` hangs in non-TTY. Apply Phase 3 migration via `psql` directly per memory.md; document in commit message.
- Pre-existing build error (`YearTaxSummary` export from `tax-engine.ts`) is unrelated — do not fix.
- All Phase 3 code stays gated behind `isFractalPlanDualWriteEnabled()` until Task 18 flips the default.
- One conventional commit per task with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## File Structure

**Schema/migration:**
- Modify: `src/db/schema.ts` (add R-default columns to `yearlyPlans`)
- Create: `src/db/migrations/0032_<auto>.sql`

**Backfill script (one-shot, opt-in via flag):**
- Create: `src/lib/fractal-plan/backfill-trades.ts`
- Create: `src/__tests__/lib/fractal-plan/backfill-trades.test.ts`

**Trade-time hooks (CSV + scaled paths, drawdown wiring):**
- Modify: `src/app/actions/trades.ts` (add R-snapshot to `bulkCreateTrades` + `createScaledTrade`; call `checkDrawdownTrigger` after `createTrade` insert)

**Resolver expansion (resolveMonth, resolveYear):**
- Modify: `src/lib/fractal-plan/resolver.ts` (add `resolveMonth`, `resolveYear`)
- Modify: `src/__tests__/lib/fractal-plan/resolver.test.ts`

**`forceTierReeval` action:**
- Create: `src/app/actions/fractal-plan/tier.ts`
- Create: `src/__tests__/app/actions/fractal-plan/tier.test.ts`

**UI components (provenance badge, plan layout):**
- Create: `src/components/fractal-plan/provenance-badge.tsx`
- Create: `src/components/fractal-plan/plan-section.tsx`
- Create: `src/components/fractal-plan/today-strip.tsx`
- Create: `src/__tests__/components/fractal-plan/provenance-badge.test.tsx`

**Routes (server components):**
- Create: `src/app/[locale]/(app)/plan/[year]/page.tsx` (year view)
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/page.tsx` (quarter)
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/page.tsx` (month)
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/page.tsx` (week)
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/[date]/page.tsx` (day)
- Create: `src/app/[locale]/(app)/plan/layout.tsx`

**Command-center integration:**
- Modify: `src/app/[locale]/(app)/command-center/command-center-content.tsx` (today strip mount-point, gated by flag)

**Redirects:**
- Modify: `src/proxy.ts` (`/yearly-plan` → `/plan/[currentYear]`, `/monthly` → `/plan/[currentYear]/[q]/[m]`)

**Reports R-based tab:**
- Create: `src/components/reports/r-distribution-tab.tsx`
- Modify: `src/app/[locale]/(app)/reports/reports-content.tsx` (add tab) — or whatever the existing reports tab host is

**Flag flip:**
- Modify: `.env.example`
- Modify: `src/lib/flags/fractal-plan.ts` (default ON in non-test env, can still be disabled by `=0`)
- Modify: `src/__tests__/lib/flags/fractal-plan.test.ts`

---

## Task 1: Add cascade-default R columns to legacy `yearlyPlans`

**Files:**
- Modify: `src/db/schema.ts:1137-1173` (yearlyPlans table)
- Test: `src/__tests__/db/schema-yearly-plan-r-cols.test.ts` (CREATE)

These columns hold the year-level R defaults that the cascade falls back to when nothing overrides them at quarter/month/week/day. They are nullable for backwards-compat with existing rows; defaults are applied at write time by `createYearlyPlanV2`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/db/schema-yearly-plan-r-cols.test.ts
import { describe, it, expect } from "vitest"
import { getTableColumns } from "drizzle-orm"
import * as schema from "@/db/schema"

describe("yearlyPlans cascade-default R columns (Phase 3)", () => {
	const cols = getTableColumns(schema.yearlyPlans)

	it("has nullable defaultDailyLossR", () => {
		expect(cols.defaultDailyLossR).toBeDefined()
		expect(cols.defaultDailyLossR.notNull).toBe(false)
	})

	it("has nullable defaultDailyWinR", () => {
		expect(cols.defaultDailyWinR).toBeDefined()
		expect(cols.defaultDailyWinR.notNull).toBe(false)
	})

	it("has nullable defaultWeeklyLossR", () => {
		expect(cols.defaultWeeklyLossR).toBeDefined()
		expect(cols.defaultWeeklyLossR.notNull).toBe(false)
	})

	it("has nullable defaultWeeklyWinR", () => {
		expect(cols.defaultWeeklyWinR).toBeDefined()
		expect(cols.defaultWeeklyWinR.notNull).toBe(false)
	})

	it("has nullable defaultMonthlyLossR", () => {
		expect(cols.defaultMonthlyLossR).toBeDefined()
		expect(cols.defaultMonthlyLossR.notNull).toBe(false)
	})

	it("has nullable defaultMonthlyWinR", () => {
		expect(cols.defaultMonthlyWinR).toBeDefined()
		expect(cols.defaultMonthlyWinR.notNull).toBe(false)
	})

	it("has nullable targetMonthsToYearly", () => {
		expect(cols.targetMonthsToYearly).toBeDefined()
		expect(cols.targetMonthsToYearly.notNull).toBe(false)
	})

	it("has nullable targetWeeksToYearly", () => {
		expect(cols.targetWeeksToYearly).toBeDefined()
		expect(cols.targetWeeksToYearly.notNull).toBe(false)
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test:unit -- src/__tests__/db/schema-yearly-plan-r-cols.test.ts
```

Expected: FAIL — columns undefined.

- [ ] **Step 3: Add columns to schema**

Insert these columns inside the `yearlyPlans` `pgTable` definition, right above the `notes` column at `src/db/schema.ts:1164`:

```ts
		// Fractal Planning Cascade — Phase 3 defaults.
		// Year-level R targets that the cascade falls back to when no quarterly /
		// monthly / weekly / daily override is set. Stored as decimal R-multiples.
		defaultDailyLossR: decimal("default_daily_loss_r", { precision: 5, scale: 2 }),
		defaultDailyWinR: decimal("default_daily_win_r", { precision: 5, scale: 2 }),
		defaultWeeklyLossR: decimal("default_weekly_loss_r", { precision: 5, scale: 2 }),
		defaultWeeklyWinR: decimal("default_weekly_win_r", { precision: 5, scale: 2 }),
		defaultMonthlyLossR: decimal("default_monthly_loss_r", { precision: 5, scale: 2 }),
		defaultMonthlyWinR: decimal("default_monthly_win_r", { precision: 5, scale: 2 }),

		// Aggregate count targets (cascade Σ-aware projections)
		targetMonthsToYearly: integer("target_months_to_yearly"),
		targetWeeksToYearly: integer("target_weeks_to_yearly"),
```

- [ ] **Step 4: Run test to verify it passes**

```
bun run test:unit -- src/__tests__/db/schema-yearly-plan-r-cols.test.ts
```

Expected: 8 / 8 pass.

- [ ] **Step 5: Generate migration**

```
bun run db:generate
```

Expected output: a new file `src/db/migrations/0032_<random>.sql` containing only `ALTER TABLE "yearly_plans" ADD COLUMN ...` statements (8 of them). No DROP, no SET NOT NULL, no RENAME.

- [ ] **Step 6: Audit migration is purely additive**

```
grep -E "DROP|RENAME|SET NOT NULL" src/db/migrations/0032_*.sql || echo "OK: purely additive"
```

Expected: `OK: purely additive`.

- [ ] **Step 7: Apply migration to local DB via psql**

(skipping `bun run db:migrate` due to non-TTY hang)

```
psql "$DATABASE_URL" -f src/db/migrations/0032_*.sql
```

Expected: 8 `ALTER TABLE` lines, exit 0.

- [ ] **Step 8: Commit**

```
git add src/db/schema.ts src/db/migrations/ src/__tests__/db/schema-yearly-plan-r-cols.test.ts
git commit -m "$(cat <<'EOF'
feat(schema): add cascade-default R columns to yearlyPlans (Phase 3)

Eight new nullable columns: defaultDaily/Weekly/Monthly Loss/Win R
plus targetMonthsToYearly and targetWeeksToYearly. Year-level fallbacks
for the fractal cascade resolver.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Drop the optional-cast fallback in `resolveDay`

**Files:**
- Modify: `src/lib/fractal-plan/resolver.ts` (remove the `as unknown as` cast added in Phase 2 Task 5)
- Modify: `src/__tests__/lib/fractal-plan/resolver.test.ts` (test new direct-read path)

Phase 2 Task 5 read `defaultDailyLossR` etc. via `(yearly as unknown as { defaultDailyLossR?: string }).defaultDailyLossR` because the columns did not exist. Now they do — the cast is dead weight and hides type drift.

- [ ] **Step 1: Write a test that fails because the cast is wrong**

```ts
// add to src/__tests__/lib/fractal-plan/resolver.test.ts inside the resolveDay describe
it("reads defaultDailyLossR directly (no cast) when present on yearly row", async () => {
	// ... mock db to return a yearly row with defaultDailyLossR: "1.50" and no daily/week/month/quarter overrides
	const result = await resolveDay({ accountId, date: new Date("2026-01-15") })
	expect(result.dailyLossR).toBe(1.5)
	expect(result.dailyLossR_provenance).toBe("year")
})
```

(Match the existing mocking pattern; the goal is the test should compile against a typed `yearlyPlans` row, not an `unknown` cast.)

- [ ] **Step 2: Update `resolveDay` to read columns directly**

In `src/lib/fractal-plan/resolver.ts`, replace any `(yearlyRow as unknown as { defaultDailyLossR?: string }).defaultDailyLossR` with `yearlyRow.defaultDailyLossR` and similarly for the other 7 columns.

- [ ] **Step 3: Run resolver tests**

```
bun run test:unit -- src/__tests__/lib/fractal-plan/resolver.test.ts
```

Expected: ALL pass (no regressions in the existing tests, plus the new one).

- [ ] **Step 4: Commit**

```
git commit -am "$(cat <<'EOF'
refactor(fractal-plan): read year-default R columns directly in resolveDay

Phase 3 added these columns to yearlyPlans, so the Phase 2 optional-access
cast is no longer needed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `resolveMonth` in resolver

**Files:**
- Modify: `src/lib/fractal-plan/resolver.ts`
- Modify: `src/__tests__/lib/fractal-plan/resolver.test.ts`

Phase 2 deferred this. `resolveMonth` returns the cascade-resolved month-level numbers using only year → quarter → month (no week/day).

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/fractal-plan/resolver.test.ts (new describe block)
describe("resolveMonth", () => {
	it("returns month overrides when present", async () => {
		// mock: yearlyPlans returns a row with defaultMonthlyWinR: "8.00",
		// quarterlyPlan empty, monthlyPlan returns { winR: "12.50", lossR: "4.00" }
		const result = await resolveMonth({ accountId, year: 2026, month: 3 })
		expect(result.monthlyWinR).toBe(12.5)
		expect(result.monthlyWinR_provenance).toBe("month")
		expect(result.monthlyLossR).toBe(4)
		expect(result.monthlyLossR_provenance).toBe("month")
	})

	it("falls back to quarter override, then year default", async () => {
		// yearly defaultMonthlyWinR: "8.00", quarterly winR: "10.00", monthly winR null
		const result = await resolveMonth({ accountId, year: 2026, month: 3 })
		expect(result.monthlyWinR).toBe(10)
		expect(result.monthlyWinR_provenance).toBe("quarter")
	})

	it("returns null + provenance 'none' when no level has a value", async () => {
		const result = await resolveMonth({ accountId, year: 2026, month: 3 })
		expect(result.monthlyWinR).toBeNull()
		expect(result.monthlyWinR_provenance).toBe("none")
	})
})
```

- [ ] **Step 2: Run tests to verify failure**

```
bun run test:unit -- src/__tests__/lib/fractal-plan/resolver.test.ts
```

Expected: FAIL — `resolveMonth` not exported.

- [ ] **Step 3: Implement `resolveMonth`**

Append to `src/lib/fractal-plan/resolver.ts`:

```ts
import { resolveCascade } from "./cascade-merge"

interface ResolveMonthInput {
	accountId: string
	year: number
	month: number // 1-12
}

interface ResolveMonthResult {
	monthlyWinR: number | null
	monthlyWinR_provenance: "year" | "quarter" | "month" | "none"
	monthlyLossR: number | null
	monthlyLossR_provenance: "year" | "quarter" | "month" | "none"
	monthlyTargetWeeks: number | null
	monthlyTargetWeeks_provenance: "year" | "quarter" | "month" | "none"
}

const resolveMonth = async (input: ResolveMonthInput): Promise<ResolveMonthResult> => {
	const { accountId, year, month } = input
	const quarter = Math.ceil(month / 3)

	const yearlyRow = await db
		.select()
		.from(yearlyPlans)
		.where(and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)))
		.then((rs) => rs[0] ?? null)

	const quarterlyRow = yearlyRow
		? await db
				.select()
				.from(quarterlyPlan)
				.where(and(eq(quarterlyPlan.yearlyPlanId, yearlyRow.id), eq(quarterlyPlan.quarter, quarter)))
				.then((rs) => rs[0] ?? null)
		: null

	const monthlyRow = yearlyRow
		? await db
				.select()
				.from(monthlyPlan)
				.where(and(eq(monthlyPlan.yearlyPlanId, yearlyRow.id), eq(monthlyPlan.month, month)))
				.then((rs) => rs[0] ?? null)
		: null

	const winR = resolveCascade(
		[
			{ level: "year", value: yearlyRow?.defaultMonthlyWinR ?? null },
			{ level: "quarter", value: quarterlyRow?.winR ?? null },
			{ level: "month", value: monthlyRow?.winR ?? null },
		],
		(v) => (v == null ? null : Number(v))
	)

	const lossR = resolveCascade(
		[
			{ level: "year", value: yearlyRow?.defaultMonthlyLossR ?? null },
			{ level: "quarter", value: quarterlyRow?.lossR ?? null },
			{ level: "month", value: monthlyRow?.lossR ?? null },
		],
		(v) => (v == null ? null : Number(v))
	)

	const targetWeeks = resolveCascade(
		[
			{ level: "year", value: yearlyRow?.targetWeeksToYearly ?? null },
			{ level: "quarter", value: quarterlyRow?.targetWeeks ?? null },
			{ level: "month", value: monthlyRow?.targetWeeks ?? null },
		],
		(v) => (v == null ? null : Number(v))
	)

	return {
		monthlyWinR: winR.value,
		monthlyWinR_provenance: winR.provenance,
		monthlyLossR: lossR.value,
		monthlyLossR_provenance: lossR.provenance,
		monthlyTargetWeeks: targetWeeks.value,
		monthlyTargetWeeks_provenance: targetWeeks.provenance,
	}
}

export type { ResolveMonthInput, ResolveMonthResult }
export { resolveMonth }
```

- [ ] **Step 4: Run tests, verify pass**

```
bun run test:unit -- src/__tests__/lib/fractal-plan/resolver.test.ts
```

- [ ] **Step 5: Commit**

```
git commit -am "$(cat <<'EOF'
feat(fractal-plan): resolveMonth walks year→quarter→month cascade

Returns provenance-tagged win/loss R and target-weeks at month level.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement `resolveYear` in resolver

**Files:**
- Modify: `src/lib/fractal-plan/resolver.ts`
- Modify: `src/__tests__/lib/fractal-plan/resolver.test.ts`

`resolveYear` is the simplest case: only the year-level row contributes. It exists for symmetry with `resolveMonth`/`resolveDay` so callers can use a uniform shape.

- [ ] **Step 1: Failing test**

```ts
// add to resolver.test.ts
describe("resolveYear", () => {
	it("returns year-level defaults with provenance 'year'", async () => {
		// mock yearly with defaultDailyLossR: "1.50", defaultMonthlyWinR: "8.00"
		const result = await resolveYear({ accountId, year: 2026 })
		expect(result.defaultDailyLossR).toBe(1.5)
		expect(result.defaultDailyLossR_provenance).toBe("year")
		expect(result.defaultMonthlyWinR).toBe(8)
	})

	it("returns null + 'none' when no yearly row exists", async () => {
		const result = await resolveYear({ accountId, year: 2099 })
		expect(result.defaultDailyLossR).toBeNull()
		expect(result.defaultDailyLossR_provenance).toBe("none")
	})
})
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement**

Append to `src/lib/fractal-plan/resolver.ts`:

```ts
interface ResolveYearInput {
	accountId: string
	year: number
}

interface ResolveYearResult {
	defaultDailyLossR: number | null
	defaultDailyLossR_provenance: "year" | "none"
	defaultDailyWinR: number | null
	defaultDailyWinR_provenance: "year" | "none"
	defaultWeeklyLossR: number | null
	defaultWeeklyLossR_provenance: "year" | "none"
	defaultWeeklyWinR: number | null
	defaultWeeklyWinR_provenance: "year" | "none"
	defaultMonthlyLossR: number | null
	defaultMonthlyLossR_provenance: "year" | "none"
	defaultMonthlyWinR: number | null
	defaultMonthlyWinR_provenance: "year" | "none"
}

const resolveYear = async (input: ResolveYearInput): Promise<ResolveYearResult> => {
	const yearlyRow = await db
		.select()
		.from(yearlyPlans)
		.where(and(eq(yearlyPlans.accountId, input.accountId), eq(yearlyPlans.year, input.year)))
		.then((rs) => rs[0] ?? null)

	const tag = (v: string | null | undefined): { value: number | null; provenance: "year" | "none" } =>
		v == null ? { value: null, provenance: "none" } : { value: Number(v), provenance: "year" }

	const dl = tag(yearlyRow?.defaultDailyLossR)
	const dw = tag(yearlyRow?.defaultDailyWinR)
	const wl = tag(yearlyRow?.defaultWeeklyLossR)
	const ww = tag(yearlyRow?.defaultWeeklyWinR)
	const ml = tag(yearlyRow?.defaultMonthlyLossR)
	const mw = tag(yearlyRow?.defaultMonthlyWinR)

	return {
		defaultDailyLossR: dl.value,
		defaultDailyLossR_provenance: dl.provenance,
		defaultDailyWinR: dw.value,
		defaultDailyWinR_provenance: dw.provenance,
		defaultWeeklyLossR: wl.value,
		defaultWeeklyLossR_provenance: wl.provenance,
		defaultWeeklyWinR: ww.value,
		defaultWeeklyWinR_provenance: ww.provenance,
		defaultMonthlyLossR: ml.value,
		defaultMonthlyLossR_provenance: ml.provenance,
		defaultMonthlyWinR: mw.value,
		defaultMonthlyWinR_provenance: mw.provenance,
	}
}

export type { ResolveYearInput, ResolveYearResult }
export { resolveYear }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```
git commit -am "feat(fractal-plan): resolveYear returns year-level R defaults with provenance

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Wire R-snapshot into `bulkCreateTrades` (CSV path)

**Files:**
- Modify: `src/app/actions/trades.ts:~1290` (the CSV insert-values builder)
- Modify (or create): `src/__tests__/app/actions/trades-csv-r-snapshot.test.ts`

The CSV path inserts trades in batches; each row needs an `oneRSnapshotCents` field populated when the flag is ON. Because batches share the same DB call, we capture the snapshot once per batch's `(accountId, entryDate)` pair to avoid redundant resolver hits.

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/app/actions/trades-csv-r-snapshot.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// ... usual heavy mocks for "@/db/drizzle", "@/auth", flag stub ON

describe("bulkCreateTrades — fractal R-snapshot capture (Phase 3)", () => {
	beforeEach(() => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "1"
	})

	it("populates oneRSnapshotCents on each inserted row", async () => {
		// stub captureROnEntry to return 50000 (=$500)
		// stub db insert to capture the values it received
		await bulkCreateTrades([{ /* one valid CSV row with entryDate in a known plan */ }])
		expect(insertedRows[0].oneRSnapshotCents).toBe(50000)
	})

	it("leaves oneRSnapshotCents null when flag is OFF", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "0"
		await bulkCreateTrades([{ /* same row */ }])
		expect(insertedRows[0].oneRSnapshotCents).toBeNull()
	})
})
```

- [ ] **Step 2: Verify test fails (snapshot is null when flag ON)**

- [ ] **Step 3: Update `bulkCreateTrades`**

Inside `src/app/actions/trades.ts`, find the `tradeInsertValues` builder around line 1283 in the CSV loop. Add right before the encryption block:

```ts
let oneRSnapshotCentsCsv: number | null = null
if (isFractalPlanDualWriteEnabled()) {
	try {
		oneRSnapshotCentsCsv = await captureROnEntry({
			accountId,
			entryDate: tradeData.entryDate,
		})
	} catch (snapErr) {
		console.error("[fractal-plan] captureROnEntry (csv) failed silently:", snapErr)
	}
}
;(tradeInsertValues as Record<string, unknown>).oneRSnapshotCents = oneRSnapshotCentsCsv
```

- [ ] **Step 4: Run new test, verify pass**

```
bun run test:unit -- src/__tests__/app/actions/trades-csv-r-snapshot.test.ts
```

- [ ] **Step 5: Run full trades test suite, verify no regressions**

```
bun run test:unit -- src/__tests__/app/actions/
```

- [ ] **Step 6: Commit**

```
git commit -am "$(cat <<'EOF'
feat(fractal-plan): capture R-snapshot in bulkCreateTrades (CSV path)

Same flag-guarded pattern as createTrade: zero behavior change when
FRACTAL_PLAN_DUAL_WRITE is unset.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire R-snapshot into `createScaledTrade`

**Files:**
- Modify: `src/app/actions/trades.ts:~1597` (scaledInsertValues builder)
- Modify (or create): `src/__tests__/app/actions/trades-scaled-r-snapshot.test.ts`

- [ ] **Step 1: Failing test (mirror Task 5 shape)**

```ts
describe("createScaledTrade — fractal R-snapshot capture (Phase 3)", () => {
	it("populates oneRSnapshotCents when flag ON", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "1"
		// stub captureROnEntry → 75000
		await createScaledTrade({ /* … with entryDate */ }, [/* executions */])
		expect(insertedRow.oneRSnapshotCents).toBe(75000)
	})

	it("leaves oneRSnapshotCents null when flag OFF", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "0"
		// …
		expect(insertedRow.oneRSnapshotCents).toBeNull()
	})
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Update `createScaledTrade`**

Insert right before the encryption block (`if (dek) { Object.assign(scaledInsertValues, …) }` around line 1633):

```ts
let oneRSnapshotCentsScaled: number | null = null
if (isFractalPlanDualWriteEnabled()) {
	try {
		oneRSnapshotCentsScaled = await captureROnEntry({ accountId, entryDate })
	} catch (snapErr) {
		console.error("[fractal-plan] captureROnEntry (scaled) failed silently:", snapErr)
	}
}
;(scaledInsertValues as Record<string, unknown>).oneRSnapshotCents = oneRSnapshotCentsScaled
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```
git commit -am "feat(fractal-plan): capture R-snapshot in createScaledTrade

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Wire `checkDrawdownTrigger` after every closed trade insert

**Files:**
- Modify: `src/app/actions/trades.ts` (3 spots: after `createTrade` insert, after `bulkCreateTrades` batch insert, after `createScaledTrade` insert)
- Create: `src/__tests__/app/actions/trades-drawdown-trigger.test.ts`

After a trade with `outcome === "loss"` and a non-null pnl is inserted, call `checkDrawdownTrigger` so monthly drawdown deescalations happen immediately. Wins do not trigger.

- [ ] **Step 1: Failing test**

```ts
describe("createTrade — drawdown trigger (Phase 3)", () => {
	beforeEach(() => { process.env.FRACTAL_PLAN_DUAL_WRITE = "1" })

	it("calls checkDrawdownTrigger after a losing trade", async () => {
		const spy = vi.fn().mockResolvedValue(null)
		// …mock checkDrawdownTrigger module export to spy
		await createTrade({ /* losing trade */ })
		expect(spy).toHaveBeenCalledOnce()
		expect(spy).toHaveBeenCalledWith(expect.objectContaining({ accountId: expect.any(String) }))
	})

	it("does NOT call checkDrawdownTrigger after a winning trade", async () => {
		// …
		await createTrade({ /* winning trade */ })
		expect(spy).not.toHaveBeenCalled()
	})

	it("does NOT call checkDrawdownTrigger when flag is OFF", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "0"
		// …
		await createTrade({ /* losing trade */ })
		expect(spy).not.toHaveBeenCalled()
	})
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Add the wiring**

Add a small helper at the top of `trades.ts` (near the other Phase 2 imports):

```ts
import { checkDrawdownTrigger } from "@/lib/fractal-plan/drawdown-trigger"

const maybeTriggerDrawdown = async (
	accountId: string,
	outcome: "win" | "loss" | "breakeven" | undefined,
	exitDate: Date | null
) => {
	if (!isFractalPlanDualWriteEnabled()) return
	if (outcome !== "loss" || !exitDate) return
	try {
		await checkDrawdownTrigger({ accountId, asOf: exitDate })
	} catch (err) {
		console.error("[fractal-plan] checkDrawdownTrigger failed silently:", err)
	}
}
```

Then call `maybeTriggerDrawdown(accountId, outcome, tradeData.exitDate ?? null)` once after each successful insert in `createTrade`, `bulkCreateTrades` (per inserted row in the loop after the batch insert), and `createScaledTrade`.

For `bulkCreateTrades`, fold it into the post-insert block: `for (const inserted of insertedTrades) { await maybeTriggerDrawdown(accountId, inserted.outcome, inserted.exitDate) }`.

- [ ] **Step 4: Run new + existing tests**

```
bun run test:unit -- src/__tests__/app/actions/
```

- [ ] **Step 5: Commit**

```
git commit -am "$(cat <<'EOF'
feat(fractal-plan): trigger drawdown deescalation on loss closes

createTrade, bulkCreateTrades, createScaledTrade now call
checkDrawdownTrigger on losing-outcome inserts. Flag-guarded.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `forceTierReeval` server action

**Files:**
- Create: `src/app/actions/fractal-plan/tier.ts`
- Create: `src/__tests__/app/actions/fractal-plan/tier.test.ts`

Manual escape hatch: a UI-callable action that re-runs `evaluateMonthStart` (or `evaluateDrawdownTrigger`) on demand for support tickets / manual recovery. Returns the new tier and any audit row written.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest"
// usual auth mock returning userId+accountId

describe("forceTierReeval", () => {
	it("returns success with the recomputed tier", async () => {
		// mock yearly + ladder to produce tier T2
		const result = await forceTierReeval({ asOf: new Date("2026-03-01") })
		expect(result.status).toBe("success")
		expect(result.data?.newTier).toBe("T2")
	})

	it("returns error when account has no yearly plan", async () => {
		const result = await forceTierReeval({ asOf: new Date("2026-03-01") })
		expect(result.status).toBe("error")
		expect(result.errors?.[0].code).toBe("NO_YEARLY_PLAN")
	})
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Implement**

```ts
// src/app/actions/fractal-plan/tier.ts
"use server"

import { z } from "zod"
import { requireAuth } from "@/lib/auth"
import { db } from "@/db/drizzle"
import { yearlyPlans, tierChangeLog } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { resolveTier } from "@/lib/fractal-plan/capital-ladder"
import { evaluateMonthStart } from "@/lib/fractal-plan/tier-eval"
import { toSafeErrorMessage } from "@/lib/safe-error"
import type { ActionResponse } from "@/types"

const inputSchema = z.object({
	asOf: z.coerce.date(),
})

interface ForceTierReevalResult {
	newTier: string
	wrote: boolean
}

export const forceTierReeval = async (
	input: z.infer<typeof inputSchema>
): Promise<ActionResponse<ForceTierReevalResult>> => {
	try {
		const { accountId } = await requireAuth()
		const { asOf } = inputSchema.parse(input)

		const yearly = await db
			.select()
			.from(yearlyPlans)
			.where(and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, asOf.getFullYear())))
			.then((rs) => rs[0] ?? null)

		if (!yearly) {
			return {
				status: "error",
				message: "No yearly plan for the requested year",
				errors: [{ code: "NO_YEARLY_PLAN", detail: `year=${asOf.getFullYear()}` }],
			}
		}

		const decision = await evaluateMonthStart({ accountId, yearly, asOf })

		let wrote = false
		if (decision.changed) {
			await db.insert(tierChangeLog).values({
				accountId,
				yearlyPlanId: yearly.id,
				fromTier: decision.fromTier,
				toTier: decision.toTier,
				reason: "manual_force_reeval",
				asOf,
			})
			wrote = true
		}

		return {
			status: "success",
			message: "Tier re-evaluation complete",
			data: { newTier: decision.toTier, wrote },
		}
	} catch (error) {
		return {
			status: "error",
			message: "forceTierReeval failed",
			errors: [{ code: "FORCE_TIER_REEVAL_FAILED", detail: toSafeErrorMessage(error, "forceTierReeval") }],
		}
	}
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```
git commit -am "feat(actions): forceTierReeval support action for manual tier recompute

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Backfill `oneRSnapshotCents` + `rOutcome` on existing trades

**Files:**
- Create: `src/lib/fractal-plan/backfill-trades.ts`
- Create: `src/__tests__/lib/fractal-plan/backfill-trades.test.ts`

One-shot script (called via a small CLI in Task 10). Walks every account's trades chronologically, calls `captureROnEntry` for each (using historic ladder snapshot at the trade's entryDate), updates the row only if currently null. Idempotent.

- [ ] **Step 1: Failing test**

```ts
// src/__tests__/lib/fractal-plan/backfill-trades.test.ts
describe("backfillTradesForAccount", () => {
	it("populates oneRSnapshotCents on rows where it is null", async () => {
		// seed: 3 trades, all with oneRSnapshotCents = null
		// stub captureROnEntry to return 50000
		await backfillTradesForAccount({ accountId, dryRun: false })
		// assert all 3 rows now have oneRSnapshotCents = 50000
	})

	it("computes rOutcome from pnl / oneRSnapshotCents when both present", async () => {
		// trade has pnl = 75000, snapshot = 50000 → rOutcome = "1.50"
		await backfillTradesForAccount({ accountId, dryRun: false })
		expect(updatedRow.rOutcome).toBe("1.50")
	})

	it("skips rows where oneRSnapshotCents is already set (idempotent)", async () => {
		// row has oneRSnapshotCents = 99999 → must remain 99999
	})

	it("returns the count of rows modified in dryRun mode without writing", async () => {
		const result = await backfillTradesForAccount({ accountId, dryRun: true })
		expect(result.wouldWrite).toBe(3)
		// assert no UPDATE was issued
	})
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/backfill-trades.ts
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { and, eq, isNull, asc } from "drizzle-orm"
import { captureROnEntry } from "./r-snapshot"

interface BackfillInput {
	accountId: string
	dryRun?: boolean
}

interface BackfillResult {
	scanned: number
	wouldWrite: number
	wrote: number
}

const computeR = (pnlCents: number, oneRCents: number): string =>
	(pnlCents / oneRCents).toFixed(2)

const backfillTradesForAccount = async (
	input: BackfillInput
): Promise<BackfillResult> => {
	const rows = await db
		.select({
			id: trades.id,
			entryDate: trades.entryDate,
			pnl: trades.pnl,
			oneRSnapshotCents: trades.oneRSnapshotCents,
			rOutcome: trades.rOutcome,
		})
		.from(trades)
		.where(and(eq(trades.accountId, input.accountId), isNull(trades.oneRSnapshotCents)))
		.orderBy(asc(trades.entryDate))

	let wrote = 0
	for (const row of rows) {
		const snapshot = await captureROnEntry({
			accountId: input.accountId,
			entryDate: row.entryDate,
		})
		if (snapshot == null) continue

		const updates: { oneRSnapshotCents: number; rOutcome?: string } = {
			oneRSnapshotCents: snapshot,
		}
		const pnlCents = row.pnl == null ? null : Number(row.pnl)
		if (pnlCents != null && Number.isFinite(pnlCents) && snapshot > 0) {
			updates.rOutcome = computeR(pnlCents, snapshot)
		}

		if (!input.dryRun) {
			await db.update(trades).set(updates).where(eq(trades.id, row.id))
		}
		wrote++
	}

	return {
		scanned: rows.length,
		wouldWrite: wrote,
		wrote: input.dryRun ? 0 : wrote,
	}
}

export type { BackfillInput, BackfillResult }
export { backfillTradesForAccount }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```
git commit -am "$(cat <<'EOF'
feat(fractal-plan): backfill oneRSnapshotCents + rOutcome on legacy trades

Idempotent — only touches rows where oneRSnapshotCents is null.
Supports dryRun mode for production rollout staging.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Backfill CLI runner

**Files:**
- Create: `scripts/fractal-plan-backfill.ts`

A thin CLI wrapper over `backfillTradesForAccount` so the operator can run `bun run scripts/fractal-plan-backfill.ts --account-id=… [--dry-run]`. Not test-driven — operational tool.

- [ ] **Step 1: Implement**

```ts
// scripts/fractal-plan-backfill.ts
/**
 * Usage:
 *   bun run scripts/fractal-plan-backfill.ts --account-id=<uuid>
 *   bun run scripts/fractal-plan-backfill.ts --account-id=<uuid> --dry-run
 */
import { backfillTradesForAccount } from "@/lib/fractal-plan/backfill-trades"

const args = process.argv.slice(2)
const accountIdArg = args.find((a) => a.startsWith("--account-id="))
const dryRun = args.includes("--dry-run")

if (!accountIdArg) {
	console.error("Missing --account-id=<uuid>")
	process.exit(1)
}
const accountId = accountIdArg.split("=")[1]

const main = async () => {
	const result = await backfillTradesForAccount({ accountId, dryRun })
	console.log(JSON.stringify({ accountId, dryRun, ...result }, null, 2))
	process.exit(0)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
```

- [ ] **Step 2: Smoke test the CLI parses correctly (no DB)**

```
bun run scripts/fractal-plan-backfill.ts || true
```

Expected: prints "Missing --account-id=<uuid>" and exits with code 1. Don't run with a real account-id in CI — that's an operator step.

- [ ] **Step 3: Commit**

```
git add scripts/fractal-plan-backfill.ts
git commit -m "feat(fractal-plan): CLI runner for trade backfill

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: `ProvenanceBadge` component

**Files:**
- Create: `src/components/fractal-plan/provenance-badge.tsx`
- Create: `src/__tests__/components/fractal-plan/provenance-badge.test.tsx`

Tiny pill that shows where a value came from in the cascade (e.g., `[from Year]`, `[override at Month]`). Uses Tailwind + custom palette only.

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

describe("ProvenanceBadge", () => {
	it("renders 'from Year' for level=year", () => {
		render(<ProvenanceBadge level="year" />)
		expect(screen.getByText(/from Year/i)).toBeInTheDocument()
	})

	it("renders 'override at Month' when level=month and isOverride=true", () => {
		render(<ProvenanceBadge level="month" isOverride />)
		expect(screen.getByText(/override at Month/i)).toBeInTheDocument()
	})

	it("renders nothing when level=none", () => {
		const { container } = render(<ProvenanceBadge level="none" />)
		expect(container.firstChild).toBeNull()
	})
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Implement**

```tsx
// src/components/fractal-plan/provenance-badge.tsx
type CascadeLevel = "year" | "quarter" | "month" | "week" | "day" | "none"

interface ProvenanceBadgeProps {
	level: CascadeLevel
	isOverride?: boolean
}

const LEVEL_LABEL: Record<Exclude<CascadeLevel, "none">, string> = {
	year: "Year",
	quarter: "Quarter",
	month: "Month",
	week: "Week",
	day: "Day",
}

const ProvenanceBadge = ({ level, isOverride = false }: ProvenanceBadgeProps) => {
	if (level === "none") return null
	const label = LEVEL_LABEL[level]
	const text = isOverride ? `override at ${label}` : `from ${label}`
	return (
		<span
			aria-label={`source: ${text}`}
			className="inline-flex items-center rounded-md bg-bg-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-200"
		>
			{text}
		</span>
	)
}

export type { CascadeLevel, ProvenanceBadgeProps }
export { ProvenanceBadge }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```
git commit -am "feat(fractal-plan): ProvenanceBadge component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: `PlanSection` shared layout component

**Files:**
- Create: `src/components/fractal-plan/plan-section.tsx`

A presentational wrapper used by every `/plan/*` page so the header style is consistent: title + subtitle + breadcrumb + ProvenanceBadge slot. No tests — purely visual; behavior is covered by the page tests.

- [ ] **Step 1: Implement**

```tsx
// src/components/fractal-plan/plan-section.tsx
import type { ReactNode } from "react"

interface PlanSectionProps {
	title: string
	subtitle?: string
	breadcrumb?: ReactNode
	children: ReactNode
}

const PlanSection = ({ title, subtitle, breadcrumb, children }: PlanSectionProps) => (
	<section className="space-y-m-300">
		{breadcrumb ? <div className="text-sm text-text-200">{breadcrumb}</div> : null}
		<header className="space-y-m-100">
			<h1 className="text-2xl font-medium text-text-100">{title}</h1>
			{subtitle ? <p className="text-text-200">{subtitle}</p> : null}
		</header>
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-400">{children}</div>
	</section>
)

export type { PlanSectionProps }
export { PlanSection }
```

- [ ] **Step 2: Commit**

```
git add src/components/fractal-plan/plan-section.tsx
git commit -m "feat(fractal-plan): PlanSection shared layout shell

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: `/plan` route layout

**Files:**
- Create: `src/app/[locale]/(app)/plan/layout.tsx`

Sets locale, applies max-width container consistent with `/yearly-plan`.

- [ ] **Step 1: Implement**

```tsx
// src/app/[locale]/(app)/plan/layout.tsx
import { setRequestLocale } from "next-intl/server"
import type { ReactNode } from "react"

interface PlanLayoutProps {
	children: ReactNode
	params: Promise<{ locale: string }>
}

const PlanLayout = async ({ children, params }: PlanLayoutProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	return (
		<div className="min-h-dvh bg-bg-100">
			<main className="mx-auto max-w-6xl p-m-400 sm:p-m-500 lg:p-m-600">{children}</main>
		</div>
	)
}

export { PlanLayout as default }
```

- [ ] **Step 2: Commit**

```
git add src/app/[locale]/\(app\)/plan/layout.tsx
git commit -m "feat(plan): route layout shell

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: `/plan/[year]` route — year view

**Files:**
- Create: `src/app/[locale]/(app)/plan/[year]/page.tsx`

Server component. Uses `resolveYear` to display year-level R defaults with `[from Year]` provenance. Auto-seeds the cascade tree when missing (calls `autoSeedYearlyTree` with `idempotent: true`).

- [ ] **Step 1: Implement**

```tsx
// src/app/[locale]/(app)/plan/[year]/page.tsx
import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/lib/auth"
import { resolveYear } from "@/lib/fractal-plan/resolver"
import { autoSeedYearlyTree } from "@/lib/fractal-plan/auto-seed"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

interface PageProps {
	params: Promise<{ locale: string; year: string }>
}

const formatR = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}R`)

const PlanYearPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	if (!Number.isInteger(year) || year < 2000 || year > 2100) {
		return (
			<PlanSection title="Invalid year">
				<p className="text-text-200">Year must be a 4-digit integer between 2000 and 2100.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()

	// Idempotent: only seeds if no quarterly_plan rows exist for this year.
	await autoSeedYearlyTree({ accountId, year, idempotent: true })

	const r = await resolveYear({ accountId, year })

	return (
		<PlanSection
			title={`Plan ${year}`}
			subtitle="Year-level defaults — propagate down to quarter, month, week, day"
		>
			<dl className="grid grid-cols-1 gap-m-300 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-text-200">Default daily loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.defaultDailyLossR)}</span>
						<ProvenanceBadge level={r.defaultDailyLossR_provenance} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Default daily win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.defaultDailyWinR)}</span>
						<ProvenanceBadge level={r.defaultDailyWinR_provenance} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Default weekly loss / win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">
							{formatR(r.defaultWeeklyLossR)} / {formatR(r.defaultWeeklyWinR)}
						</span>
						<ProvenanceBadge level={r.defaultWeeklyWinR_provenance} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Default monthly loss / win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">
							{formatR(r.defaultMonthlyLossR)} / {formatR(r.defaultMonthlyWinR)}
						</span>
						<ProvenanceBadge level={r.defaultMonthlyWinR_provenance} />
					</dd>
				</div>
			</dl>
		</PlanSection>
	)
}

export { PlanYearPage as default }
```

- [ ] **Step 2: Smoke render check (no test — server component requires page-level test infra)**

Run a typecheck:
```
bun run lint
```

- [ ] **Step 3: Commit**

```
git add src/app/[locale]/\(app\)/plan/
git commit -m "feat(plan): /plan/[year] year view route

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 15: `/plan/[year]/[quarter]/[month]` route — month view (skip quarter sub-route for now)

**Files:**
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/page.tsx` (placeholder redirecting to first month)
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/page.tsx`

The quarter view is just a navigation hub; the month view is where the resolver content lives.

- [ ] **Step 1: Implement quarter placeholder**

```tsx
// src/app/[locale]/(app)/plan/[year]/[quarter]/page.tsx
import { redirect } from "next/navigation"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string }>
}

const PlanQuarterPage = async ({ params }: PageProps) => {
	const { locale, year, quarter } = await params
	const q = Number(quarter)
	if (![1, 2, 3, 4].includes(q)) {
		redirect(`/${locale}/plan/${year}`)
	}
	// First month of the quarter
	const month = (q - 1) * 3 + 1
	redirect(`/${locale}/plan/${year}/${q}/${month}`)
}

export { PlanQuarterPage as default }
```

- [ ] **Step 2: Implement month view**

```tsx
// src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/page.tsx
import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/lib/auth"
import { resolveMonth } from "@/lib/fractal-plan/resolver"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string }>
}

const formatR = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}R`)
const MONTH_NAME = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const PlanMonthPage = async ({ params }: PageProps) => {
	const { locale, year: yearStr, month: monthStr } = await params
	setRequestLocale(locale)
	const year = Number(yearStr)
	const month = Number(monthStr)
	if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
		return (
			<PlanSection title="Invalid month">
				<p className="text-text-200">Month must be 1-12.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()
	const r = await resolveMonth({ accountId, year, month })

	return (
		<PlanSection
			title={`${MONTH_NAME[month]} ${year}`}
			subtitle="Month-level cascade-resolved targets"
			breadcrumb={<a href={`/${locale}/plan/${year}`} className="hover:text-text-100">{year}</a>}
		>
			<dl className="grid grid-cols-1 gap-m-300 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-text-200">Monthly win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.monthlyWinR)}</span>
						<ProvenanceBadge level={r.monthlyWinR_provenance} isOverride={r.monthlyWinR_provenance === "month"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Monthly loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.monthlyLossR)}</span>
						<ProvenanceBadge level={r.monthlyLossR_provenance} isOverride={r.monthlyLossR_provenance === "month"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Target weeks</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{r.monthlyTargetWeeks ?? "—"}</span>
						<ProvenanceBadge level={r.monthlyTargetWeeks_provenance} isOverride={r.monthlyTargetWeeks_provenance === "month"} />
					</dd>
				</div>
			</dl>
		</PlanSection>
	)
}

export { PlanMonthPage as default }
```

- [ ] **Step 3: Lint**

```
bun run lint
```

- [ ] **Step 4: Commit**

```
git add src/app/[locale]/\(app\)/plan/
git commit -m "feat(plan): /plan/[year]/[q]/[month] month view + /[q] redirect

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 16: `/plan/[year]/[quarter]/[month]/[week]/[date]` — day view

**Files:**
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/page.tsx` (placeholder redirecting to first day)
- Create: `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/[date]/page.tsx`

The day view consumes `resolveDay` — the existing Phase 2 function — and calls `lazyEnsureDailyPlan` so a row exists for "today".

- [ ] **Step 1: Implement week placeholder (redirects to first weekday of the ISO week)**

```tsx
// src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/page.tsx
import { redirect } from "next/navigation"
import { startOfISOWeek, format } from "date-fns"
import { setISOWeek, setYear } from "date-fns"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string; week: string }>
}

const PlanWeekPage = async ({ params }: PageProps) => {
	const { locale, year, quarter, month, week } = await params
	const isoYear = Number(year)
	const isoWeek = Number(week)
	if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
		redirect(`/${locale}/plan/${year}/${quarter}/${month}`)
	}
	const d = startOfISOWeek(setISOWeek(setYear(new Date(), isoYear), isoWeek))
	const dayStr = format(d, "yyyy-MM-dd")
	redirect(`/${locale}/plan/${year}/${quarter}/${month}/${week}/${dayStr}`)
}

export { PlanWeekPage as default }
```

- [ ] **Step 2: Implement day view**

```tsx
// src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/[date]/page.tsx
import { setRequestLocale } from "next-intl/server"
import { requireAuth } from "@/lib/auth"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { lazyEnsureDailyPlan } from "@/app/actions/fractal-plan/daily"
import { PlanSection } from "@/components/fractal-plan/plan-section"
import { ProvenanceBadge } from "@/components/fractal-plan/provenance-badge"

interface PageProps {
	params: Promise<{ locale: string; year: string; quarter: string; month: string; week: string; date: string }>
}

const formatR = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}R`)

const PlanDayPage = async ({ params }: PageProps) => {
	const { locale, date } = await params
	setRequestLocale(locale)

	const day = new Date(`${date}T00:00:00Z`)
	if (Number.isNaN(day.getTime())) {
		return (
			<PlanSection title="Invalid date">
				<p className="text-text-200">Date must be ISO yyyy-MM-dd.</p>
			</PlanSection>
		)
	}

	const { accountId } = await requireAuth()
	await lazyEnsureDailyPlan({ accountId, date: day })
	const r = await resolveDay({ accountId, date: day })

	return (
		<PlanSection title={date} subtitle="Day-level cascade-resolved limits">
			<dl className="grid grid-cols-1 gap-m-300 sm:grid-cols-2">
				<div>
					<dt className="text-sm text-text-200">Daily loss R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.dailyLossR)}</span>
						<ProvenanceBadge level={r.dailyLossR_provenance} isOverride={r.dailyLossR_provenance === "day"} />
					</dd>
				</div>
				<div>
					<dt className="text-sm text-text-200">Daily win R</dt>
					<dd className="mt-1 flex items-center gap-m-200">
						<span className="font-mono text-lg text-text-100">{formatR(r.dailyWinR)}</span>
						<ProvenanceBadge level={r.dailyWinR_provenance} isOverride={r.dailyWinR_provenance === "day"} />
					</dd>
				</div>
			</dl>
		</PlanSection>
	)
}

export { PlanDayPage as default }
```

- [ ] **Step 3: Lint + spot check via dev server (operator step, do not run in CI):**

`bun run dev` and visit `/en/plan/2026/1/3/10/2026-03-02`. Skip if dev server isn't expected.

- [ ] **Step 4: Commit**

```
git add src/app/[locale]/\(app\)/plan/
git commit -m "feat(plan): /plan/[…]/[date] day view + /[week] redirect

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 17: Today's plan strip in command-center

**Files:**
- Create: `src/components/fractal-plan/today-strip.tsx`
- Modify: `src/app/[locale]/(app)/command-center/command-center-content.tsx` (mount the strip behind the flag)

Tiny banner above the existing command-center content showing today's resolved daily loss R + win R, with a link to the full day view. Only renders when the flag is ON — gated by a server-action flag check that runs server-side.

- [ ] **Step 1: Implement strip (server component)**

```tsx
// src/components/fractal-plan/today-strip.tsx
import { resolveDay } from "@/lib/fractal-plan/resolver"
import { lazyEnsureDailyPlan } from "@/app/actions/fractal-plan/daily"
import { isFractalPlanDualWriteEnabled } from "@/lib/flags/fractal-plan"
import { format } from "date-fns"
import { ProvenanceBadge } from "./provenance-badge"

interface TodayStripProps {
	accountId: string
	now: Date
	locale: string
}

const TodayStrip = async ({ accountId, now, locale }: TodayStripProps) => {
	if (!isFractalPlanDualWriteEnabled()) return null

	await lazyEnsureDailyPlan({ accountId, date: now })
	const r = await resolveDay({ accountId, date: now })

	const year = now.getFullYear()
	const month = now.getMonth() + 1
	const quarter = Math.ceil(month / 3)
	// ISO week from date-fns is overkill here; the route accepts any week placeholder that redirects.
	const dateStr = format(now, "yyyy-MM-dd")
	const href = `/${locale}/plan/${year}/${quarter}/${month}/0/${dateStr}` // 0 = sentinel; week page redirects but we want the day directly:
	// instead link to the day route directly bypassing week placeholder using its real path:
	// (week page only redirects; using 0 is fine because the day route ignores the week segment).

	return (
		<div className="mb-m-400 flex items-center justify-between rounded-lg border border-bg-300 bg-bg-200 px-m-400 py-m-300">
			<div className="flex items-center gap-m-300">
				<span className="text-sm text-text-200">Today's plan</span>
				<span className="font-mono text-text-100">
					Loss: {r.dailyLossR == null ? "—" : `${r.dailyLossR.toFixed(2)}R`}
				</span>
				<ProvenanceBadge level={r.dailyLossR_provenance} />
				<span className="font-mono text-text-100">
					Win: {r.dailyWinR == null ? "—" : `${r.dailyWinR.toFixed(2)}R`}
				</span>
				<ProvenanceBadge level={r.dailyWinR_provenance} />
			</div>
			<a href={href} className="text-sm text-acc-100 hover:underline">
				Open day view →
			</a>
		</div>
	)
}

export type { TodayStripProps }
export { TodayStrip }
```

- [ ] **Step 2: Mount in command-center-content**

Read the existing `command-center-content.tsx` first; insert `<TodayStrip accountId={...} now={...} locale={locale} />` near the top of the rendered tree, sourced from the same auth/effective-now data the page already loads. If the file is a client component, the strip mount must happen at a server-component layer instead — adapt by mounting in `command-center/page.tsx` above `<CommandCenterContent>` rather than inside it.

- [ ] **Step 3: Lint**

```
bun run lint
```

- [ ] **Step 4: Commit**

```
git add src/components/fractal-plan/today-strip.tsx src/app/[locale]/\(app\)/command-center/
git commit -m "feat(command-center): today's plan strip (flag-guarded)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 18: Redirect legacy `/yearly-plan` and `/monthly` routes

**Files:**
- Modify: `src/proxy.ts`

Use 301-style redirects (Next.js `NextResponse.redirect` with status 308 by default — that's a permanent preserve-method redirect, equivalent for GET-only routes). Only redirect when the flag is ON; legacy URLs still serve the legacy pages when the flag is OFF for safety.

- [ ] **Step 1: Modify proxy**

Add this block inside the `proxy = auth(...)` callback, **after** the auth-check / role-check block but **before** the `intlMiddleware(req)` return:

```ts
// Fractal-plan cutover redirects (Phase 3, flag-guarded)
if (process.env.FRACTAL_PLAN_DUAL_WRITE === "1") {
	const pathWithoutLocaleStripped = pathname.replace(/^\/(en|pt-BR)/, "") || "/"
	const localeMatch = pathname.match(/^\/(en|pt-BR)/)
	const localePrefix = localeMatch ? localeMatch[0] : "/en"

	const now = new Date()
	const year = now.getFullYear()
	const month = now.getMonth() + 1
	const quarter = Math.ceil(month / 3)

	if (pathWithoutLocaleStripped === "/yearly-plan") {
		return NextResponse.redirect(new URL(`${localePrefix}/plan/${year}`, req.url), 308)
	}
	if (pathWithoutLocaleStripped === "/monthly") {
		return NextResponse.redirect(
			new URL(`${localePrefix}/plan/${year}/${quarter}/${month}`, req.url),
			308
		)
	}
}
```

- [ ] **Step 2: Smoke test (lint only — proxy isn't unit-tested)**

```
bun run lint
```

- [ ] **Step 3: Commit**

```
git commit -am "$(cat <<'EOF'
feat(proxy): redirect /yearly-plan and /monthly to /plan/* when flag ON

308 permanent redirects, flag-gated so legacy stays reachable when
FRACTAL_PLAN_DUAL_WRITE is unset.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Reports R-distribution tab

**Files:**
- Create: `src/components/reports/r-distribution-tab.tsx`
- Modify: existing reports tabs container (search the codebase: `grep -nR "reportsTabs\|ReportsContent" src/app src/components | head`)

A new tab on the Reports page that bins trades by `rOutcome` (buckets: `<-1R`, `-1R..0`, `0..1R`, `1..2R`, `2R+`). Pure presentational — backed by a small server action.

- [ ] **Step 1: Add server action `getRDistribution`**

```ts
// src/app/actions/fractal-plan/reports.ts (new file)
"use server"

import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { and, eq, isNotNull, gte, lte } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import type { ActionResponse } from "@/types"

interface RDistRow {
	bucket: "lt_neg1" | "neg1_to_0" | "0_to_1" | "1_to_2" | "ge_2"
	count: number
}

const bucketize = (r: number): RDistRow["bucket"] => {
	if (r < -1) return "lt_neg1"
	if (r < 0) return "neg1_to_0"
	if (r < 1) return "0_to_1"
	if (r < 2) return "1_to_2"
	return "ge_2"
}

export const getRDistribution = async (range: {
	from: Date
	to: Date
}): Promise<ActionResponse<RDistRow[]>> => {
	const { accountId } = await requireAuth()

	const rows = await db
		.select({ rOutcome: trades.rOutcome })
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				isNotNull(trades.rOutcome),
				gte(trades.exitDate, range.from),
				lte(trades.exitDate, range.to)
			)
		)

	const counts = new Map<RDistRow["bucket"], number>()
	for (const row of rows) {
		const r = Number(row.rOutcome)
		if (!Number.isFinite(r)) continue
		const b = bucketize(r)
		counts.set(b, (counts.get(b) ?? 0) + 1)
	}

	const data: RDistRow[] = (
		["lt_neg1", "neg1_to_0", "0_to_1", "1_to_2", "ge_2"] as const
	).map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }))

	return { status: "success", message: "ok", data }
}
```

- [ ] **Step 2: Implement the tab component**

```tsx
// src/components/reports/r-distribution-tab.tsx
"use client"

import { useEffect, useState } from "react"
import { getRDistribution } from "@/app/actions/fractal-plan/reports"

const LABELS: Record<string, string> = {
	lt_neg1: "< -1R",
	neg1_to_0: "-1R to 0",
	"0_to_1": "0 to 1R",
	"1_to_2": "1R to 2R",
	ge_2: "≥ 2R",
}

interface Props {
	from: Date
	to: Date
}

const RDistributionTab = ({ from, to }: Props) => {
	const [rows, setRows] = useState<{ bucket: string; count: number }[] | null>(null)

	useEffect(() => {
		getRDistribution({ from, to }).then((res) => {
			if (res.status === "success" && res.data) setRows(res.data)
		})
	}, [from, to])

	if (rows === null) return <p className="text-text-200">Loading…</p>
	const max = Math.max(...rows.map((r) => r.count), 1)

	return (
		<div className="space-y-m-300">
			{rows.map((r) => (
				<div key={r.bucket} className="flex items-center gap-m-300">
					<span className="w-24 text-sm text-text-200">{LABELS[r.bucket]}</span>
					<div className="h-3 flex-1 rounded bg-bg-300">
						<div
							className="h-full rounded bg-acc-100"
							style={{ width: `${(r.count / max) * 100}%` }}
						/>
					</div>
					<span className="w-12 text-right font-mono text-sm text-text-100">{r.count}</span>
				</div>
			))}
		</div>
	)
}

export { RDistributionTab }
```

- [ ] **Step 3: Mount in reports tabs container**

Locate the existing reports tabs file and add a tab labeled `R distribution` that renders `<RDistributionTab from={from} to={to} />` with the existing date range. If the existing reports system uses a tab registry, add an entry behind the flag check (server-side prop).

- [ ] **Step 4: Lint**

```
bun run lint
```

- [ ] **Step 5: Commit**

```
git commit -am "$(cat <<'EOF'
feat(reports): R-distribution tab and getRDistribution action

Buckets trades by realized R into 5 ranges; renders a horizontal bar
chart with brand-gold fill.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Flip the feature flag default ON

**Files:**
- Modify: `src/lib/flags/fractal-plan.ts`
- Modify: `src/__tests__/lib/flags/fractal-plan.test.ts`
- Modify: `.env.example`

Change the semantics from "opt-in via `=1`" to "opt-out via `=0`" so production rolls out automatically while preserving an emergency kill-switch.

- [ ] **Step 1: Update test to assert new defaults**

```ts
// src/__tests__/lib/flags/fractal-plan.test.ts (replace existing assertions)
describe("isFractalPlanDualWriteEnabled (Phase 3 flip)", () => {
	const origEnv = process.env.FRACTAL_PLAN_DUAL_WRITE

	afterEach(() => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = origEnv
	})

	it("returns true when env is unset (default ON)", () => {
		delete process.env.FRACTAL_PLAN_DUAL_WRITE
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})

	it("returns true when env=1", () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "1"
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})

	it("returns false when env=0 (kill switch)", () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "0"
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})

	it("returns false when env=false", () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "false"
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})
})
```

- [ ] **Step 2: Verify failure**

- [ ] **Step 3: Update flag implementation**

```ts
// src/lib/flags/fractal-plan.ts
const DISABLE_VALUES = new Set(["0", "false", "off", "no"])

const isFractalPlanDualWriteEnabled = (): boolean => {
	const v = process.env.FRACTAL_PLAN_DUAL_WRITE
	if (v == null || v === "") return true // default ON in Phase 3
	return !DISABLE_VALUES.has(v.toLowerCase())
}

export { isFractalPlanDualWriteEnabled }
```

- [ ] **Step 4: Update `.env.example`**

Add (or update if present):

```
# Fractal planning cascade — set to "0" to disable (default: enabled).
FRACTAL_PLAN_DUAL_WRITE=
```

- [ ] **Step 5: Run full test suite**

```
bun run test:unit
```

Expected: 100% green. The few tests in trades / journal that explicitly set `FRACTAL_PLAN_DUAL_WRITE = "1"` continue to pass; the OFF-path tests need `= "0"` (Phase 2 already used `= "1"` so they should already be fine, but verify).

If any test relied on the implicit OFF default, adjust it to set `= "0"` explicitly.

- [ ] **Step 6: Commit**

```
git commit -am "$(cat <<'EOF'
feat(flags): flip FRACTAL_PLAN_DUAL_WRITE default to ON

Phase 3 cutover. Set FRACTAL_PLAN_DUAL_WRITE=0 to kill-switch back
to legacy planning paths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Final lint + full test gate

- [ ] **Step 1: Run lint**

```
bun run lint
```

Expected: clean (0 errors / 0 warnings). Pre-existing unused-imports warnings in tax-engine etc. are acceptable; no new ones from Phase 3 files.

- [ ] **Step 2: Run all unit tests**

```
bun run test:unit
```

Expected: ~+45 tests vs. Phase 2 baseline (1073 → ~1118). All green.

- [ ] **Step 3: Document deviations and verify**

Confirm in your final report:
- Migration `0032_*.sql` is purely additive (audited via grep).
- Flag default flipped — production-bound.
- Drawdown trigger wired into all 3 trade-create paths.
- R-snapshot wired into all 3 trade-create paths.
- Routes `/plan/[year]`, `/plan/[year]/[q]`, `/plan/[year]/[q]/[m]`, `/plan/[year]/[q]/[m]/[w]`, `/plan/[year]/[q]/[m]/[w]/[d]` exist and lint-clean.
- Legacy routes redirect when flag is ON, stay live when flag is OFF.

No commit — this is just the gate.

---

## Self-Review (run before handoff)

**Spec coverage:** Phase 3 of the design spec lists 13 deliverables. Mapping:

| Deliverable | Task |
|---|---|
| Translation script (yearly/weekly/monthly) | NOT NEEDED — schema is purely additive; legacy data already lives in legacy tables that Phase 4 drops |
| Backfill `oneRSnapshotCents` and `rOutcome` | Tasks 9, 10 |
| `/plan/[year]/[q]/[month]/[week]/[date]` UI tree | Tasks 13–16 |
| Provenance tags `[from Year]` / `[override at Month]` | Task 11 (component), used in Tasks 14–16 |
| Command center "Today's Plan" strip | Task 17 |
| 301-equivalent redirects | Task 18 (308 permanent) |
| Reports R-based tab | Task 19 |
| Wire drawdown trigger into trade-create | Task 7 |
| CSV/scaled R-snapshot | Tasks 5, 6 |
| Add `default*R` cols to yearlyPlans | Task 1 |
| `forceTierReeval` action | Task 8 |
| `resolveMonth` / `resolveYear` | Tasks 3, 4 |
| Feature flag flip → new UI live | Task 20 |

**Placeholder scan:** No `TBD`, no "implement later", no "fill in details". All code blocks are complete; the few "implementation notes" sections call out specific files to find via `grep` because the existing host file's name varies (e.g., reports tabs container).

**Type consistency:** `FractalMonthlyPlan` not used in this plan (no monthly_plan reads at month-view level beyond `monthlyPlan.winR` / `lossR` / `targetWeeks` decimal columns). `resolveMonth`'s shape is consistent with `resolveDay`'s `<field>_provenance` convention. `ProvenanceBadge`'s `CascadeLevel` type covers all levels emitted by all three resolvers.

**Risk notes:**
- The reports tabs container modification in Task 19 requires locating the host file dynamically — the executor must `grep -n` for it. If the project uses a static tab list, the modification is a 5-line addition; if it uses a dynamic registry, the addition is one line.
- Task 17's `TodayStrip` mount-point depends on whether `command-center-content.tsx` is a client component. If it is, mount one level up in `page.tsx`. The executor must inspect before editing.

---

## Execution Handoff

**Plan saved to** `docs/superpowers/plans/2026-05-04-fractal-planning-cascade-phase-3-cutover.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review.
2. **Inline Execution** — execute tasks sequentially with checkpoints.

Phase 1 and Phase 2 used a single general-purpose subagent for the whole phase; Phase 3 has more UI surface area, so the same single-subagent approach is fine but operators should expect more spot-checks (especially around route mount-points and command-center integration).
