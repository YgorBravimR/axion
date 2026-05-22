import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"
import {
	getAdminContext,
	deleteYearlyPlansForAccount,
} from "../utils/seed-trading-data"

test.describe("Yearly Plan", () => {
	test.beforeEach(async ({ page }) => {
		// Delete any existing yearly plan to test the onboarding wizard on fresh state
		const { accountId } = await getAdminContext()
		await deleteYearlyPlansForAccount(accountId)

		await page.goto(ROUTES.yearlyPlan)
		await page.waitForLoadState("load")
		await page.waitForTimeout(1000)
	})

	test("onboarding wizard renders when no plan exists", async ({ page }) => {
		await expect(page.getByTestId("yearly-plan-onboarding")).toBeVisible()
		await expect(page.getByLabel(/capital inicial/i)).toBeVisible()
	})

	test("create yearly plan via onboarding wizard", async ({ page }) => {
		// Step 1: Capital
		await page.getByLabel(/capital inicial/i).fill("3000")
		await page
			.getByRole("button", { name: /próximo|next/i })
			.first()
			.click()

		// Step 2: Ladder (use defaults)
		await page.waitForTimeout(300)
		await page.getByRole("button", { name: /próximo|next/i }).click()

		// Step 3: Exit convention (use defaults)
		await page.waitForTimeout(300)
		await page.getByRole("button", { name: /criar plano/i }).click()

		await page.waitForLoadState("load")
		await page.waitForTimeout(1000)

		const planTab = page.getByRole("tab", { name: /plan|plano/i })
		await expect(planTab).toBeVisible({ timeout: 10000 })
	})
})
