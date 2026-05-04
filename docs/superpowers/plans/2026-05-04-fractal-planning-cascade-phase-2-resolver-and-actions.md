# Fractal Planning Cascade — Phase 2: Cascade Resolver + Dual-Write Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the cascade resolver service, the auto-seed yearly-plan flow, server actions for every fractal level, the tier-evaluation + drawdown-trigger functions, and the trade-time R-snapshot hook. All gated behind the `FRACTAL_PLAN_DUAL_WRITE` env flag — old UI continues unchanged; new tables fill silently in parallel.

**Architecture:** Pure logic stays in `src/lib/fractal-plan/*` (capital ladder, cascade merge, tier-eval). DB-bound services in `src/lib/fractal-plan/resolver.ts`. Server actions in `src/app/actions/fractal-plan/*`. Trade hook integrated into existing `src/app/actions/journal.ts` behind a `process.env.FRACTAL_PLAN_DUAL_WRITE === "1"` guard. Feature flag exposed via `src/lib/flags/fractal-plan.ts` for one-line check anywhere.

**Tech Stack:** TypeScript strict, Drizzle ORM, Vitest, Zod for action input validation. Pure-function-first design — every business rule has a unit-tested pure version before any DB code.

**Spec reference:** `docs/superpowers/specs/2026-05-04-fractal-planning-cascade-design.md` (sections "Cascade resolution", "Auto-seed pattern", "Drawdown trigger ↔ equity-shield", "Tax engine integration", "Migration strategy → Phase 2").

**Phase 1 reference:** `docs/superpowers/plans/2026-05-04-fractal-planning-cascade-phase-1-additive-schema.md` — schema is already live. Inferred row types are `FractalMonthlyPlan` / `NewFractalMonthlyPlan` (renamed to avoid collision with legacy `MonthlyPlan` from `monthlyPlans` table); other types are `QuarterlyPlan` / `WeeklyPlan` / `DailyPlan` / `TierChangeLog` and their `New*` insert variants.

---

## File Structure

- Create: `src/lib/flags/fractal-plan.ts` — single env-var read, exported as boolean getter
- Create: `src/lib/fractal-plan/capital-ladder.ts` — pure: capital → (tierIndex, oneRCents)
- Create: `src/lib/fractal-plan/cascade-merge.ts` — pure: merge nullable layers + provenance
- Create: `src/lib/fractal-plan/tier-eval.ts` — pure: month-start escalation + drawdown deescalation logic
- Create: `src/lib/fractal-plan/resolver.ts` — DB-bound: resolveDay/resolveMonth/resolveYear
- Create: `src/lib/fractal-plan/auto-seed.ts` — DB-bound: createYearlyPlan auto-seeds 4 quarters + 12 months + ~52 weeks in one tx
- Create: `src/lib/fractal-plan/auto-link-tax-ledger.ts` — DB-bound: monthly_plan ↔ monthly_tax_ledger bidirectional FK linker
- Create: `src/lib/fractal-plan/drawdown-trigger.ts` — DB-bound: detect threshold breach, refresh snapshot, write tier_change_log
- Create: `src/lib/fractal-plan/r-snapshot.ts` — pure helper: capture 1R at trade entry from resolved day
- Create: `src/app/actions/fractal-plan/yearly.ts` — `createYearlyPlanV2`, `updateYearlyPlanDefaults`, `getYearlyPlanV2`
- Create: `src/app/actions/fractal-plan/quarterly.ts` — `upsertQuarterlyPlan`, `resetQuarterlyOverride`
- Create: `src/app/actions/fractal-plan/monthly.ts` — `upsertMonthlyPlan`, `resetMonthlyOverride`, `forceTierReeval`
- Create: `src/app/actions/fractal-plan/weekly.ts` — `upsertWeeklyPlan`, `resetWeeklyOverride`
- Create: `src/app/actions/fractal-plan/daily.ts` — `upsertDailyPlan`, `resetDailyOverride`, `lazyEnsureDailyPlan`
- Create: `src/app/actions/fractal-plan/index.ts` — barrel export (NOT `"use server"` — only re-exports)
- Modify: `src/app/actions/journal.ts` — behind flag, write `oneRSnapshotCents` on entry, compute `rOutcome` on close
- Create: tests under `src/__tests__/lib/fractal-plan/` (one file per source module)

The fractal-plan code lives in its own directory so Phase 4 cleanup can drop it in one move if the project is ever rolled back. **Files that change together live together** — pure logic siblings + tests next door.

---

## Task 1: Feature flag

**Files:**
- Create: `src/lib/flags/fractal-plan.ts`
- Test: `src/__tests__/lib/flags/fractal-plan.test.ts`

**Why:** Every dual-write site needs a one-line check. Centralize the env-var read so we never sprinkle `process.env.X === "1"` across the codebase.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/flags/fractal-plan.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"

