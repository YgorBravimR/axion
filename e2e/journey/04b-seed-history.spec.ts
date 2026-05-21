import { test, expect } from "../fixtures/base"
import { BRAVO } from "./fixtures/bravo-seed"
import { seedBravoHistory } from "./helpers/seed-bravo-history"
import { seedBravoQuarterlyPlan } from "./helpers/seed-bravo-quarterly-plan"
import { loadStageState } from "./helpers/storage-state"

const PLAN_YEAR = 2026

/**
 * Stage 4b — Multi-month history seeder.
 *
 * Runs between Stage 4 (Bravo's first journaled trade) and Stage 5
 * (Weekly Reflection). Inserts ~25 prior-month trades against Bravo's
 * primary account so Stages 5/6/7 can assert on non-trivial aggregates:
 * DARF carryover, annual rollup, multi-quarter cockpit.
 *
 * Why a spec, not a Playwright global hook: the chain depends on
 * Stage 4's storageState being written first (so the user/account
 * already exist in the DB). A spec lets us slot the seeder into the
 * project-dependency graph after Stage 4 and before Stage 5 with the
 * same `dependencies: [prev]` mechanism every other stage uses.
 *
 * The seeder is idempotent (re-runs delete prior `lesson_learned =
 * "JOURNEY_SEED"` rows on the same account before inserting), so
 * re-running the chain locally does not produce duplicates.
 *
 * This stage does NOT save its own storage state — Stage 5 continues
 * to load Stage 4's snapshot. Auth state is unchanged.
 *
 * @journey @stage:seed-history
 */

test.describe(
	"Journey Stage 4b — Multi-month history seeder",
	{ tag: ["@journey", "@stage:seed-history"] },
	() => {
		test.use(loadStageState(2))

		test("Seeds Bravo's prior-month trade history for weekly/monthly/annual assertions", async () => {
			const result = await seedBravoHistory(BRAVO.email)

			expect(result.inserted).toBeGreaterThan(0)
			expect(result.monthsSeeded.length).toBe(4)
			for (const month of result.monthsSeeded) {
				expect(month.count).toBeGreaterThan(0)
			}

			expect(result.ledgerRowsComputed).toBe(4)

			// The plan is shaped so Month -3 nets a loss → its carryoverOut must be
			// non-zero. If this assertion fails, either the recompute path didn't
			// run, the plan shape regressed, or recompute-month.ts changed its
			// carryover semantics. All three are signals worth catching here, not
			// downstream in a flaky UI assertion.
			const hasNonZeroCarryover = result.carryoverOutCentsByMonth.some(
				(entry) => entry.carryoverOutCents > 0
			)
			expect(hasNonZeroCarryover).toBe(true)

			// Seed a quarterly_plan row so Stage 7 can tighten the quarter cockpit
			// assertion from "navigation landmark" to "#quarter-narrative visible".
			// The gate (quarter-report.tsx:353) is reflectionNotes || postMortemNotes
			// on the quarterlyPlan row, not anything trade-derived.
			const quarterSeed = await seedBravoQuarterlyPlan(BRAVO.email, PLAN_YEAR)
			expect(quarterSeed.quarterlyPlanId).toMatch(/.+/)
			expect(quarterSeed.year).toBe(PLAN_YEAR)
		})
	}
)
