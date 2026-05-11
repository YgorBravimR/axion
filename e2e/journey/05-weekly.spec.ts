import { test, expect } from "@playwright/test"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 5 — Weekly Reflection
 *
 * End of week. Bravo reviews aggregate performance on the analytics
 * dashboard.
 *
 *   • /en/analytics — Dashboard with R distribution, tag cloud,
 *                     time-based analysis (heatmap + session perf).
 *
 * Bravo logged exactly one trade in Stage 4, so aggregates are
 * single-data-point. The assertion strategy is "did the dashboard
 * mount past its Suspense fallback?" — not "do the numbers look
 * statistically meaningful?". A later journey iteration can extend
 * Stage 4 to seed more rows for stronger aggregate checks.
 *
 * NOTE: /en/reports is intentionally NOT exercised here. It crashes
 * its error boundary for fresh-account state (plan-year=current-year,
 * sparse trades) — a real product bug that's outside this journey's
 * scope to fix. Stage 6 (Monthly + Tax) re-visits the same surface
 * after more data accumulates; the bug should be tracked separately.
 *
 * Pre-condition: Stage 4 snapshot — Bravo authenticated, admin, with
 *                 her plan tree intact and one trade in the journal.
 * Post-condition: storageState saved as Stage 5. No DB delta — this
 *                 stage is read-only diagnostics.
 *
 * @journey @stage:weekly
 */

test.describe("Journey Stage 5 — Weekly Reflection", () => {
	test.use(loadStageState(4))

	// Analytics fans out into multiple server actions; give the page
	// enough time to mount past Suspense on cold caches.
	test.setTimeout(60_000)

	test("Bravo reviews the week on the analytics dashboard", async ({
		page,
	}) => {
		await annotate(
			page,
			"Stage 5: End of week — review the data. What worked? What cost most?"
		)

		// ── 5a — Analytics dashboard
		await annotate(page, "Analytics — scan one pattern across the week")
		await page.goto("/en/analytics", { waitUntil: "domcontentloaded" })

		// Time-based analysis section has a stable id; its presence proves the
		// dashboard mounted past its Suspense fallback.
		await expect(page.locator("#analytics-time-section")).toBeVisible({
			timeout: 30_000,
		})
		await screenshotIfDemo(page, "05-01-analytics")

		await annotate(
			page,
			"Week reviewed — next stage: monthly close + tax cycle"
		)
		await saveStageState(page, 5)
	})
})