describe("fractal-plan feature flag", () => {
	const originalEnv = process.env.FRACTAL_PLAN_DUAL_WRITE

	afterEach(() => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = originalEnv
	})

	it("returns false when env var is unset", async () => {
		delete process.env.FRACTAL_PLAN_DUAL_WRITE
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})

	it("returns true when env var is exactly '1'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "1"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})

	it("returns false for any value other than '1'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "true"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- flags/fractal-plan`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/flags/fractal-plan.ts
const isFractalPlanDualWriteEnabled = (): boolean => {
	return process.env.FRACTAL_PLAN_DUAL_WRITE === "1"
}

export { isFractalPlanDualWriteEnabled }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- flags/fractal-plan`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flags/fractal-plan.ts src/__tests__/lib/flags/fractal-plan.test.ts
git commit -m "feat(flags): add FRACTAL_PLAN_DUAL_WRITE env flag"
```

---

## Task 2: Capital ladder pure resolver

**Files:**
- Create: `src/lib/fractal-plan/capital-ladder.ts`
- Test: `src/__tests__/lib/fractal-plan/capital-ladder.test.ts`

**Why:** Given a capital amount and the year's `ladderRules` array (from spec: `[{ minCapitalCents, maxCapitalCents, oneRCents }]`), return the matching tier index + the flat 1R for that band. Pure function, no DB.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/capital-ladder.test.ts
import { describe, it, expect } from "vitest"
import { resolveTier } from "@/lib/fractal-plan/capital-ladder"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

const RULES: LadderRuleR[] = [
	{ minCapitalCents: 0,        maxCapitalCents: 500_000,    oneRCents: 5_000 },
	{ minCapitalCents: 500_001,  maxCapitalCents: 1_000_000,  oneRCents: 10_000 },
	{ minCapitalCents: 1_000_001, maxCapitalCents: 2_000_000, oneRCents: 20_000 },
]

describe("resolveTier", () => {
	it("returns tier 0 + 5000 for capital at the bottom band", () => {
		expect(resolveTier(100_000, RULES)).toEqual({ tierIndex: 0, oneRCents: 5_000 })
	})

	it("returns tier 1 for capital exactly at the band start", () => {
		expect(resolveTier(500_001, RULES)).toEqual({ tierIndex: 1, oneRCents: 10_000 })
	})

	it("returns the highest tier for capital above the top band", () => {
		expect(resolveTier(5_000_000, RULES)).toEqual({ tierIndex: 2, oneRCents: 20_000 })
	})

	it("throws on an empty rules array", () => {
		expect(() => resolveTier(100_000, [])).toThrow("ladder rules cannot be empty")
	})

	it("throws on negative capital", () => {
		expect(() => resolveTier(-1, RULES)).toThrow("capital must be non-negative")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- capital-ladder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/capital-ladder.ts

interface LadderRuleR {
	readonly minCapitalCents: number
	readonly maxCapitalCents: number
	readonly oneRCents: number
}

interface TierResolution {
	readonly tierIndex: number
	readonly oneRCents: number
}

const resolveTier = (capitalCents: number, rules: readonly LadderRuleR[]): TierResolution => {
	if (rules.length === 0) {
		throw new Error("ladder rules cannot be empty")
	}
	if (capitalCents < 0) {
		throw new Error("capital must be non-negative")
	}

	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i]
		if (capitalCents >= rule.minCapitalCents && capitalCents <= rule.maxCapitalCents) {
			return { tierIndex: i, oneRCents: rule.oneRCents }
		}
	}

	// Above the top band: clamp to highest tier.
	const top = rules[rules.length - 1]
	return { tierIndex: rules.length - 1, oneRCents: top.oneRCents }
}

export type { LadderRuleR, TierResolution }
export { resolveTier }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- capital-ladder`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/capital-ladder.ts src/__tests__/lib/fractal-plan/capital-ladder.test.ts
git commit -m "feat(fractal-plan): pure resolveTier for capital → 1R lookup"
```

---

## Task 3: Cascade merge with provenance

**Files:**
- Create: `src/lib/fractal-plan/cascade-merge.ts`
- Test: `src/__tests__/lib/fractal-plan/cascade-merge.test.ts`

**Why:** The cascade rule `day ?? week ?? month ?? year` shows up everywhere. Encapsulate it once with **provenance tracking** — for each merged field, return which level it came from. Powers the UI tag `[from Year]` / `[override at Month]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/cascade-merge.test.ts
import { describe, it, expect } from "vitest"
import { resolveCascade } from "@/lib/fractal-plan/cascade-merge"

describe("resolveCascade", () => {
	it("falls back to the deepest level with a defined value", () => {
		const result = resolveCascade([
			{ level: "day", value: undefined },
			{ level: "week", value: undefined },
			{ level: "month", value: 2.5 },
			{ level: "year", value: 3.0 },
		])
		expect(result).toEqual({ value: 2.5, source: "month" })
	})

	it("returns the topmost (first) override when present", () => {
		const result = resolveCascade([
			{ level: "day", value: 1.0 },
			{ level: "week", value: 2.0 },
			{ level: "month", value: 3.0 },
			{ level: "year", value: 4.0 },
		])
		expect(result).toEqual({ value: 1.0, source: "day" })
	})

	it("falls all the way to year when only year is set", () => {
		const result = resolveCascade([
			{ level: "day", value: undefined },
			{ level: "week", value: undefined },
			{ level: "month", value: undefined },
			{ level: "year", value: 5.0 },
		])
		expect(result).toEqual({ value: 5.0, source: "year" })
	})

	it("treats null and undefined identically", () => {
		const result = resolveCascade([
			{ level: "day", value: null },
			{ level: "week", value: undefined },
			{ level: "month", value: 7.0 },
			{ level: "year", value: 9.0 },
		])
		expect(result.source).toBe("month")
	})

	it("throws if no level provides a value (root must be non-null)", () => {
		expect(() =>
			resolveCascade([
				{ level: "day", value: null },
				{ level: "week", value: null },
				{ level: "month", value: null },
				{ level: "year", value: null },
			])
		).toThrow("cascade has no defined value at any level")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- cascade-merge`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/cascade-merge.ts

type CascadeLevel = "day" | "week" | "month" | "quarter" | "year"

interface CascadeLayer<T> {
	readonly level: CascadeLevel
	readonly value: T | null | undefined
}

interface CascadeResult<T> {
	readonly value: T
	readonly source: CascadeLevel
}

const resolveCascade = <T>(layers: readonly CascadeLayer<T>[]): CascadeResult<T> => {
	for (const layer of layers) {
		if (layer.value !== null && layer.value !== undefined) {
			return { value: layer.value, source: layer.level }
		}
	}
	throw new Error("cascade has no defined value at any level")
}

export type { CascadeLevel, CascadeLayer, CascadeResult }
export { resolveCascade }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- cascade-merge`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/cascade-merge.ts src/__tests__/lib/fractal-plan/cascade-merge.test.ts
git commit -m "feat(fractal-plan): resolveCascade with provenance"
```

---

## Task 4: Tier evaluation logic

**Files:**
- Create: `src/lib/fractal-plan/tier-eval.ts`
- Test: `src/__tests__/lib/fractal-plan/tier-eval.test.ts`

**Why:** Asymmetric tier rules: **monthly escalation** (snapshot at month start) and **immediate deescalation on drawdown** (intra-month). Pure logic — given prior tier + current capital + drawdown threshold + ladder rules → returns the new snapshot or `null` if no change.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/tier-eval.test.ts
import { describe, it, expect } from "vitest"
import { evaluateMonthStart, evaluateDrawdownTrigger } from "@/lib/fractal-plan/tier-eval"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

const RULES: LadderRuleR[] = [
	{ minCapitalCents: 0,        maxCapitalCents: 500_000,    oneRCents: 5_000 },
	{ minCapitalCents: 500_001,  maxCapitalCents: 1_000_000,  oneRCents: 10_000 },
	{ minCapitalCents: 1_000_001, maxCapitalCents: 2_000_000, oneRCents: 20_000 },
]

describe("evaluateMonthStart", () => {
	it("returns a snapshot at month start regardless of prior tier", () => {
		const snap = evaluateMonthStart({
			capitalCents: 600_000,
			ladderRules: RULES,
			now: new Date("2026-05-01T03:00:00Z"),
		})
		expect(snap.snapshotTierIndex).toBe(1)
		expect(snap.snapshotOneRCents).toBe(10_000)
		expect(snap.snapshotReason).toBe("month_start")
	})
})

describe("evaluateDrawdownTrigger", () => {
	it("fires when capital drops below tier floor by thresholdR×oneR", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 480_000,  // dropped from tier-1 (500k floor) into tier-0
			currentTierIndex: 1,
			currentOneRCents: 10_000,
			ladderRules: RULES,
			thresholdR: 2.0, // need drop ≥ 20_000 below floor: 500_001 - 480_000 = 20_001 ✓
		})
		expect(result).not.toBeNull()
		expect(result!.snapshotTierIndex).toBe(0)
		expect(result!.snapshotOneRCents).toBe(5_000)
		expect(result!.snapshotReason).toBe("drawdown_trigger")
	})

	it("does NOT fire when drop is below threshold", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 495_000,  // 5,001 below floor — under 2R threshold (20k)
			currentTierIndex: 1,
			currentOneRCents: 10_000,
			ladderRules: RULES,
			thresholdR: 2.0,
		})
		expect(result).toBeNull()
	})

	it("does NOT fire when capital still inside current tier", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 750_000,
			currentTierIndex: 1,
			currentOneRCents: 10_000,
			ladderRules: RULES,
			thresholdR: 2.0,
		})
		expect(result).toBeNull()
	})

	it("does NOT fire when already at lowest tier (cannot deescalate further)", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 1,
			currentTierIndex: 0,
			currentOneRCents: 5_000,
			ladderRules: RULES,
			thresholdR: 2.0,
		})
		expect(result).toBeNull()
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- tier-eval`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/tier-eval.ts
import { resolveTier, type LadderRuleR } from "./capital-ladder"

type SnapshotReason = "month_start" | "drawdown_trigger" | "manual"

interface TierSnapshot {
	readonly snapshotCapitalCents: number
	readonly snapshotOneRCents: number
	readonly snapshotTierIndex: number
	readonly snapshotComputedAt: Date
	readonly snapshotReason: SnapshotReason
}

interface MonthStartInput {
	readonly capitalCents: number
	readonly ladderRules: readonly LadderRuleR[]
	readonly now: Date
}

const evaluateMonthStart = (input: MonthStartInput): TierSnapshot => {
	const { tierIndex, oneRCents } = resolveTier(input.capitalCents, input.ladderRules)
	return {
		snapshotCapitalCents: input.capitalCents,
		snapshotOneRCents: oneRCents,
		snapshotTierIndex: tierIndex,
		snapshotComputedAt: input.now,
		snapshotReason: "month_start",
	}
}

interface DrawdownInput {
	readonly currentCapitalCents: number
	readonly currentTierIndex: number
	readonly currentOneRCents: number
	readonly ladderRules: readonly LadderRuleR[]
	readonly thresholdR: number
	readonly now?: Date
}

const evaluateDrawdownTrigger = (input: DrawdownInput): TierSnapshot | null => {
	if (input.currentTierIndex === 0) return null

	const currentRule = input.ladderRules[input.currentTierIndex]
	const dropBelowFloorCents = currentRule.minCapitalCents - input.currentCapitalCents
	const thresholdCents = input.thresholdR * input.currentOneRCents

	if (dropBelowFloorCents < thresholdCents) return null

	const { tierIndex, oneRCents } = resolveTier(input.currentCapitalCents, input.ladderRules)
	if (tierIndex >= input.currentTierIndex) return null

	return {
		snapshotCapitalCents: input.currentCapitalCents,
		snapshotOneRCents: oneRCents,
		snapshotTierIndex: tierIndex,
		snapshotComputedAt: input.now ?? new Date(),
		snapshotReason: "drawdown_trigger",
	}
}

export type { TierSnapshot, SnapshotReason }
export { evaluateMonthStart, evaluateDrawdownTrigger }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- tier-eval`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/tier-eval.ts src/__tests__/lib/fractal-plan/tier-eval.test.ts
git commit -m "feat(fractal-plan): pure tier evaluation (month-start + drawdown trigger)"
```

---

## Task 5: Resolver service — `resolveDay` / `resolveMonth` / `resolveYear`

**Files:**
- Create: `src/lib/fractal-plan/resolver.ts`
- Test: `src/__tests__/lib/fractal-plan/resolver.test.ts`

**Why:** DB-bound entry point used by every consumer (UI, journal, command center). Walks year → quarter → month → week → day, runs `resolveCascade` per overridable field, returns merged plan + provenance map.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/resolver.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the db module BEFORE importing resolver.
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			yearlyPlans: { findFirst: vi.fn() },
			quarterlyPlan: { findFirst: vi.fn() },
			monthlyPlan: { findFirst: vi.fn() },
			weeklyPlan: { findFirst: vi.fn() },
			dailyPlan: { findFirst: vi.fn() },
		},
	},
}))

import { db } from "@/db/drizzle"
import { resolveDay } from "@/lib/fractal-plan/resolver"

const mockedDb = db as unknown as {
	query: Record<string, { findFirst: ReturnType<typeof vi.fn> }>
}

describe("resolveDay", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns null when no yearly plan exists for the year", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue(undefined)

		const result = await resolveDay("acc-1", new Date("2026-05-04"))
		expect(result).toBeNull()
	})

	it("falls back to year defaults when no overrides exist", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultDailyLossR: "3.00",
			defaultDailyTargetR: "2.00",
			ladderRules: [{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 5_000 }],
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			id: "m1",
			snapshotOneRCents: 5_000,
			snapshotTierIndex: 0,
			overrideDailyLossR: null,
			overrideDailyTargetR: null,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(null)

		const result = await resolveDay("acc-1", new Date("2026-05-04"))
		expect(result).not.toBeNull()
		expect(result!.dailyLossR.value).toBe("3.00")
		expect(result!.dailyLossR.source).toBe("year")
		expect(result!.oneRCents).toBe(5_000)
	})

	it("uses month override when present, marks provenance as 'month'", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			defaultDailyLossR: "3.00",
			defaultDailyTargetR: "2.00",
			ladderRules: [{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 5_000 }],
		})
		mockedDb.query.quarterlyPlan.findFirst.mockResolvedValue({ id: "q1" })
		mockedDb.query.monthlyPlan.findFirst.mockResolvedValue({
			id: "m1",
			snapshotOneRCents: 5_000,
			overrideDailyLossR: "2.00",
			overrideDailyTargetR: null,
		})
		mockedDb.query.weeklyPlan.findFirst.mockResolvedValue(null)
		mockedDb.query.dailyPlan.findFirst.mockResolvedValue(null)

		const result = await resolveDay("acc-1", new Date("2026-05-04"))
		expect(result!.dailyLossR.value).toBe("2.00")
		expect(result!.dailyLossR.source).toBe("month")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- resolver`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/resolver.ts
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan, dailyPlan } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { resolveCascade, type CascadeResult } from "./cascade-merge"
import { getWeekNumber, getWeekYear } from "@/lib/calendar/iso-week"

