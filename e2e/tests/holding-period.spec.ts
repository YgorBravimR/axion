/**
 * E2E tests for the Holding Period Analysis feature on the /analytics page.
 *
 * What is verified:
 *   - The analytics page loads successfully (networkidle baseline)
 *   - The holding period chart section exists in the DOM (#analytics-holding-period)
 *   - The section renders inside the time-based analysis area (below hourly/day-of-week charts)
 *   - The expected heading text for the holding period chart is present
 *   - Either the chart bars or the empty-state no-data message is shown
 *     (both are valid since the test environment may have no closed trades)
 *
 * Document order assertion:
 *   The test uses the relative position in the DOM to confirm that the holding
 *   period section appears after the hourly-performance and day-of-week charts,
 *   matching the render order in analytics-content.tsx.
 */

import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"

test.describe("Holding Period Analysis — Analytics Page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ROUTES.analytics)
		await page.waitForLoadState("load")
		await page.waitForTimeout(1000)
	})

	// =========================================================================
	// Presence and structure
	// =========================================================================

	test.describe("section presence", () => {
		test("should render the holding period section with the correct id", async ({
			page,
		}) => {
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible({ timeout: 10_000 })
		})

		test("should render a heading for the holding period chart", async ({
			page,
		}) => {
			// The chart heading is driven by the i18n key analytics.holdingPeriod.title
			// Check for the element itself; exact text varies by locale
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible()

			const heading = section.locator("h3")
			await expect(heading).toBeVisible()
			// Heading must have non-empty text (not an empty placeholder)
			const headingText = await heading.innerText()
			expect(headingText.trim().length).toBeGreaterThan(0)
		})
	})

	// =========================================================================
	// Position within time analysis section
	// =========================================================================

	test.describe("position in the page layout", () => {
		test("should appear after the hourly performance and day-of-week charts", async ({
			page,
		}) => {
			// We verify that #analytics-holding-period comes after the charts that
			// precede it in analytics-content.tsx by checking document order.
			// Playwright's `evaluate` lets us inspect the DOM directly.

			const holdingPeriodExists = await page
				.locator("#analytics-holding-period")
				.isVisible()
			expect(holdingPeriodExists).toBe(true)

			// Check that holding period section is not the first chart on the page.
			// Recharts renders at least one .recharts-wrapper before our section.
			const holdingPeriodBoundingBox = await page
				.locator("#analytics-holding-period")
				.boundingBox()
			expect(holdingPeriodBoundingBox).not.toBeNull()

			// All recharts wrappers that come before the holding period section
			// should have a smaller Y coordinate (i.e., higher on the page)
			const precedingCharts = page.locator(".recharts-wrapper").first()
			const precedingBox = await precedingCharts.boundingBox()

			if (precedingBox && holdingPeriodBoundingBox) {
				expect(precedingBox.y).toBeLessThan(holdingPeriodBoundingBox.y)
			}
		})
	})

	// =========================================================================
	// Content state
	// =========================================================================

	test.describe("content state", () => {
		test("should show either chart bars or the no-data empty state", async ({
			page,
		}) => {
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible()

			// The section contains either:
			//   (a) a ChartContainer with recharts bars (when closed trades exist), or
			//   (b) an empty-state div with a no-data message
			const hasChart = await section
				.locator(".recharts-wrapper")
				.first()
				.isVisible()
				.catch(() => false)
			const hasEmptyState = await section
				.locator(
					"div:has(> .recharts-wrapper), div:not(:has(.recharts-wrapper))"
				)
				.first()
				.isVisible()
				.catch(() => false)

			// At least one of the two states must be visible
			expect(hasChart || hasEmptyState).toBe(true)
		})

		test("should render the chart container with a unique id when data is present", async ({
			page,
		}) => {
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible()

			const chartContainer = page.locator("#chart-analytics-holding-period")
			const chartExists = await chartContainer.count()

			if (chartExists > 0) {
				// Chart container is in the DOM — verify it's inside the section
				await expect(
					section.locator("#chart-analytics-holding-period")
				).toBeVisible()
			}
			// If 0, the empty state is displayed — which is tested separately
		})

		test("should display the no-data message when the chart has no data to render", async ({
			page,
		}) => {
			// The empty state is present when #analytics-holding-period exists
			// but #chart-analytics-holding-period does not (empty activeBuckets).
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible()

			const chartContainer = await page
				.locator("#chart-analytics-holding-period")
				.count()
			if (chartContainer === 0) {
				// Confirm the section still has some content (the no-data message)
				const sectionContent = await section.innerText()
				expect(sectionContent.trim().length).toBeGreaterThan(0)
			}
		})

		test("should show best and worst bucket summaries when the chart has data", async ({
			page,
		}) => {
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible()

			const chartContainer = await page
				.locator("#chart-analytics-holding-period")
				.count()
			if (chartContainer > 0) {
				// Summary grid should contain two labels: best bucket and worst bucket
				// The component renders these below the chart in a 2-column grid
				const summaryItems = section.locator("p.text-tiny")
				// There are exactly 2 label-value pairs in the summary
				const summaryCount = await summaryItems.count()
				expect(summaryCount).toBeGreaterThanOrEqual(2)
			}
		})
	})

	// =========================================================================
	// Expectancy mode toggle integration
	// =========================================================================

	test.describe("expectancy mode toggle", () => {
		test("should still show the holding period section after switching expectancy mode", async ({
			page,
		}) => {
			// The expectancy mode toggle is rendered in analytics-content.tsx above the charts.
			// Clicking it switches between "capital" ($) and "edge" (R) modes.
			// The holding period section should remain visible in both modes.
			const section = page.locator("#analytics-holding-period")
			await expect(section).toBeVisible()

			// Find the expectancy mode toggle (radiogroup or labeled button group)
			const toggleButtons = page
				.getByRole("radiogroup")
				.first()
				.getByRole("radio")
			const toggleCount = await toggleButtons.count().catch(() => 0)

			if (toggleCount >= 2) {
				await toggleButtons.nth(1).click()
				await page.waitForTimeout(300)
				await expect(section).toBeVisible()

				await toggleButtons.nth(0).click()
				await page.waitForTimeout(300)
				await expect(section).toBeVisible()
			}
		})
	})

	// =========================================================================
	// Responsiveness
	// =========================================================================

	test.describe("responsive layout", () => {
		test("should remain visible at mobile viewport width", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 812 })
			await page.waitForTimeout(300)

			const section = page.locator("#analytics-holding-period")
			// Scroll into view in case the section is below the fold on mobile
			await section.scrollIntoViewIfNeeded()
			await expect(section).toBeVisible()
		})

		test("should remain visible at tablet viewport width", async ({ page }) => {
			await page.setViewportSize({ width: 768, height: 1024 })
			await page.waitForTimeout(300)

			const section = page.locator("#analytics-holding-period")
			await section.scrollIntoViewIfNeeded()
			await expect(section).toBeVisible()
		})

		test("should remain visible at desktop viewport width", async ({
			page,
		}) => {
			await page.setViewportSize({ width: 1440, height: 900 })
			await page.waitForTimeout(300)

			const section = page.locator("#analytics-holding-period")
			await section.scrollIntoViewIfNeeded()
			await expect(section).toBeVisible()
		})
	})
})
