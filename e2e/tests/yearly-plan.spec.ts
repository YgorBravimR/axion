import { test, expect } from "@playwright/test"
import { ROUTES } from "../fixtures/test-data"

test.describe("Yearly Plan", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ROUTES.yearlyPlan)
		await page.waitForLoadState("networkidle")
	})

	test("onboarding wizard renders when no plan exists", async ({ page }) => {
		const hasOnboarding = await page
			.getByTestId("yearly-plan-onboarding")
			.isVisible()
			.catch(() => false)
		if (!hasOnboarding) {
			test.skip(true, "Plan already exists — skipping onboarding test")
			return
		}
		await expect(page.getByTestId("yearly-plan-onboarding")).toBeVisible()
		await expect(page.getByLabel(/capital inicial/i)).toBeVisible()
	})

	test("create yearly plan via onboarding wizard", async ({ page }) => {
		const hasOnboarding = await page
			.getByTestId("yearly-plan-onboarding")
			.isVisible()
			.catch(() => false)
		if (!hasOnboarding) {
			test.skip(true, "Plan already exists")
			return
		}

		// Step 1: Capital
		await page.getByLabel(/capital inicial/i).fill("3000")
		await page.getByRole("button", { name: /próximo|next/i }).first().click()

		// Step 2: Ladder (use defaults)
		await page.waitForTimeout(300)
		await page.getByRole("button", { name: /próximo|next/i }).click()

		// Step 3: Exit convention (use defaults)
		await page.waitForTimeout(300)
		await page.getByRole("button", { name: /criar plano/i }).click()

		await page.waitForLoadState("networkidle")
		await expect(page.getByRole("tab", { name: /grade semanal/i })).toBeVisible({ timeout: 10000 })
	})

	test("52-week grid renders with month sections", async ({ page }) => {
		const tabs = page.getByRole("tab", { name: /grade semanal/i })
		await expect(tabs).toBeVisible({ timeout: 8000 })

		const sections = page.getByRole("region")
		await expect(sections.first()).toBeVisible()
	})

	test("current week is highlighted in gold border", async ({ page }) => {
		await expect(page.getByRole("tab", { name: /grade semanal/i })).toBeVisible()
		const currentWeekCell = page.locator(".border-acc-100").first()
		await expect(currentWeekCell).toBeVisible()
	})

	test("edit a week cell and save Pts Feito", async ({ page }) => {
		await expect(page.getByRole("tab", { name: /grade semanal/i })).toBeVisible()

		const firstCell = page.locator("[role=button][aria-label^='Semana']").first()
		await firstCell.click()

		const ptsInput = page.getByPlaceholder(/pts feito/i)
		await expect(ptsInput).toBeVisible({ timeout: 5000 })
		await ptsInput.fill("42.5")

		await page.getByRole("button", { name: /salvar/i }).click()
		await page.waitForLoadState("networkidle")

		await expect(page.getByText("42.5")).toBeVisible({ timeout: 5000 })
	})

	test("payoff matrix tab renders with 10 rows and correct 3G value", async ({ page }) => {
		const matrixTab = page.getByRole("tab", { name: /payoff|matriz/i })
		await expect(matrixTab).toBeVisible()
		await matrixTab.click()

		await page.waitForTimeout(500)

		const rows = page.locator("table[aria-label='Payoff matrix'] tbody tr")
		await expect(rows).toHaveCount(10, { timeout: 5000 })

		await expect(page.getByText("19.5")).toBeVisible()
	})

	test("exit convention change propagates to payoff matrix", async ({ page }) => {
		const exitsTab = page.getByRole("tab", { name: /saída|convention/i })
		await exitsTab.click()
		await page.waitForTimeout(300)

		const parcialInput = page.getByLabel(/parcial \(pts\)/i)
		await parcialInput.clear()
		await parcialInput.fill("6")

		await page.getByRole("button", { name: /salvar convenção/i }).click()
		await page.waitForLoadState("networkidle")

		const matrixTab = page.getByRole("tab", { name: /payoff|matriz/i })
		await matrixTab.click()
		await page.waitForTimeout(300)

		// 1G = 6 × 0.7 + 10 × 0.3 = 7.2 (was 6.5 at default)
		await expect(page.getByText("7.2")).toBeVisible()
	})
})