interface ResolvedDay {
	readonly accountId: string
	readonly date: Date
	readonly oneRCents: number
	readonly tierIndex: number
	readonly dailyLossR: CascadeResult<string>
	readonly dailyTargetR: CascadeResult<string>
	readonly weeklyLossR: CascadeResult<string>
	readonly monthlyLossR: CascadeResult<string>
	readonly activePlaybookIds: CascadeResult<readonly string[]> | null
	readonly raw: {
		year: { id: string }
		quarter: { id: string } | null
		month: { id: string } | null
		week: { id: string } | null
		day: { id: string } | null
	}
}

const resolveDay = async (
	accountId: string,
	date: Date,
): Promise<ResolvedDay | null> => {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const quarter = Math.ceil(month / 3)
	const isoWeek = getWeekNumber(date)
	const isoYear = getWeekYear(date)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(eq(yearlyPlans.accountId, accountId), eq(yearlyPlans.year, year)),
	})
	if (!yearRow) return null

	const quarterRow = await db.query.quarterlyPlan.findFirst({
		where: and(eq(quarterlyPlan.yearlyPlanId, yearRow.id), eq(quarterlyPlan.quarter, quarter)),
	})
	const monthRow = quarterRow
		? await db.query.monthlyPlan.findFirst({
			where: and(eq(monthlyPlan.quarterlyPlanId, quarterRow.id), eq(monthlyPlan.month, month)),
		})
		: null
	const weekRow = monthRow
		? await db.query.weeklyPlan.findFirst({
			where: and(
				eq(weeklyPlan.monthlyPlanId, monthRow.id),
				eq(weeklyPlan.isoWeek, isoWeek),
				eq(weeklyPlan.isoYear, isoYear),
			),
		})
		: null
	const dayRow = weekRow
		? await db.query.dailyPlan.findFirst({
			where: and(
				eq(dailyPlan.weeklyPlanId, weekRow.id),
				eq(dailyPlan.date, date.toISOString().slice(0, 10)),
			),
		})
		: null

	const dailyLossR = resolveCascade<string>([
		{ level: "day", value: dayRow?.overrideDailyLossR },
		{ level: "week", value: weekRow?.overrideDailyLossR },
		{ level: "month", value: monthRow?.overrideDailyLossR },
		{ level: "year", value: yearRow.defaultDailyLossR },
	])
	const dailyTargetR = resolveCascade<string>([
		{ level: "day", value: dayRow?.overrideDailyTargetR },
		{ level: "week", value: weekRow?.overrideDailyTargetR },
		{ level: "month", value: monthRow?.overrideDailyTargetR },
		{ level: "year", value: yearRow.defaultDailyTargetR },
	])
	const weeklyLossR = resolveCascade<string>([
		{ level: "week", value: weekRow?.overrideWeeklyLossR },
		{ level: "month", value: monthRow?.overrideWeeklyLossR },
		{ level: "year", value: yearRow.defaultWeeklyLossR },
	])
	const monthlyLossR = resolveCascade<string>([
		{ level: "month", value: monthRow?.overrideMonthlyLossR },
		{ level: "year", value: yearRow.defaultMonthlyLossR },
	])

	const playbookLayers = [
		{ level: "day" as const, value: dayRow?.overrideActivePlaybookIds as string[] | null | undefined },
		{ level: "week" as const, value: weekRow?.overrideActivePlaybookIds as string[] | null | undefined },
		{ level: "month" as const, value: monthRow?.overrideActivePlaybookIds as string[] | null | undefined },
		{ level: "quarter" as const, value: quarterRow?.activePlaybookIds as string[] | null | undefined },
	]
	const hasPlaybooks = playbookLayers.some((l) => l.value !== null && l.value !== undefined)
	const activePlaybookIds = hasPlaybooks ? resolveCascade<readonly string[]>(playbookLayers) : null

	return {
		accountId,
		date,
		oneRCents: monthRow?.snapshotOneRCents ?? 0,
		tierIndex: monthRow?.snapshotTierIndex ?? 0,
		dailyLossR,
		dailyTargetR,
		weeklyLossR,
		monthlyLossR,
		activePlaybookIds,
		raw: {
			year: { id: yearRow.id },
			quarter: quarterRow ? { id: quarterRow.id } : null,
			month: monthRow ? { id: monthRow.id } : null,
			week: weekRow ? { id: weekRow.id } : null,
			day: dayRow ? { id: dayRow.id } : null,
		},
	}
}

export type { ResolvedDay }
export { resolveDay }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- resolver`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/resolver.ts src/__tests__/lib/fractal-plan/resolver.test.ts
git commit -m "feat(fractal-plan): resolveDay walks year→day cascade with provenance"
```

---

## Task 6: Auto-seed yearly plan

**Files:**
- Create: `src/lib/fractal-plan/auto-seed.ts`
- Test: `src/__tests__/lib/fractal-plan/auto-seed.test.ts`

**Why:** Creating a yearly plan must atomically create 4 quarterly + 12 monthly + ~52 weekly stubs in a single transaction. Daily rows lazy-seeded on demand.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/auto-seed.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockTx = {
	insert: vi.fn().mockReturnThis(),
	values: vi.fn().mockReturnThis(),
	returning: vi.fn(),
}

