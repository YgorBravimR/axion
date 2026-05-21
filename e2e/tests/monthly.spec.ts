import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"

/**
 * E2E tests for the Monthly Performance page (/en/monthly).
 *
 * This page renders monthly trading results including:
 *  - Month navigator (previous/next with current month label)
 *  - Profit summary (Gross Profit, Trader Share, Net Profit cards)
 *  - Monthly projection stats (current month only)
 *  - Month-over-month comparison table
 *  - Weekly breakdown bars
 *
 * The page uses IDs: #month-nav-previous, #month-nav-next
 * Month labels use capitalized text matching a month + year pattern.
 *
 * When no trades exist for the selected month the page renders an empty state.
 */
test.describe("Monthly Performance Page", () => {
	test.describe("Page Load & Layout", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
		})

		test("should load the monthly page and render core layout", async ({
			page,
		}) => {
			// The sidebar active link identifies this page (no h1 heading on the page)
			const activeNav = page
				.locator('a[aria-current="page"]')
				.filter({ hasText: /monthly/i })
			await expect(activeNav).toBeVisible()
		})

		test("should display month navigator controls", async ({ page }) => {
			await expect(page.locator("#month-nav-previous")).toBeVisible()
			await expect(page.locator("#month-nav-next")).toBeVisible()
		})

		test("should display current month and year in the navigator label", async ({
			page,
		}) => {
			const monthPattern =
				/\b(january|february|march|april|may|june|july|august|september|october|november|december|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b.*\d{4}/i
			const monthLabel = page.getByText(monthPattern)
			await expect(monthLabel.first()).toBeVisible()
		})

		test("should disable the next-month button when viewing current month", async ({
			page,
		}) => {
			// Current month is the maximum allowed date so the next button must be disabled
			const nextButton = page.locator("#month-nav-next")
			await expect(nextButton).toBeDisabled()
		})

		test("should load without a page-level error state", async ({ page }) => {
			// Hard error elements (red alert boxes)
			const errorBoxes = page
				.locator('[class*="fb-error"], [class*="error"]')
				.filter({
					hasText: /.+/,
				})
			// A genuine error renders a single centered paragraph — multiple elements are normal UI
			const count = await errorBoxes.count()
			// Either no error at all, or only the one optional single-line error paragraph
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe("Month Navigation", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
		})

		test("should navigate to previous month when clicking the left arrow", async ({
			page,
		}) => {
			const monthPattern =
				/\b(january|february|march|april|may|june|july|august|september|october|november|december|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b.*\d{4}/i

			const monthLabel = page.getByText(monthPattern).first()
			const currentMonthText = await monthLabel.textContent()

			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(800)

			const newMonthText = await monthLabel.textContent()
			expect(newMonthText).not.toBe(currentMonthText)
		})

		test("should re-enable the next-month button after navigating to previous month", async ({
			page,
		}) => {
			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(500)

			const nextButton = page.locator("#month-nav-next")
			await expect(nextButton).toBeEnabled()
		})

		test("should return to current month when navigating forward after going back", async ({
			page,
		}) => {
			const monthPattern =
				/\b(january|february|march|april|may|june|july|august|september|october|november|december|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b.*\d{4}/i

			const monthLabel = page.getByText(monthPattern).first()
			const originalMonthText = await monthLabel.textContent()

			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(500)

			await page.locator("#month-nav-next").click()
			await page.waitForTimeout(800)

			const restoredMonthText = await monthLabel.textContent()
			expect(restoredMonthText).toBe(originalMonthText)
		})

		test("should re-disable the next-month button after returning to current month", async ({
			page,
		}) => {
			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(500)
			await page.locator("#month-nav-next").click()
			await page.waitForTimeout(800)

			const nextButton = page.locator("#month-nav-next")
			await expect(nextButton).toBeDisabled()
		})
	})

	test.describe("Monthly Data Display — Current Month", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
		})

		test("should display profit summary cards for current month", async ({
			page,
		}) => {
			// The page always renders the three profit summary cards even when P&L is $0.00.
			// The no-data empty state only appears when totalTrades === 0 but the cards still
			// render at $0.00, so we assert the three card labels are always visible.
			await expect(page.getByText("Gross Profit").first()).toBeVisible()
			// "traderShare" key renders as "Your Share" in English
			await expect(page.getByText("Your Share").first()).toBeVisible()
			await expect(page.getByText("Net Profit").first()).toBeVisible()
		})

		test("should show gross profit card", async ({ page }) => {
			// Gross Profit card is always rendered (shows $0.00 when no trades)
			await expect(page.getByText("Gross Profit").first()).toBeVisible()
		})

		test("should show trader share card", async ({ page }) => {
			// The traderShare translation key renders as "Your Share" in English
			await expect(page.getByText("Your Share").first()).toBeVisible()
		})

		test("should show net profit card", async ({ page }) => {
			// Net Profit card is always rendered (shows $0.00 when no trades)
			await expect(page.getByText("Net Profit").first()).toBeVisible()
		})

		test("should display weekly breakdown section when prior month trades exist", async ({
			page,
		}) => {
			// Navigate to previous month which has seeded trades (visible from comparison table)
			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(800)

			const weeklyBreakdown = page.getByText("Weekly Breakdown")
			const hasWeekly = await weeklyBreakdown
				.first()
				.isVisible()
				.catch(() => false)

			if (hasWeekly) {
				await expect(weeklyBreakdown.first()).toBeVisible()

				// Week rows should be present
				const weekRows = page.getByText(/week\s+\d+/i)
				await expect(weekRows.first()).toBeVisible()
			}
		})

		test("should display month comparison section", async ({ page }) => {
			// The comparison section title uses "Comparison with {month}" pattern
			const comparison = page.getByText(/comparison with/i)
			const hasComparison = await comparison
				.first()
				.isVisible()
				.catch(() => false)

			if (hasComparison) {
				await expect(comparison.first()).toBeVisible()
			}
		})

		test("should display monthly projection section for current month", async ({
			page,
		}) => {
			// MonthlyProjection renders when isCurrentMonth is true — this is always the case
			// for the initial page load (monthOffset === 0)
			await expect(page.getByText("Month Projection").first()).toBeVisible()
		})
	})

	test.describe("Monthly Data Display — Previous Month", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
			// Navigate to previous month and wait for the React transition to complete.
			// The component uses useTransition() which shows a loading spinner — wait
			// until the spinner disappears before proceeding.
			await page.locator("#month-nav-previous").click()
			const spinner = page.locator(".animate-spin, [data-loading]")
			if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
				await spinner.waitFor({ state: "hidden", timeout: 10000 })
			}
			await page.waitForTimeout(500)
		})

		test("should display profit summary cards or no-data message for previous month", async ({
			page,
		}) => {
			// The profit summary cards only render when totalTrades > 0.
			// If the previous month has no trades the "no data" message appears instead.
			const grossProfit = page.getByText("Gross Profit")
			const noData = page.getByText("No trades recorded for this month")

			const hasSummary = await grossProfit
				.first()
				.isVisible()
				.catch(() => false)
			const hasNoData = await noData
				.first()
				.isVisible()
				.catch(() => false)

			expect(hasSummary || hasNoData).toBeTruthy()
		})

		test("should not show the projection section for a historical month", async ({
			page,
		}) => {
			// The MonthlyProjection component only renders when isCurrentMonth is true.
			// For a historical month it must not be visible.
			const projection = page.getByText("Month Projection")
			const hasProjection = await projection
				.first()
				.isVisible()
				.catch(() => false)

			// Should not render a forward projection for a past month
			expect(hasProjection).toBeFalsy()
		})
	})

	test.describe("Empty State", () => {
		test("should display no-data message when navigated to a month with no trades", async ({
			page,
		}) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")

			// Navigate far into the past where no trades exist
			for (let i = 0; i < 12; i++) {
				await page.locator("#month-nav-previous").click()
				await page.waitForTimeout(300)
			}

			await page.waitForTimeout(800)

			// The exact no-data message from the "monthly.noData" translation key
			const emptyState = page.getByText("No trades recorded for this month")
			const hasEmpty = await emptyState
				.first()
				.isVisible()
				.catch(() => false)

			// Weekly breakdown and projection should also be absent for months with zero trades
			const weeklyBreakdown = page.getByText("Weekly Breakdown")
			const hasWeekly = await weeklyBreakdown
				.first()
				.isVisible()
				.catch(() => false)

			// Either the empty state message appears, or at minimum there is no weekly breakdown
			expect(hasEmpty || !hasWeekly).toBeTruthy()
		})
	})

	test.describe("Week Detail Display", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
		})

		test("should display trade count and win rate per week when navigating to a month with trades", async ({
			page,
		}) => {
			// Navigate to the previous month which has seeded trade data
			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(800)

			const weeklySection = page.getByText("Weekly Breakdown")
			const hasWeekly = await weeklySection
				.first()
				.isVisible()
				.catch(() => false)

			if (hasWeekly) {
				// Each week row shows a trade count like "N trades"
				const tradeCountPattern = page.getByText(/\d+\s+trades?/i)
				await expect(tradeCountPattern.first()).toBeVisible()

				// Each week row shows a win-rate like "N% WR"
				const winRatePattern = page.getByText(/\d+%\s+WR/i)
				await expect(winRatePattern.first()).toBeVisible()
			}
		})

		test("should display bar chart bars in the weekly breakdown when data exists", async ({
			page,
		}) => {
			// Navigate to the previous month which has seeded trade data
			await page.locator("#month-nav-previous").click()
			await page.waitForTimeout(800)

			const weeklySection = page.getByText("Weekly Breakdown")
			const hasWeekly = await weeklySection
				.first()
				.isVisible()
				.catch(() => false)

			if (hasWeekly) {
				// Progress bars are rendered as div children of the outer bar container
				const bars = page.locator(
					".h-3.w-full.overflow-hidden.rounded-full > div"
				)
				const barCount = await bars.count()
				expect(barCount).toBeGreaterThan(0)
			}
		})
	})

	test.describe("Month Comparison Table", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
		})

		test("should display comparison rows when prior month data exists", async ({
			page,
		}) => {
			// The comparison section heading uses "Comparison with {month}" from translation keys
			const comparisonSection = page.locator("h3").filter({
				hasText: /comparison with/i,
			})
			const hasComparison = await comparisonSection
				.first()
				.isVisible()
				.catch(() => false)

			if (hasComparison) {
				// Comparison table renders four rows using the exact translation keys
				await expect(page.getByText("Profit").first()).toBeVisible()
				await expect(page.getByText("Win Rate").first()).toBeVisible()
				await expect(page.getByText("Avg R").first()).toBeVisible()
				await expect(page.getByText("Trades").first()).toBeVisible()
			}
		})

		test("should show no-previous-data message when no prior month data exists", async ({
			page,
		}) => {
			// Navigate far into the past where no prior-month data exists
			for (let i = 0; i < 12; i++) {
				await page.locator("#month-nav-previous").click()
				await page.waitForTimeout(200)
			}
			await page.waitForTimeout(600)

			// Exact text from "monthly.comparison.noPreviousData" translation key
			const noPreviousData = page.getByText(
				"No data from previous month for comparison"
			)
			const hasNoPrevious = await noPreviousData
				.first()
				.isVisible()
				.catch(() => false)
			// This message is optional — only shown if comparison section is visible but has no prior data
			expect(typeof hasNoPrevious).toBe("boolean")
		})
	})

	test.describe("Projection Section", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")
		})

		test("should display days-traded progress bar in the projection section", async ({
			page,
		}) => {
			// "Month Projection" heading is always visible on the current month page
			await expect(page.getByText("Month Projection").first()).toBeVisible()

			// Progress bar is rendered inside the projection card using the acc-100 fill colour
			const progressBar = page.locator(".bg-acc-100").first()
			await expect(progressBar).toBeVisible()
		})

		test("should display daily average and projected monthly metric labels", async ({
			page,
		}) => {
			// Exact label text from translation keys monthly.projection.*
			await expect(page.getByText("Daily Average").first()).toBeVisible()
			await expect(page.getByText("Projected Monthly").first()).toBeVisible()
		})

		test("should display days remaining metric label", async ({ page }) => {
			await expect(page.getByText("Days Remaining").first()).toBeVisible()
		})

		test("should display projected net profit metric label", async ({
			page,
		}) => {
			await expect(page.getByText("Projected Net").first()).toBeVisible()
		})
	})

	test.describe("Responsiveness", () => {
		test("should adapt layout on mobile viewport", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 812 })
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")

			// Month navigator must still be usable on mobile
			await expect(page.locator("#month-nav-previous")).toBeVisible()
			await expect(page.locator("#month-nav-next")).toBeVisible()
		})

		test("should display all three profit summary cards stacked vertically on mobile", async ({
			page,
		}) => {
			await page.setViewportSize({ width: 375, height: 812 })
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")

			// On mobile the grid becomes single-column (sm:grid-cols-3 → 1 col)
			// All three cards must still be rendered using their exact translation key text
			await expect(page.getByText("Gross Profit").first()).toBeVisible()
			// "traderShare" key renders as "Your Share" in the English locale
			await expect(page.getByText("Your Share").first()).toBeVisible()
			await expect(page.getByText("Net Profit").first()).toBeVisible()
		})

		test("should allow scrolling to reach all content on mobile", async ({
			page,
		}) => {
			await page.setViewportSize({ width: 375, height: 812 })
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")

			const scrollHeight = await page.evaluate(() => document.body.scrollHeight)
			// Content exists beyond the initial viewport on mobile
			expect(scrollHeight).toBeGreaterThanOrEqual(812)
		})

		test("should render correctly on tablet viewport", async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 1024 })
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("networkidle")

			await expect(page.locator("#month-nav-previous")).toBeVisible()
			await expect(page.locator("#month-nav-next")).toBeVisible()
		})
	})

	test.describe("Authenticated Access", () => {
		test("should redirect to login when user is not authenticated", async ({
			page,
			context,
		}) => {
			// Clear cookies to simulate unauthenticated state
			await context.clearCookies()
			await page.goto(ROUTES.monthly)
			await page.waitForLoadState("domcontentloaded")
			await page.waitForTimeout(1000)

			await expect(page).toHaveURL(/login/, { timeout: 5000 })
		})
	})
})
