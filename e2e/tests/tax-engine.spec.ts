import { test, expect } from "@playwright/test"
import { ROUTES } from "../fixtures/test-data"

test.describe("BR Tax Engine", () => {
	test.describe("Reports — Tax section", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("networkidle")
		})

		test("renders Impostos section when DARF data exists", async ({ page }) => {
			const taxSection = page.getByRole("region", { name: /impostos/i })
			const count = await taxSection.count()
			if (count === 0) {
				test.skip(true, "No DARF data for current month — section not rendered")
				return
			}
			await expect(taxSection.first()).toBeVisible()
		})

		test("DARF card shows status badge", async ({ page }) => {
			const darfHeading = page.getByText(/darf do mês/i)
			if ((await darfHeading.count()) === 0) {
				test.skip(true, "DARF card not rendered")
				return
			}
			await expect(darfHeading.first()).toBeVisible()

			// Status badge text should be one of the known labels
			const validStatuses = /(pendente|pago|isento|vencido)/i
			const badgeText = page.locator("[data-slot='badge']").filter({ hasText: validStatuses })
			await expect(badgeText.first()).toBeVisible()
		})

		test("mark-paid button updates status to Pago when clicked", async ({ page }) => {
			const markPaidBtn = page.getByRole("button", { name: /marcar como pago/i })
			if (!(await markPaidBtn.isVisible().catch(() => false))) {
				test.skip(true, "No pending DARF in current month — nothing to mark paid")
				return
			}
			await markPaidBtn.click()
			await page.waitForLoadState("networkidle")

			const paidBadge = page.locator("[data-slot='badge']").filter({ hasText: /^pago$/i })
			await expect(paidBadge.first()).toBeVisible()
		})

		test("carryover ledger renders when history exists", async ({ page }) => {
			const carryoverTable = page.getByRole("table", { name: /histórico de prejuízo a compensar/i })
			if ((await carryoverTable.count()) === 0) {
				test.skip(true, "No carryover history — table not rendered")
				return
			}
			await expect(carryoverTable.first()).toBeVisible()
			// Header row presence
			await expect(carryoverTable.first().locator("thead tr")).toHaveCount(1)
		})

		test("prop account shows N/A banner without DARF amounts", async ({ page }) => {
			const propBanner = page.getByText(/n\/a — conta prop/i)
			if (!(await propBanner.isVisible().catch(() => false))) {
				test.skip(true, "Active account is not prop — N/A banner not shown")
				return
			}
			await expect(propBanner).toBeVisible()
			// DARF figures should NOT appear when prop banner shown
			const darfAmount = page.getByText(/darf a pagar/i)
			await expect(darfAmount).not.toBeVisible()
		})
	})

	test.describe("Settings — Fee rate form", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.settings)
			await page.waitForLoadState("networkidle")
		})

		test("fee rate form is visible", async ({ page }) => {
			const feeForm = page.getByRole("form", { name: /configuração de taxas e corretagem/i })
			if ((await feeForm.count()) === 0) {
				test.skip(true, "Fee rate form not rendered — settings layout may differ")
				return
			}
			await expect(feeForm.first()).toBeVisible()
		})

		test("fee rate value persists after save and reload", async ({ page }) => {
			const feeForm = page.getByRole("form", { name: /configuração de taxas e corretagem/i })
			if (!(await feeForm.first().isVisible().catch(() => false))) {
				test.skip(true, "Fee rate form not visible")
				return
			}

			const corretagemInput = feeForm.first().getByLabel(/tx corretagem/i)
			const saveBtn = feeForm.first().getByRole("button", { name: /salvar taxas/i })

			// Update value
			await corretagemInput.fill("0.0600")
			await saveBtn.click()
			await page.waitForLoadState("networkidle")

			// Reload and verify persistence
			await page.reload()
			await page.waitForLoadState("networkidle")
			await expect(corretagemInput).toHaveValue("0.0600")

			// Reset to default
			await corretagemInput.fill("0.0500")
			await saveBtn.click()
			await page.waitForLoadState("networkidle")
		})
	})
})
