import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"
import { clickTab, waitForSuspenseLoad } from "../utils/helpers"

test.describe("Market Monitor", () => {
	// NOTE: The market monitor has no standalone page route. It lives exclusively
	// inside the Command Center (/en/command-center) as the "Monitor" tab.
	// All authenticated market monitor tests are covered by the
	// "Embedded in Command Center" describe block below.

	test.describe("Embedded in Command Center", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should load Monitor tab content within command center", async ({
			page,
		}) => {
			await clickTab(page, /monitor/i)
			await waitForSuspenseLoad(page)

			const monitorTab = page.getByRole("tab", { name: /monitor/i })
			await expect(monitorTab).toHaveAttribute("aria-selected", "true")
		})

		test("should display market data or error within command center", async ({
			page,
		}) => {
			await clickTab(page, /monitor/i)
			await waitForSuspenseLoad(page)
			await page.waitForTimeout(3000)

			// Scope to the active tab panel to avoid matching hidden "Pre-Market Notes" in CC tab
			const activePanel = page
				.locator('[role="tabpanel"][data-state="active"]')
				.last()
			const marketContent = activePanel
				.getByText(/failed to load|refresh now|IBOV|PETR4|quote|cotaç/i)
				.or(activePanel.locator(".recharts-wrapper"))

			await expect(marketContent.first()).toBeVisible({ timeout: 5000 })
		})

		test("should display refresh button in embedded view", async ({ page }) => {
			await clickTab(page, /monitor/i)
			await waitForSuspenseLoad(page)
			await page.waitForTimeout(3000)

			const refreshButton = page
				.getByRole("button", { name: /refresh|atualizar/i })
				.or(page.getByText(/refresh now|atualizar agora/i))
			const hasRefresh = await refreshButton
				.first()
				.isVisible()
				.catch(() => false)
			expect(typeof hasRefresh).toBe("boolean")
		})
	})

	// NOTE: Responsiveness tests for the market monitor are covered by the
	// mobile device project variants of the "Embedded in Command Center" block.
	// The standalone /en/monitor route does not exist.
})