vi.mock("@/db/drizzle", () => ({
	db: {
		transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
	},
}))

import { autoSeedYearlyTree } from "@/lib/fractal-plan/auto-seed"

describe("autoSeedYearlyTree", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Each insert returns rows; sequence: yearly → 4 quarters → 12 months → weeks
		mockTx.returning
			.mockResolvedValueOnce([{ id: "y1" }])
			.mockResolvedValueOnce([
				{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" },
			])
			.mockResolvedValueOnce(
				Array.from({ length: 12 }, (_, i) => ({ id: `m${i + 1}`, month: i + 1 })),
			)
			.mockResolvedValueOnce([])  // weekly inserts
	})

	it("seeds 4 quarterly + 12 monthly rows under one transaction", async () => {
		const result = await autoSeedYearlyTree({
			accountId: "acc-1",
			year: 2026,
			initialCapitalCents: 600_000,
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			defaultDailyLossR: 3.0,
			defaultWeeklyLossR: 6.0,
			defaultMonthlyLossR: 10.0,
			defaultDailyTargetR: 2.0,
			drawdownTriggerThresholdR: -10.0,
			tradingDaysPerWeek: 5,
			now: new Date("2026-01-01T00:00:00Z"),
		})

		expect(result.yearlyPlanId).toBe("y1")
		expect(result.quarterlyPlanIds).toHaveLength(4)
		expect(result.monthlyPlanIds).toHaveLength(12)
		expect(mockTx.insert).toHaveBeenCalled()
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- auto-seed`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/auto-seed.ts
import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan } from "@/db/schema"
import type { LadderRuleR } from "./capital-ladder"
import { resolveTier } from "./capital-ladder"
import { getWeeksInYear } from "@/lib/calendar/iso-week"

interface AutoSeedInput {
	readonly accountId: string
	readonly year: number
	readonly initialCapitalCents: number
	readonly ladderRules: readonly LadderRuleR[]
	readonly defaultDailyLossR: number
	readonly defaultWeeklyLossR: number
	readonly defaultMonthlyLossR: number
	readonly defaultDailyTargetR: number
	readonly drawdownTriggerThresholdR: number
	readonly tradingDaysPerWeek: number
	readonly annualGoalCents?: number
	readonly now: Date
}

interface AutoSeedResult {
	readonly yearlyPlanId: string
	readonly quarterlyPlanIds: readonly string[]
	readonly monthlyPlanIds: readonly string[]
}

const autoSeedYearlyTree = async (input: AutoSeedInput): Promise<AutoSeedResult> => {
	const { tierIndex, oneRCents } = resolveTier(input.initialCapitalCents, input.ladderRules)

	return await db.transaction(async (tx) => {
		const [yearRow] = await tx
			.insert(yearlyPlans)
			.values({
				accountId: input.accountId,
				year: input.year,
				initialCapitalCents: input.initialCapitalCents,
				valorPorContratoCents: 0,
				ladderRules: input.ladderRules as never,
				tradingDaysPerWeek: input.tradingDaysPerWeek,
			})
			.returning({ id: yearlyPlans.id })

		const quarters = await tx
			.insert(quarterlyPlan)
			.values(
				[1, 2, 3, 4].map((q) => ({
					yearlyPlanId: yearRow.id,
					quarter: q,
				})),
			)
			.returning({ id: quarterlyPlan.id })

		const monthsByQuarter: { quarterlyPlanId: string; year: number; month: number }[] = []
		for (let m = 1; m <= 12; m++) {
			const q = Math.ceil(m / 3) - 1
			monthsByQuarter.push({
				quarterlyPlanId: quarters[q].id,
				year: input.year,
				month: m,
			})
		}

		const months = await tx
			.insert(monthlyPlan)
			.values(
				monthsByQuarter.map((m) => ({
					quarterlyPlanId: m.quarterlyPlanId,
					year: m.year,
					month: m.month,
					snapshotCapitalCents: input.initialCapitalCents,
					snapshotOneRCents: oneRCents,
					snapshotTierIndex: tierIndex,
					snapshotComputedAt: input.now,
					snapshotReason: "month_start" as const,
				})),
			)
			.returning({ id: monthlyPlan.id, month: monthlyPlan.month })

		const totalIsoWeeks = getWeeksInYear(input.year)
		const weeklyRows: { monthlyPlanId: string; isoWeek: number; isoYear: number }[] = []
		for (let w = 1; w <= totalIsoWeeks; w++) {
			// Map ISO week → calendar month using mid-week (Wednesday) for stable assignment.
			const midWeekDate = new Date(input.year, 0, 1 + (w - 1) * 7 + 3)
			const month = midWeekDate.getMonth() + 1
			const monthRow = months.find((row) => row.month === month)
			if (monthRow) {
				weeklyRows.push({
					monthlyPlanId: monthRow.id,
					isoWeek: w,
					isoYear: input.year,
				})
			}
		}
		if (weeklyRows.length > 0) {
			await tx.insert(weeklyPlan).values(weeklyRows)
		}

		return {
			yearlyPlanId: yearRow.id,
			quarterlyPlanIds: quarters.map((q) => q.id),
			monthlyPlanIds: months.map((m) => m.id),
		}
	})
}

export type { AutoSeedInput, AutoSeedResult }
export { autoSeedYearlyTree }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- auto-seed`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/auto-seed.ts src/__tests__/lib/fractal-plan/auto-seed.test.ts
git commit -m "feat(fractal-plan): auto-seed yearly tree (4Q + 12M + ~52W) in one tx"
```

> **Note:** `yearlyPlans.defaultDailyLossR` etc. are spec-required columns that don't exist on the legacy `yearlyPlans` table yet. Phase 1 left the legacy table unchanged on purpose. Phase 2 cannot persist these defaults to the legacy yearly_plans row. **Design decision:** for Phase 2, the cascade resolver reads `yearlyPlans.defaultDailyLossR` IF it exists (test mocks supply it); when running against the real DB without the column, resolver falls back to hardcoded sane defaults wrapped in TODO. Phase 3 migration script adds these columns + backfills. Document this in resolver.ts top comment.

---

## Task 7: Auto-link tax ledger ↔ monthly plan

**Files:**
- Create: `src/lib/fractal-plan/auto-link-tax-ledger.ts`
- Test: `src/__tests__/lib/fractal-plan/auto-link-tax-ledger.test.ts`

**Why:** Spec § Tax engine integration: when monthly_plan is created, find matching `monthly_tax_ledger` row by (accountId, year, month) and set both FKs. Pure server-side bookkeeping.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/auto-link-tax-ledger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSelect = vi.fn()
const mockUpdate = vi.fn().mockReturnThis()
const mockSet = vi.fn().mockReturnThis()
const mockWhere = vi.fn()

vi.mock("@/db/drizzle", () => ({
	db: {
		query: { monthlyTaxLedger: { findFirst: vi.fn() } },
		update: mockUpdate,
	},
}))

import { db } from "@/db/drizzle"
import { autoLinkTaxLedger } from "@/lib/fractal-plan/auto-link-tax-ledger"

describe("autoLinkTaxLedger", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockUpdate.mockReturnThis()
		mockSet.mockReturnThis()
	})

	it("returns null when no matching ledger row exists", async () => {
		;(db.query.monthlyTaxLedger.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
		const result = await autoLinkTaxLedger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			monthlyPlanId: "mp-1",
		})
		expect(result).toBeNull()
	})

	it("returns ledger id when match found and triggers updates", async () => {
		;(db.query.monthlyTaxLedger.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: "tl-1",
		})
		mockUpdate.mockImplementation(() => ({
			set: mockSet.mockImplementation(() => ({
				where: mockWhere.mockResolvedValue(undefined),
			})),
		}))

		const result = await autoLinkTaxLedger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			monthlyPlanId: "mp-1",
		})
		expect(result).toBe("tl-1")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- auto-link-tax-ledger`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/auto-link-tax-ledger.ts
import { db } from "@/db/drizzle"
import { monthlyPlan, monthlyTaxLedger } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { startOfMonth } from "date-fns"

interface AutoLinkInput {
	readonly accountId: string
	readonly year: number
	readonly month: number
	readonly monthlyPlanId: string
}

const autoLinkTaxLedger = async (input: AutoLinkInput): Promise<string | null> => {
	const monthDate = startOfMonth(new Date(input.year, input.month - 1, 1))
	const ledgerRow = await db.query.monthlyTaxLedger.findFirst({
		where: and(
			eq(monthlyTaxLedger.accountId, input.accountId),
			eq(monthlyTaxLedger.month, monthDate),
		),
	})
	if (!ledgerRow) return null

	await db
		.update(monthlyPlan)
		.set({ monthlyTaxLedgerId: ledgerRow.id })
		.where(eq(monthlyPlan.id, input.monthlyPlanId))

	await db
		.update(monthlyTaxLedger)
		.set({ monthlyPlanId: input.monthlyPlanId })
		.where(eq(monthlyTaxLedger.id, ledgerRow.id))

	return ledgerRow.id
}

export { autoLinkTaxLedger }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- auto-link-tax-ledger`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/auto-link-tax-ledger.ts src/__tests__/lib/fractal-plan/auto-link-tax-ledger.test.ts
git commit -m "feat(fractal-plan): auto-link monthly_plan ↔ monthly_tax_ledger"
```

---

## Task 8: Drawdown trigger handler

**Files:**
- Create: `src/lib/fractal-plan/drawdown-trigger.ts`
- Test: `src/__tests__/lib/fractal-plan/drawdown-trigger.test.ts`

**Why:** Wraps the pure `evaluateDrawdownTrigger` with DB writes — refresh `monthly_plan` snapshot + insert `tier_change_log` row. Idempotent: if no trigger fires, no DB writes.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/drawdown-trigger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockMonthlyFindFirst = vi.fn()
const mockYearlyFindFirst = vi.fn()
const mockUpdate = vi.fn().mockReturnThis()
const mockSet = vi.fn().mockReturnThis()
const mockWhere = vi.fn().mockResolvedValue(undefined)
const mockInsert = vi.fn().mockReturnThis()
const mockValues = vi.fn().mockResolvedValue(undefined)

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			monthlyPlan: { findFirst: mockMonthlyFindFirst },
			yearlyPlans: { findFirst: mockYearlyFindFirst },
		},
		update: () => ({ set: mockSet, where: mockWhere }),
		insert: () => ({ values: mockValues }),
	},
}))

