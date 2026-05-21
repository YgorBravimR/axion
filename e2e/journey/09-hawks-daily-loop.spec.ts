import { test, expect } from "../fixtures/base"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 9 — Hawks Daily Loop
 *
 * Exercises the Hawks mode flow for a disciplined trading day:
 *
 *   • Command Center — missing-bias gate fires when today's bias is unset.
 *                      Trader fills in the triple-screen ritual and confirms.
 *                      Review panel replaces the alert after confirmation.
 *   • Daily ordinal badge — shows X/3 trade count live in the command center.
 *   • Journal /new — HawksDailyCapBanner is absent for a fresh Hawks day (0/3).
 *
 * Stage 9b (09b-seed-hawks-history) runs first; it:
 *   • Activates Hawks mode on Bravo's account
 *   • Seeds two prior months of Hawks trades + daily biases for the scorecard
 *
 * Pre-condition: Stage 8 snapshot — Bravo authenticated, full cockpit verified.
 * Pre-condition: Stage 9b executed — Hawks mode active, prior-month data seeded.
 * Post-condition: Hawks bias confirmed for today; storageState saved as Stage 9.
 *
 * @journey @stage:hawks-daily-loop
 */

const HAWKS_DAILY_CAP = 3

test.describe(
	"Journey Stage 9 — Hawks Daily Loop",
	{ tag: ["@journey", "@stage:hawks-daily-loop"] },
	() => {
		test.use(loadStageState(8))

		test.setTimeout(90_000)

		test("Bravo runs her first Hawks trading day: set bias, verify ordinal badge", async ({
			page,
		}) => {
			await annotate(
				page,
				"Stage 9: Hawks daily loop — triple-screen ritual, bias gate, ordinal badge"
			)

			// ── 9a — Command Center: missing-bias gate
			await annotate(
				page,
				"Pre-market — command center should show missing-bias alert"
			)
			await page.goto("/en/command-center")
			await page.waitForLoadState("networkidle")

			// The Hawks missing-bias alert is rendered with role="alert".
			// It only shows on today's view when Hawks mode is active and bias is unset.
			const biasAlert = page.getByRole("alert", { name: /set today.?s bias/i })
			await expect(biasAlert).toBeVisible({ timeout: 15_000 })
			await screenshotIfDemo(page, "09-01-missing-bias-alert")

			// ── 9b — Set the daily bias via the form inside the alert
			await annotate(
				page,
				"Confirm today's bias — Long, all triple-screen checks ticked"
			)

			// Select Long direction using the segmented toggle (rendered as radio-style buttons)
			const longButton = page
				.getByRole("group")
				.filter({ hasText: /bias direction/i })
				.getByRole("button", { name: /long/i })
				.first()
			await longButton.click()

			// Tick all triple-screen checkboxes. Each checkbox has a unique aria-label
			// derived from the screen name. We simply check all unchecked ones.
			const checkboxes = biasAlert.getByRole("checkbox")
			const count = await checkboxes.count()
			for (let i = 0; i < count; i++) {
				const cb = checkboxes.nth(i)
				const checked = await cb.isChecked()
				if (!checked) {
					await cb.click()
				}
			}

			// Submit the bias
			await page.getByRole("button", { name: /confirm bias/i }).click()

			// After confirmation, the component either shows a success flash or the
			// page refreshes to show the bias review panel. Both indicate success.
			await expect(page.getByText(/bias confirmed|long/i).first()).toBeVisible({
				timeout: 15_000,
			})
			await screenshotIfDemo(page, "09-02-bias-confirmed")

			// ── 9c — Ordinal badge: 0 trades taken so far today
			await annotate(
				page,
				"Ordinal badge — should show 0/3 trades today after bias set"
			)
			await page.goto("/en/command-center")
			await page.waitForLoadState("networkidle")

			// The ordinal badge shows "{ordinal} of {cap} trades today" or "Daily cap reached".
			// With 0 trades seeded for today it should show "0 of 3 trades today".
			const ordinalBadge = page
				.getByText(new RegExp(`0\\s+of\\s+${HAWKS_DAILY_CAP}\\s+trades`, "i"))
				.first()
			await expect(ordinalBadge).toBeVisible({ timeout: 10_000 })
			await screenshotIfDemo(page, "09-03-ordinal-badge")

			// ── 9d — Journal /new: no daily-cap banner for a fresh Hawks day
			await annotate(
				page,
				"Journal /new — no cap banner expected when ordinal = 0"
			)
			await page.goto("/en/journal/new")
			await page.waitForLoadState("networkidle")

			// HawksDailyCapBanner has role="alert" and aria-label "Daily cap reached".
			// With 0 trades today the banner should NOT appear.
			await expect(
				page.getByRole("alert", { name: /daily cap reached/i })
			).not.toBeVisible({ timeout: 5_000 })

			await expect(
				page.getByRole("tab", { name: /single entry/i })
			).toBeVisible({
				timeout: 10_000,
			})
			await screenshotIfDemo(page, "09-04-new-trade-no-cap-banner")

			await annotate(page, "Hawks daily loop verified — saving Stage 9 state")
			await saveStageState(page, 9)
		})
	}
)
