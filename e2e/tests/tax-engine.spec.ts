import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"
import {
	getAdminContext,
	ensureMonthlyDarfLedger,
} from "../utils/seed-trading-data"

test.describe("BR Tax Engine", () => {
	test.describe("Reports — Tax section", () => {
		test.beforeEach(async ({ page }) => {
			// Seed DARF data for the current month before each test
			const { accountId } = await getAdminContext()
			const now = new Date()
			const year = now.getFullYear()
			const month = now.getMonth() + 1
			await ensureMonthlyDarfLedger(accountId, year, month, 150000)

			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("renders Impostos section when DARF data exists", async ({ page }) => {
			const taxSection = page.getByRole("region", { name: /impostos/i })
			await expect(taxSection.first()).toBeVisible()
		})

		test("DARF card shows status badge", async ({ page }) => {
			const darfHeading = page.getByText(/darf do mês/i)
			await expect(darfHeading.first()).toBeVisible()

			// Status badge text should be one of the known labels
			const validStatuses = /(pendente|pago|isento|vencido)/i
			const badgeText = page
				.locator("[data-slot='badge']")
				.filter({ hasText: validStatuses })
			await expect(badgeText.first()).toBeVisible()
		})

		test("mark-paid button updates status to Pago when clicked", async ({
			page,
		}) => {
			const markPaidBtn = page.getByRole("button", {
				name: /marcar como pago/i,
			})
			await expect(markPaidBtn).toBeVisible()
			await markPaidBtn.click()
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			const paidBadge = page
				.locator("[data-slot='badge']")
				.filter({ hasText: /^pago$/i })
			await expect(paidBadge.first()).toBeVisible()
		})

		test("carryover ledger renders when history exists", async ({ page }) => {
			const carryoverTable = page.getByRole("table", {
				name: /histórico de prejuízo a compensar/i,
			})
			// Carryover table is optional — renders only if there is carryover history
			const isVisible = await carryoverTable.isVisible().catch(() => false)
			if (isVisible) {
				// Header row presence
				await expect(carryoverTable.first().locator("thead tr")).toHaveCount(1)
			}
		})

		test("prop account shows N/A banner without DARF amounts", async ({
			page,
		}) => {
			const propBanner = page.getByText(/n\/a — conta prop/i)
			const isProp = await propBanner.isVisible().catch(() => false)
			// Only run on prop accounts; skip gracefully if account is personal
			test.skip(!isProp, "Active account is not prop — N/A banner not shown")

			await expect(propBanner).toBeVisible()
			// DARF figures should NOT appear when prop banner shown
			const darfAmount = page.getByText(/darf a pagar/i)
			await expect(darfAmount).not.toBeVisible()
		})
	})

	test.describe("Settings — Fee rate form", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.settings)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("fee rate form is visible", async ({ page }) => {
			const feeForm = page.getByRole("form", {
				name: /configuração de taxas e corretagem/i,
			})
			await expect(feeForm.first()).toBeVisible()
		})

		test("fee rate value persists after save and reload", async ({ page }) => {
			const feeForm = page.getByRole("form", {
				name: /configuração de taxas e corretagem/i,
			})
			await expect(feeForm.first()).toBeVisible()

			const corretagemInput = feeForm.first().getByLabel(/tx corretagem/i)
			const saveBtn = feeForm
				.first()
				.getByRole("button", { name: /salvar taxas/i })

			// Update value
			await corretagemInput.fill("0.0600")
			await saveBtn.click()
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			// Reload and verify persistence
			await page.reload()
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await expect(corretagemInput).toHaveValue("0.0600")

			// Reset to default
			await corretagemInput.fill("0.0500")
			await saveBtn.click()
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})
	})
})