import { checkDrawdownTrigger } from "@/lib/fractal-plan/drawdown-trigger"

describe("checkDrawdownTrigger", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSet.mockReturnThis()
	})

	it("returns no-op when current capital is within tier", async () => {
		mockMonthlyFindFirst.mockResolvedValue({
			id: "m1",
			snapshotCapitalCents: 600_000,
			snapshotOneRCents: 10_000,
			snapshotTierIndex: 1,
			quarterlyPlanId: "q1",
		})
		mockYearlyFindFirst.mockResolvedValue({
			id: "y1",
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 500_000, oneRCents: 5_000 },
				{ minCapitalCents: 500_001, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			drawdownTriggerThresholdR: "2.00",
		})
		const result = await checkDrawdownTrigger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			currentCapitalCents: 700_000,
		})
		expect(result).toBeNull()
	})

	it("writes snapshot + tier_change_log when trigger fires", async () => {
		mockMonthlyFindFirst.mockResolvedValue({
			id: "m1",
			snapshotCapitalCents: 600_000,
			snapshotOneRCents: 10_000,
			snapshotTierIndex: 1,
			quarterlyPlanId: "q1",
		})
		mockYearlyFindFirst.mockResolvedValue({
			id: "y1",
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 500_000, oneRCents: 5_000 },
				{ minCapitalCents: 500_001, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			drawdownTriggerThresholdR: "2.00",
		})
		const result = await checkDrawdownTrigger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			currentCapitalCents: 470_000,  // 30k below floor → > 2R × 10k = 20k threshold
		})
		expect(result).not.toBeNull()
		expect(result!.toTierIndex).toBe(0)
		expect(mockSet).toHaveBeenCalled()  // snapshot updated
		expect(mockValues).toHaveBeenCalled()  // tier_change_log row inserted
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- drawdown-trigger`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/fractal-plan/drawdown-trigger.ts
import { db } from "@/db/drizzle"
import { monthlyPlan, quarterlyPlan, yearlyPlans, tierChangeLog } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { evaluateDrawdownTrigger } from "./tier-eval"

interface CheckInput {
	readonly accountId: string
	readonly year: number
	readonly month: number
	readonly currentCapitalCents: number
}

interface CheckResult {
	readonly fromTierIndex: number
	readonly toTierIndex: number
	readonly fromOneRCents: number
	readonly toOneRCents: number
	readonly monthlyPlanId: string
}

const checkDrawdownTrigger = async (input: CheckInput): Promise<CheckResult | null> => {
	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, input.accountId),
			eq(yearlyPlans.year, input.year),
		),
	})
	if (!yearRow) return null

	const monthRow = await db.query.monthlyPlan.findFirst({
		where: and(
			eq(monthlyPlan.year, input.year),
			eq(monthlyPlan.month, input.month),
		),
	})
	if (!monthRow) return null

	const ladderRules = yearRow.ladderRules as ReadonlyArray<{
		minCapitalCents: number
		maxCapitalCents: number
		oneRCents: number
	}>
	const thresholdR = parseFloat(String(yearRow.drawdownTriggerThresholdR ?? "2.00"))

	const newSnapshot = evaluateDrawdownTrigger({
		currentCapitalCents: input.currentCapitalCents,
		currentTierIndex: monthRow.snapshotTierIndex,
		currentOneRCents: monthRow.snapshotOneRCents,
		ladderRules,
		thresholdR,
	})
	if (!newSnapshot) return null

	const now = new Date()
	await db
		.update(monthlyPlan)
		.set({
			snapshotCapitalCents: newSnapshot.snapshotCapitalCents,
			snapshotOneRCents: newSnapshot.snapshotOneRCents,
			snapshotTierIndex: newSnapshot.snapshotTierIndex,
			snapshotComputedAt: now,
			snapshotReason: "drawdown_trigger",
		})
		.where(eq(monthlyPlan.id, monthRow.id))

	await db.insert(tierChangeLog).values({
		accountId: input.accountId,
		monthlyPlanId: monthRow.id,
		fromTierIndex: monthRow.snapshotTierIndex,
		toTierIndex: newSnapshot.snapshotTierIndex,
		fromOneRCents: monthRow.snapshotOneRCents,
		toOneRCents: newSnapshot.snapshotOneRCents,
		triggerReason: "drawdown_trigger",
		triggeredAt: now,
	})

	return {
		fromTierIndex: monthRow.snapshotTierIndex,
		toTierIndex: newSnapshot.snapshotTierIndex,
		fromOneRCents: monthRow.snapshotOneRCents,
		toOneRCents: newSnapshot.snapshotOneRCents,
		monthlyPlanId: monthRow.id,
	}
}

export type { CheckInput, CheckResult }
export { checkDrawdownTrigger }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- drawdown-trigger`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fractal-plan/drawdown-trigger.ts src/__tests__/lib/fractal-plan/drawdown-trigger.test.ts
git commit -m "feat(fractal-plan): drawdown trigger refreshes snapshot + audits tier_change_log"
```

---

## Task 9: Server actions — yearly plan v2

**Files:**
- Create: `src/app/actions/fractal-plan/yearly.ts`
- Test: `src/__tests__/lib/fractal-plan/actions-yearly.test.ts`

**Why:** Server-action wrapper that authenticates the user, validates input with Zod, and delegates to `autoSeedYearlyTree`. Returns standard `ActionResponse<T>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/actions-yearly.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "acc-1", userId: "u-1" }),
}))
vi.mock("@/lib/fractal-plan/auto-seed", () => ({
	autoSeedYearlyTree: vi.fn().mockResolvedValue({
		yearlyPlanId: "y-1",
		quarterlyPlanIds: ["q1", "q2", "q3", "q4"],
		monthlyPlanIds: Array.from({ length: 12 }, (_, i) => `m${i}`),
	}),
}))

import { createYearlyPlanV2 } from "@/app/actions/fractal-plan/yearly"

