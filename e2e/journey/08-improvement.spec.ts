import { test, expect } from "@playwright/test"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 8 — Improvement Flywheel (terminal)
 *
 * The closing stage of Bravo's journey. The flywheel premise: a
 * disciplined trader doesn't stop after one cycle — she files
 * friction back to the product (bug reports) and digs deeper into
 * her own data (analytics drill-downs).
 *
 *   • Bug-report panel — opened from the user menu (chrome-level
 *                        surface, not a dedicated route). Panel
 *                        opens, gets observed, closes without
 *                        submitting so no DB row is created.
 *   • /en/analytics    — drill past the high-level dashboard into
 *                        a deeper card (equity curve) to demonstrate
 *                        the continuous-improvement loop.
 *
 * Deferred from design doc:
 *   • /en/coaching     — no such route exists in product yet. The
 *                        "coaching insights" concept lives only in
 *                        the design doc. Once the route ships, this
 *                        stage can extend.
 *   • /en/bug-report   — bug-report is a chrome-level panel, not a
 *                        page route. The user-menu pathway exercises
 *                        the same surface.
 *   • /en/page-guide   — page-guide is a per-page trigger overlay,
 *                        not a dedicated route. No global landing
 *                        page to anchor on.
 *
 * Intentionally NOT submitting the bug report: that would write to
 * the bug_reports table, and the journey teardown doesn't currently
 * clean those rows (only users / trades / assets). Observing the
 * panel mounted is sufficient proof the entry pathway works.
 *
 * Pre-condition: Stage 7 snapshot — Bravo authenticated, admin, full
 *                 plan + cockpit + comparison surfaces verified.
 * Post-condition: storageState saved as Stage 8 (terminal state). No
 *                 DB delta.
 *
 * @journey @stage:improvement
 */

test.describe(
	"Journey Stage 8 — Improvement Flywheel",
	{ tag: ["@journey", "@stage:improvement"] },
	() => {
		test.use(loadStageState(7))

		test.setTimeout(60_000)

		test("Bravo closes the loop: file friction, drill the data", async ({
			page,
		}) => {
			await annotate(
				page,
				"Stage 8: Flywheel — feed friction back, drill deeper into the data"
			)

			// Land on the dashboard first so the chrome (user menu trigger) is
			// reliably mounted before we drive it.
			await page.goto("/en", { waitUntil: "domcontentloaded" })

			// ── 8a — Open the bug-report panel (no submit, no DB write)
			await annotate(page, "Bug report — file friction back to the product")

			// Two user-menu trigger variants render (collapsed vs expanded sidebar),
			// both labelled "User Menu". Click the first visible one.
			await page
				.getByRole("button", { name: /user menu/i })
				.first()
				.click()
			// Dropdown item — close-on-click triggers openBugReport() (no
			// navigation), so we don't wait for a URL change.
			await page.getByRole("menuitem", { name: /report a bug/i }).click()

			// Bug-report panel renders an aria-labelled dialog with #bug-subject as
			// the first form field — stable mount proof.
			await expect(page.locator("#bug-subject")).toBeVisible({
				timeout: 10_000,
			})
			await screenshotIfDemo(page, "08-01-bug-report-panel")

			// Close without submitting to avoid leaving a bug_reports row behind
			// (teardown only cleans users / trades / assets today).
			await page.locator("#bug-report-close").click()
			await expect(page.locator("#bug-subject")).toBeHidden({ timeout: 5_000 })

			// ── 8b — Drill deeper into analytics (equity curve card)
			await annotate(page, "Analytics — drill into the equity curve")
			await page.goto("/en/analytics", { waitUntil: "domcontentloaded" })

			// Equity-curve card has its own stable id (cumulative-pnl-chart.tsx:89).
			// Its presence past Suspense proves the dashboard surfaced a deeper card,
			// not just the time-section landmark Stage 5 already covered.
			await expect(page.locator("#analytics-equity-curve").first()).toBeVisible(
				{
					timeout: 30_000,
				}
			)
			await screenshotIfDemo(page, "08-02-analytics-equity-curve")

			await annotate(page, "Journey complete — flywheel turning")
			await saveStageState(page, 8)
		})
	}
)
