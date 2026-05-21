import { test, expect } from "../fixtures/base"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 5 — Weekly Reflection
 *
 * End of week. Bravo reviews aggregate performance across two
 * surfaces:
 *
 *   • /en/reports   — Weekly Report card + Mistake Cost card +
 *                     Commission & Fee Impact card (single page,
 *                     not separate routes despite design-doc naming).
 *   • /en/analytics — Dashboard with R distribution, tag cloud,
 *                     time-based analysis (heatmap + session perf).
 *
 * Bravo logged exactly one trade in Stage 4, so aggregates are
 * single-data-point. The assertion strategy is "did each card mount
 * and reach its labeled state?" — not "do the numbers look
 * statistically meaningful?". Stage 4 can later seed denser data
 * for stronger aggregate checks.
 *
 * Pre-condition: Stage 4 snapshot — Bravo authenticated, admin, with
 *                 her plan tree intact and one trade in the journal.
 * Post-condition: storageState saved as Stage 5. No DB delta — this
 *                 stage is read-only diagnostics.
 *
 * @journey @stage:weekly
 */

test.describe(
	"Journey Stage 5 — Weekly Reflection",
	{ tag: ["@journey", "@stage:weekly"] },
	() => {
		test.use(loadStageState(3))

		// Reports + analytics each fan out into many server actions; give
		// the page enough time to mount past Suspense on cold caches.
		test.setTimeout(90_000)

		test("Bravo reviews the week — reports + analytics", async ({ page }) => {
			await annotate(
				page,
				"Stage 5: End of week — review the data. What worked? What cost most?"
			)

			// ── 5a — Reports page hosts Weekly / Mistake-Cost / Commission cards
			await annotate(page, "Reports — weekly card + mistake & fee diagnostics")
			await page.goto("/en/reports", { waitUntil: "domcontentloaded" })

			// Weekly Report card heading is the canonical anchor for this page.
			await expect(
				page.getByRole("heading", { name: /weekly report/i }).first()
			).toBeVisible({ timeout: 30_000 })

			// Mistake Cost + Commission & Fee Impact cards live below the weekly
			// card in the same content shell. Anchor on their labels.
			await expect(page.getByText(/mistake.*cost/i).first()).toBeVisible({
				timeout: 15_000,
			})
			await expect(
				page.getByText(/commission.*fee.*impact|fee impact/i).first()
			).toBeVisible({ timeout: 15_000 })
			await screenshotIfDemo(page, "05-01-reports")

			// ── 5b — Analytics dashboard
			await annotate(page, "Analytics — scan one pattern across the week")
			await page.goto("/en/analytics", { waitUntil: "domcontentloaded" })

			// Time-based analysis section has a stable id; its presence proves the
			// dashboard mounted past its Suspense fallback.
			await expect(page.locator("#analytics-time-section")).toBeVisible({
				timeout: 30_000,
			})
			await screenshotIfDemo(page, "05-02-analytics")

			await annotate(
				page,
				"Week reviewed — next stage: monthly close + tax cycle"
			)
			await saveStageState(page, 4)
		})
	}
)