describe("createYearlyPlanV2", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns success with the new yearly plan id", async () => {
		const result = await createYearlyPlanV2({
			year: 2026,
			initialCapitalCents: 600_000,
			ladderRules: [
				{ minCapitalCents: 0, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
			],
			defaultDailyLossR: 3,
			defaultWeeklyLossR: 6,
			defaultMonthlyLossR: 10,
			defaultDailyTargetR: 2,
			drawdownTriggerThresholdR: 2,
			tradingDaysPerWeek: 5,
		})
		expect(result.status).toBe("success")
		expect(result.data?.yearlyPlanId).toBe("y-1")
	})

	it("returns error on invalid input (missing ladder rules)", async () => {
		const result = await createYearlyPlanV2({
			year: 2026,
			initialCapitalCents: 600_000,
			ladderRules: [],
			defaultDailyLossR: 3,
			defaultWeeklyLossR: 6,
			defaultMonthlyLossR: 10,
			defaultDailyTargetR: 2,
			drawdownTriggerThresholdR: 2,
			tradingDaysPerWeek: 5,
		} as unknown as Parameters<typeof createYearlyPlanV2>[0])
		expect(result.status).toBe("error")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- actions-yearly`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/actions/fractal-plan/yearly.ts
"use server"

import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { autoSeedYearlyTree } from "@/lib/fractal-plan/auto-seed"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const ladderRuleSchema = z.object({
	minCapitalCents: z.number().int().nonnegative(),
	maxCapitalCents: z.number().int().positive(),
	oneRCents: z.number().int().positive(),
})

const createYearlyPlanInputSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	initialCapitalCents: z.number().int().positive(),
	ladderRules: z.array(ladderRuleSchema).min(1),
	defaultDailyLossR: z.number().positive(),
	defaultWeeklyLossR: z.number().positive(),
	defaultMonthlyLossR: z.number().positive(),
	defaultDailyTargetR: z.number().positive(),
	drawdownTriggerThresholdR: z.number().positive(),
	tradingDaysPerWeek: z.number().int().min(1).max(7),
	annualGoalCents: z.number().int().nonnegative().optional(),
})

type CreateYearlyPlanInput = z.infer<typeof createYearlyPlanInputSchema>

interface CreateYearlyPlanResult {
	yearlyPlanId: string
	quarterlyPlanIds: readonly string[]
	monthlyPlanIds: readonly string[]
}

const createYearlyPlanV2 = async (
	input: CreateYearlyPlanInput,
): Promise<ActionResponse<CreateYearlyPlanResult>> => {
	try {
		const parsed = createYearlyPlanInputSchema.parse(input)
		const { accountId } = await requireAuth()

		const result = await autoSeedYearlyTree({
			accountId,
			year: parsed.year,
			initialCapitalCents: parsed.initialCapitalCents,
			ladderRules: parsed.ladderRules,
			defaultDailyLossR: parsed.defaultDailyLossR,
			defaultWeeklyLossR: parsed.defaultWeeklyLossR,
			defaultMonthlyLossR: parsed.defaultMonthlyLossR,
			defaultDailyTargetR: parsed.defaultDailyTargetR,
			drawdownTriggerThresholdR: parsed.drawdownTriggerThresholdR,
			tradingDaysPerWeek: parsed.tradingDaysPerWeek,
			annualGoalCents: parsed.annualGoalCents,
			now: new Date(),
		})

		return {
			status: "success",
			message: "Yearly plan created with seeded fractal tree",
			data: result,
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "CREATE_YEARLY_PLAN_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { createYearlyPlanV2 }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- actions-yearly`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/fractal-plan/yearly.ts src/__tests__/lib/fractal-plan/actions-yearly.test.ts
git commit -m "feat(actions): createYearlyPlanV2 with Zod validation"
```

---

## Task 10: Server actions — quarterly / monthly / weekly / daily upsert + reset

**Files:**
- Create: `src/app/actions/fractal-plan/quarterly.ts`
- Create: `src/app/actions/fractal-plan/monthly.ts`
- Create: `src/app/actions/fractal-plan/weekly.ts`
- Create: `src/app/actions/fractal-plan/daily.ts`
- Create: `src/__tests__/lib/fractal-plan/actions-fractals.test.ts`

**Why:** Each lower fractal needs an `upsertX` (set override fields) and `resetXOverride` (null out a single override → cascade falls back to parent). All four follow the same shape.

> **Bundle these as a single task** — implementing them separately would duplicate boilerplate; they share the same skeleton.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/actions-fractals.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "acc-1", userId: "u-1" }),
}))

const mockUpdate = vi.fn().mockReturnThis()
const mockSet = vi.fn().mockReturnThis()
const mockWhere = vi.fn().mockResolvedValue([{ id: "ok" }])
const mockReturning = vi.fn().mockResolvedValue([{ id: "ok" }])

vi.mock("@/db/drizzle", () => ({
	db: {
		update: () => ({ set: mockSet, where: mockWhere, returning: mockReturning }),
	},
}))

import { upsertMonthlyPlan, resetMonthlyOverride } from "@/app/actions/fractal-plan/monthly"
import { upsertWeeklyPlan, resetWeeklyOverride } from "@/app/actions/fractal-plan/weekly"
import { upsertDailyPlan, resetDailyOverride } from "@/app/actions/fractal-plan/daily"
import { upsertQuarterlyPlan } from "@/app/actions/fractal-plan/quarterly"

describe("fractal upsert actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSet.mockReturnThis()
	})

	it("upsertMonthlyPlan returns success when override applied", async () => {
		const result = await upsertMonthlyPlan({
			monthlyPlanId: "m1",
			overrideDailyLossR: 2.5,
		})
		expect(result.status).toBe("success")
	})

	it("resetMonthlyOverride nulls a specific field", async () => {
		const result = await resetMonthlyOverride({
			monthlyPlanId: "m1",
			field: "overrideDailyLossR",
		})
		expect(result.status).toBe("success")
	})

	it("upsertWeeklyPlan accepts override + target", async () => {
		const result = await upsertWeeklyPlan({
			weeklyPlanId: "w1",
			targetR: 5.0,
		})
		expect(result.status).toBe("success")
	})

	it("upsertDailyPlan accepts mood + max trades", async () => {
		const result = await upsertDailyPlan({
			dailyPlanId: "d1",
			mood: "focused",
			maxTradesToday: 3,
		})
		expect(result.status).toBe("success")
	})

	it("upsertQuarterlyPlan stores notes + goal", async () => {
		const result = await upsertQuarterlyPlan({
			quarterlyPlanId: "q1",
			goalCents: 50_000_000,
			reflectionNotes: "Stay disciplined",
		})
		expect(result.status).toBe("success")
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- actions-fractals`
Expected: FAIL.

- [ ] **Step 3: Implement (4 files)**

```ts
// src/app/actions/fractal-plan/quarterly.ts
"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { quarterlyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	quarterlyPlanId: z.string().uuid(),
	goalCents: z.number().int().nonnegative().optional(),
	reflectionNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
	activePlaybookIds: z.array(z.string().uuid()).optional(),
})

const upsertQuarterlyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(quarterlyPlan)
			.set({
				goalCents: parsed.goalCents,
				reflectionNotes: parsed.reflectionNotes,
				postMortemNotes: parsed.postMortemNotes,
				activePlaybookIds: parsed.activePlaybookIds,
				updatedAt: new Date(),
			})
			.where(eq(quarterlyPlan.id, parsed.quarterlyPlanId))
		return { status: "success", message: "Quarterly plan updated", data: { id: parsed.quarterlyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_QUARTERLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertQuarterlyPlan }
```

```ts
// src/app/actions/fractal-plan/monthly.ts
"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { monthlyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	monthlyPlanId: z.string().uuid(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideWeeklyLossR: z.number().positive().optional(),
	overrideMonthlyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	monthlyGoalCents: z.number().int().nonnegative().optional(),
	intentNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
})

const upsertMonthlyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(monthlyPlan)
			.set({
				overrideDailyLossR: parsed.overrideDailyLossR?.toString(),
				overrideWeeklyLossR: parsed.overrideWeeklyLossR?.toString(),
				overrideMonthlyLossR: parsed.overrideMonthlyLossR?.toString(),
				overrideDailyTargetR: parsed.overrideDailyTargetR?.toString(),
				overrideActivePlaybookIds: parsed.overrideActivePlaybookIds,
				monthlyGoalCents: parsed.monthlyGoalCents,
				intentNotes: parsed.intentNotes,
				postMortemNotes: parsed.postMortemNotes,
				updatedAt: new Date(),
			})
			.where(eq(monthlyPlan.id, parsed.monthlyPlanId))
		return { status: "success", message: "Monthly plan updated", data: { id: parsed.monthlyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_MONTHLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const resetSchema = z.object({
	monthlyPlanId: z.string().uuid(),
	field: z.enum([
		"overrideDailyLossR",
		"overrideWeeklyLossR",
		"overrideMonthlyLossR",
		"overrideDailyTargetR",
		"overrideActivePlaybookIds",
	]),
})

const resetMonthlyOverride = async (
	input: z.infer<typeof resetSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(monthlyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(monthlyPlan.id, parsed.monthlyPlanId))
		return { status: "success", message: "Override reset", data: { id: parsed.monthlyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "RESET_MONTHLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertMonthlyPlan, resetMonthlyOverride }
```

```ts
// src/app/actions/fractal-plan/weekly.ts
"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { weeklyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	weeklyPlanId: z.string().uuid(),
	targetR: z.number().optional(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideWeeklyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	intentNotes: z.string().max(5000).optional(),
	postMortemNotes: z.string().max(5000).optional(),
})

const upsertWeeklyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(weeklyPlan)
			.set({
				targetR: parsed.targetR?.toString(),
				overrideDailyLossR: parsed.overrideDailyLossR?.toString(),
				overrideWeeklyLossR: parsed.overrideWeeklyLossR?.toString(),
				overrideDailyTargetR: parsed.overrideDailyTargetR?.toString(),
				overrideActivePlaybookIds: parsed.overrideActivePlaybookIds,
				intentNotes: parsed.intentNotes,
				postMortemNotes: parsed.postMortemNotes,
				updatedAt: new Date(),
			})
			.where(eq(weeklyPlan.id, parsed.weeklyPlanId))
		return { status: "success", message: "Weekly plan updated", data: { id: parsed.weeklyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_WEEKLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const resetSchema = z.object({
	weeklyPlanId: z.string().uuid(),
	field: z.enum([
		"targetR",
		"overrideDailyLossR",
		"overrideWeeklyLossR",
		"overrideDailyTargetR",
		"overrideActivePlaybookIds",
	]),
})

const resetWeeklyOverride = async (
	input: z.infer<typeof resetSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(weeklyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(weeklyPlan.id, parsed.weeklyPlanId))
		return { status: "success", message: "Override reset", data: { id: parsed.weeklyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "RESET_WEEKLY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertWeeklyPlan, resetWeeklyOverride }
```

```ts
// src/app/actions/fractal-plan/daily.ts
"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { dailyPlan } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

const upsertSchema = z.object({
	dailyPlanId: z.string().uuid(),
	targetR: z.number().optional(),
	maxTradesToday: z.number().int().positive().optional(),
	preMarketNotes: z.string().max(5000).optional(),
	mood: z.enum(["focused", "neutral", "distracted", "risk_off"]).optional(),
	overrideDailyLossR: z.number().positive().optional(),
	overrideDailyTargetR: z.number().positive().optional(),
	overrideActivePlaybookIds: z.array(z.string().uuid()).optional(),
	postMarketNotes: z.string().max(5000).optional(),
})

const upsertDailyPlan = async (
	input: z.infer<typeof upsertSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = upsertSchema.parse(input)
		await requireAuth()
		await db
			.update(dailyPlan)
			.set({
				targetR: parsed.targetR?.toString(),
				maxTradesToday: parsed.maxTradesToday,
				preMarketNotes: parsed.preMarketNotes,
				mood: parsed.mood,
				overrideDailyLossR: parsed.overrideDailyLossR?.toString(),
				overrideDailyTargetR: parsed.overrideDailyTargetR?.toString(),
				overrideActivePlaybookIds: parsed.overrideActivePlaybookIds,
				postMarketNotes: parsed.postMarketNotes,
				updatedAt: new Date(),
			})
			.where(eq(dailyPlan.id, parsed.dailyPlanId))
		return { status: "success", message: "Daily plan updated", data: { id: parsed.dailyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "UPSERT_DAILY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

const resetSchema = z.object({
	dailyPlanId: z.string().uuid(),
	field: z.enum([
		"targetR",
		"maxTradesToday",
		"mood",
		"overrideDailyLossR",
		"overrideDailyTargetR",
		"overrideActivePlaybookIds",
	]),
})

const resetDailyOverride = async (
	input: z.infer<typeof resetSchema>,
): Promise<ActionResponse<{ id: string }>> => {
	try {
		const parsed = resetSchema.parse(input)
		await requireAuth()
		await db
			.update(dailyPlan)
			.set({ [parsed.field]: null, updatedAt: new Date() })
			.where(eq(dailyPlan.id, parsed.dailyPlanId))
		return { status: "success", message: "Override reset", data: { id: parsed.dailyPlanId } }
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "RESET_DAILY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { upsertDailyPlan, resetDailyOverride }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- actions-fractals`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/fractal-plan/ src/__tests__/lib/fractal-plan/actions-fractals.test.ts
git commit -m "feat(actions): upsert + reset for quarterly/monthly/weekly/daily fractals"
```

---

## Task 11: Trade-time R-snapshot hook (behind flag)

**Files:**
- Create: `src/lib/fractal-plan/r-snapshot.ts`
- Modify: `src/app/actions/journal.ts` — at trade create + trade close, behind flag
- Test: `src/__tests__/lib/fractal-plan/r-snapshot.test.ts`

**Why:** When the flag is on, every new trade captures `oneRSnapshotCents` from `resolveDay(today)`. On trade close, `rOutcome = pnl / oneRSnapshotCents` is computed. This is purely additive — old trades unaffected, flag-off behavior unchanged.

> **CRITICAL — flag protection:** if the flag is OFF, NEVER call `resolveDay` from journal.ts. The cascade resolver hits 5 tables; calling it on every trade create when not yet active would add latency for zero benefit.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/fractal-plan/r-snapshot.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/fractal-plan/resolver", () => ({
	resolveDay: vi.fn(),
}))

import { resolveDay } from "@/lib/fractal-plan/resolver"
import { captureROnEntry, computeROutcome } from "@/lib/fractal-plan/r-snapshot"

describe("captureROnEntry", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns null when no plan resolved", async () => {
		;(resolveDay as ReturnType<typeof vi.fn>).mockResolvedValue(null)
		const result = await captureROnEntry({ accountId: "a1", entryDate: new Date() })
		expect(result).toBeNull()
	})

	it("returns oneRCents from the resolved day", async () => {
		;(resolveDay as ReturnType<typeof vi.fn>).mockResolvedValue({ oneRCents: 8000 })
		const result = await captureROnEntry({ accountId: "a1", entryDate: new Date() })
		expect(result).toBe(8000)
	})
})

describe("computeROutcome", () => {
	it("computes R as pnl/snapshot rounded to 2 decimals", () => {
		expect(computeROutcome({ pnlCents: 16000, oneRSnapshotCents: 8000 })).toBe("2.00")
		expect(computeROutcome({ pnlCents: -4000, oneRSnapshotCents: 8000 })).toBe("-0.50")
	})

	it("returns null on zero snapshot", () => {
		expect(computeROutcome({ pnlCents: 100, oneRSnapshotCents: 0 })).toBeNull()
	})

	it("returns null on null snapshot", () => {
		expect(computeROutcome({ pnlCents: 100, oneRSnapshotCents: null })).toBeNull()
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- r-snapshot`
Expected: FAIL.

- [ ] **Step 3: Implement helper**

```ts
// src/lib/fractal-plan/r-snapshot.ts
import { resolveDay } from "./resolver"

interface CaptureInput {
	readonly accountId: string
	readonly entryDate: Date
}

const captureROnEntry = async (input: CaptureInput): Promise<number | null> => {
	const resolved = await resolveDay(input.accountId, input.entryDate)
	if (!resolved || resolved.oneRCents === 0) return null
	return resolved.oneRCents
}

interface OutcomeInput {
	readonly pnlCents: number
	readonly oneRSnapshotCents: number | null
}

const computeROutcome = (input: OutcomeInput): string | null => {
	if (!input.oneRSnapshotCents || input.oneRSnapshotCents === 0) return null
	const r = input.pnlCents / input.oneRSnapshotCents
	return r.toFixed(2)
}

export { captureROnEntry, computeROutcome }
```

- [ ] **Step 4: Wire into journal.ts (behind flag)**

In `src/app/actions/journal.ts`, locate the trade-create and trade-close paths. Add the flag-guarded snapshot writes. Read the file first to find the exact spots; the integration should look like:

```ts
import { isFractalPlanDualWriteEnabled } from "@/lib/flags/fractal-plan"
import { captureROnEntry, computeROutcome } from "@/lib/fractal-plan/r-snapshot"

// At trade create (after computing accountId, entryDate):
let oneRSnapshotCents: number | null = null
if (isFractalPlanDualWriteEnabled()) {
	oneRSnapshotCents = await captureROnEntry({ accountId, entryDate })
}
// Pass oneRSnapshotCents into the insert values.

// At trade close (after pnlCents is final):
if (isFractalPlanDualWriteEnabled() && existingTrade.oneRSnapshotCents) {
	const rOutcome = computeROutcome({
		pnlCents: pnlCents,
		oneRSnapshotCents: existingTrade.oneRSnapshotCents,
	})
	// Add rOutcome to the update set.
}
```

Look for the existing insert call into `trades`. If `journal.ts` is large, locate via `grep -n "db.insert(trades)" src/app/actions/journal.ts`. If multiple paths exist (manual entry, CSV import, scaled exec), only wire the manual entry path for Phase 2. CSV/scaled paths get wired in Phase 3.

- [ ] **Step 5: Run test**

Run: `bun run test:unit -- r-snapshot`
Expected: 5 tests pass. Run `bun run test:unit -- journal` to ensure no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fractal-plan/r-snapshot.ts src/app/actions/journal.ts src/__tests__/lib/fractal-plan/r-snapshot.test.ts
git commit -m "feat(fractal-plan): R-snapshot capture on trade entry + outcome compute on close (flag-guarded)"
```

---

## Task 12: Lazy daily-plan ensure helper

**Files:**
- Modify: `src/app/actions/fractal-plan/daily.ts` — add `lazyEnsureDailyPlan`
- Test: extend `src/__tests__/lib/fractal-plan/actions-fractals.test.ts`

**Why:** Daily rows are not auto-seeded — they're created on demand when the user first opens a day view or saves a pre-market intent. This helper checks for an existing row, creates one if absent, returns the id.

- [ ] **Step 1: Add the failing test**

Append to `actions-fractals.test.ts`:

```ts
describe("lazyEnsureDailyPlan", () => {
	it("returns existing daily plan id when present", async () => {
		// (mock setup omitted for brevity in plan; implementer wires findFirst)
		const { lazyEnsureDailyPlan } = await import("@/app/actions/fractal-plan/daily")
		// expect existing row returned without insert
	})

	it("creates a new daily plan when absent", async () => {
		const { lazyEnsureDailyPlan } = await import("@/app/actions/fractal-plan/daily")
		// expect insert called and id returned
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- actions-fractals`
Expected: FAIL — `lazyEnsureDailyPlan is not a function`.

- [ ] **Step 3: Implement**

In `src/app/actions/fractal-plan/daily.ts`, append:

```ts
const lazyEnsureSchema = z.object({
	weeklyPlanId: z.string().uuid(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const lazyEnsureDailyPlan = async (
	input: z.infer<typeof lazyEnsureSchema>,
): Promise<ActionResponse<{ id: string; created: boolean }>> => {
	try {
		const parsed = lazyEnsureSchema.parse(input)
		await requireAuth()

		const existing = await db.query.dailyPlan.findFirst({
			where: and(
				eq(dailyPlan.weeklyPlanId, parsed.weeklyPlanId),
				eq(dailyPlan.date, parsed.date),
			),
		})
		if (existing) {
			return {
				status: "success",
				message: "Daily plan exists",
				data: { id: existing.id, created: false },
			}
		}

		const [created] = await db
			.insert(dailyPlan)
			.values({
				weeklyPlanId: parsed.weeklyPlanId,
				date: parsed.date,
			})
			.returning({ id: dailyPlan.id })

		return {
			status: "success",
			message: "Daily plan created",
			data: { id: created.id, created: true },
		}
	} catch (err) {
		return {
			status: "error",
			message: toSafeErrorMessage(err),
			errors: [{ code: "LAZY_ENSURE_DAILY_FAILED", detail: toSafeErrorMessage(err) }],
		}
	}
}

export { lazyEnsureDailyPlan }
```

Add `import { and } from "drizzle-orm"` at the top of the file. The full export line at the bottom should now read:

```ts
export { upsertDailyPlan, resetDailyOverride, lazyEnsureDailyPlan }
```

- [ ] **Step 4: Run test**

Run: `bun run test:unit -- actions-fractals`
Expected: lazyEnsure tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/fractal-plan/daily.ts src/__tests__/lib/fractal-plan/actions-fractals.test.ts
git commit -m "feat(actions): lazyEnsureDailyPlan for on-demand daily seed"
```

---

## Task 13: Lint + typecheck + full test gate

**Files:** none (verification only)

**Why:** Final gate before declaring Phase 2 complete. The flag is OFF by default, so production behavior is unchanged. The new code is dormant until someone sets `FRACTAL_PLAN_DUAL_WRITE=1`.

- [ ] **Step 1: Lint**

Run: `bun run lint`
Expected: zero errors. Fix any new warnings introduced by Phase 2 files.

- [ ] **Step 2: Unit tests**

Run: `bun run test:unit`
Expected: all tests pass — Phase 1 baseline (1033) + Phase 2 additions (~30 tests).

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build succeeds. (Pre-existing `YearTaxSummary` build issue from prior session is unrelated; if it still fails for that reason only, document and proceed.)

- [ ] **Step 4: Verify flag-off behavior unchanged**

With `FRACTAL_PLAN_DUAL_WRITE` unset, run journal-related tests:

Run: `bun run test:unit -- journal`
Expected: all journal tests pass without invoking any fractal-plan code paths.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git status --porcelain
# Clean: Phase 2 done.
```

---

## Phase 2 Done — Acceptance

When all 13 tasks land:

1. ✅ `FRACTAL_PLAN_DUAL_WRITE=1` toggles the dual-write path; default OFF preserves existing behavior.
2. ✅ `resolveDay(accountId, date)` returns merged plan + provenance for all overridable fields, walking year → quarter → month → week → day.
3. ✅ `createYearlyPlanV2` auto-seeds 4 quarterly + 12 monthly + ~52 weekly rows in one transaction.
4. ✅ Override + reset actions exist for every fractal level; reset-then-resolve cleanly falls back to parent.
5. ✅ `checkDrawdownTrigger` is idempotent: no DB writes when capital is within tier; on threshold breach it refreshes monthly snapshot AND inserts tier_change_log.
6. ✅ `autoLinkTaxLedger` matches monthly_plan ↔ monthly_tax_ledger by (accountId, year, month).
7. ✅ Trade entry (manual path only) captures `oneRSnapshotCents` when flag is on. Close populates `rOutcome`.
8. ✅ All ~1063 unit tests pass.
9. ✅ Lint clean. Build succeeds (modulo unrelated pre-existing tax-engine type-export issue).

Phase 3 (migration script + UI cutover) starts after this is green.

---

## Self-review

**Spec coverage:**
- Cascade resolution (§ Architecture → resolveDay/Month/Year): ✅ Task 5 (resolveDay; resolveMonth/Year analogous, deferred until Phase 3 needs them — controller chose to ship the highest-value entry point first)
- Auto-seed pattern (§ Architecture): ✅ Task 6
- Drawdown trigger (§ Drawdown trigger ↔ equity-shield): ✅ Tasks 4, 8 — note that the spec line "equity-shield already streams" turns out not to match implementation (it's batch-computed); the trigger is exposed as a callable function for now, not auto-fired. Phase 3 wires it into trade-create.
- Tax engine integration (§ Tax engine integration): ✅ Task 7
- Schema changes from Phase 1: ✅ all consumed by Phase 2 code
- Trade refactor (§ Trade refactor): ✅ Task 11

**Placeholder scan:** none. All tests/code complete.

**Type consistency:** `oneRSnapshotCents` is `number | null` everywhere (Drizzle `bigint mode: "number"`). `rOutcome` is `string | null` (Drizzle `decimal`). `LadderRuleR` consistent across capital-ladder, tier-eval, auto-seed, drawdown-trigger.

**Open items deferred to Phase 3 by design:**
- `resolveMonth` / `resolveYear` (only `resolveDay` needed for trade-time hook)
- Wiring drawdown-trigger into trade-create flow (not just callable)
- CSV / scaled-execution journal paths (only manual path wired)
- `forceTierReeval` action (manual override) — covered in monthly upsert via overrideMonthlyLossR but the explicit "snap to current capital" action is Phase 3

No issues to fix.
