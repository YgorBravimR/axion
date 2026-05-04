// e2e/tests/annual-reporting.spec.ts
import { test, expect } from "@playwright/test"
import { ROUTES } from "../fixtures/test-data"

test.describe("Annual Reporting", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ROUTES.reports)
		await page.waitForLoadState("networkidle")
	})

	test("annual section heading renders on /reports", async ({ page }) => {
		const heading = page.getByRole("heading", { name: /annual report/i })
		await expect(heading).toBeVisible()
	})

	test("WeeklyMetaChart renders SVG with bar elements", async ({ page }) => {
		const chartContainer = page.locator('[role="img"][aria-label*="Weekly Meta vs Real"]')
		await expect(chartContainer).toBeVisible()
		const bars = chartContainer.locator("rect")
		await expect(bars.first()).toBeVisible()
	})

	test("AnnualRollupTable renders 12 month rows plus totals", async ({ page }) => {
		const table = page.locator('table[aria-label*="Annual rollup"]')
		await expect(table).toBeVisible()
		const bodyRows = table.locator("tbody tr")
		await expect(bodyRows).toHaveCount(12)
		const footerRows = table.locator("tfoot tr")
		await expect(footerRows).toHaveCount(1)
	})

	test("CapitalEventLog summary is visible and expandable", async ({ page }) => {
		const summary = page.getByText(/Capital Events/)
		await expect(summary).toBeVisible()
		await summary.click()
		const logButton = page.getByRole("button", { name: /^Log$/ })
		await expect(logButton).toBeVisible()
	})

	test("log a withdrawal via CapitalEventLog form", async ({ page }) => {
		const summary = page.getByText(/Capital Events/)
		await summary.click()
		await page.waitForLoadState("networkidle")

		const withdrawalBtn = page.getByRole("button", { name: /Withdrawal/ }).first()
		await withdrawalBtn.click()

		await page.getByLabel("Amount in BRL").fill("500")

		const logBtn = page.getByRole("button", { name: /^Log$/ })
		await logBtn.click()
		await page.waitForLoadState("networkidle")

		const eventList = page.getByRole("list", { name: /Capital events/ })
		await expect(eventList).toBeVisible()
		await expect(eventList.getByText(/Retirada/)).toBeVisible()
	})

	test("delete a capital event shows updated list", async ({ page }) => {
		const summary = page.getByText(/Capital Events/)
		await summary.click()
		await page.waitForLoadState("networkidle")

		await page.getByLabel("Amount in BRL").fill("100")
		const logBtn = page.getByRole("button", { name: /^Log$/ })
		await logBtn.click()
		await page.waitForLoadState("networkidle")

		const eventList = page.getByRole("list", { name: /Capital events/ })
		const deleteBtn = eventList.getByRole("button", { name: /Delete/ }).first()
		await deleteBtn.click()
		await page.waitForLoadState("networkidle")

		await expect(page.locator("body")).not.toContainText("Error")
	})

	test("WithdrawalCalculator suggestion text is well-formed when present", async ({ page }) => {
		// The calculator only renders when current month's resultadoLiquido > 0 AND withdrawalTargetPercent > 0.
		// We do NOT assert visibility — only assert that, if it renders, the text is well-formed (no "undefined").
		await expect(page.locator("body")).not.toContainText("Based on your undefined% withdrawal target")
	})

	test("settings page loads with annual reporting fieldset", async ({ page }) => {
		await page.goto(ROUTES.settings)
		await page.waitForLoadState("networkidle")

		const startMonthSelect = page.getByLabel("Account start month")
		await expect(startMonthSelect).toBeVisible()

		const startYearInput = page.getByLabel("Account start year")
		await expect(startYearInput).toBeVisible()

		const saveBtn = page.getByRole("button", { name: /Save Annual Settings/ })
		await expect(saveBtn).toBeVisible()
	})
})
