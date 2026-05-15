import { test, expect } from "@playwright/test"
import { BRAVO } from "./fixtures/bravo-seed"
import { seedHawksHistory } from "./helpers/seed-hawks-history"
import { loadStageState } from "./helpers/storage-state"

/**
 * Stage 9b — Hawks history seeder.
 *
 * Runs between Stage 8 (Improvement Flywheel) and Stage 9 (Hawks Daily Loop).
 * Seeds prior-month Hawks trades with metadata + daily bias rows, and activates
 * Hawks mode on Bravo's account so Stage 9 can assert on:
 *   • Missing-bias alert appearing on command center (today's bias not yet set)
 *   • Daily ordinal badge showing correct count after bias is confirmed
 *   • Monthly scorecard in the fractal plan cockpit
 *
 * Idempotency: prior HAWKS_JOURNEY_SEED trades are deleted before inserting.
 * Auth state is unchanged; this stage does not save its own storage state —
 * Stage 9 continues to load Stage 8's snapshot.
 *
 * @journey @stage:seed-hawks-history
 */

test.describe(
	"Journey Stage 9b — Hawks history seeder",
	{ tag: ["@journey", "@stage:seed-hawks-history"] },
	() => {
		test.use(loadStageState(8))

		test("Seeds Bravo's Hawks history and activates Hawks mode", async () => {
			const result = await seedHawksHistory(BRAVO.email)

			expect(result.tradesInserted).toBeGreaterThan(0)
			expect(result.biasesInserted).toBeGreaterThan(0)
		})
	}
)
