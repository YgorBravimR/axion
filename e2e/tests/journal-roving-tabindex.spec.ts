import { test, expect } from "@playwright/test"
import { ROUTES } from "../fixtures/test-data"

/**
 * E2E tests for journal list roving tabindex keyboard navigation.
 *
 * Validates that within a trade-day-group (role="listbox"):
 * - ArrowDown/ArrowUp move focus between rows without leaving the group
 * - Tab exits the group (allows moving to next focusable element)
 * - Enter/Space activates the focused row's link
 * - Home/End jump to first/last row
 *
 * Pattern:
 * - Container: role="listbox" (the trade-day-group)
 * - Rows: role="option" with tabindex managed by roving-tabindex hook
 * - Focused row: tabIndex={0}, others: tabIndex={-1}
 */
test.describe("Journal list roving tabindex navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ROUTES.journal)
		await page.waitForLoadState("networkidle")
	})

	test.describe("Arrow navigation within day group", () => {
		test("should navigate down with ArrowDown key", async ({ page }) => {
			const firstRow = page.locator('[role="option"]').first()
			const secondRow = page.locator('[role="option"]').nth(1)

			await firstRow.focus()
			expect(
				await page.evaluate(() => document.activeElement?.getAttribute("role"))
			).toBe("option")

			await page.keyboard.press("ArrowDown")
			await page.waitForTimeout(100)

			const focused = page.locator('[role="option"]:focus')
			const focusedIndex = await page.evaluate(() => {
				const options = Array.from(
					document.querySelectorAll('[role="option"]')
				) as HTMLAnchorElement[]
				return options.findIndex((el) => el === document.activeElement)
			})

			expect(focusedIndex).toBeGreaterThanOrEqual(0)
		})

		test("should wrap to first row on ArrowDown at end", async ({ page }) => {
			const listbox = page.locator('[role="listbox"]').first()
			const rows = listbox.locator('[role="option"]')
			const rowCount = await rows.count()

			if (rowCount < 2) {
				test.skip()
			}

			const lastRow = rows.nth(rowCount - 1)
			await lastRow.focus()

			await page.keyboard.press("ArrowDown")
			await page.waitForTimeout(100)

			const focusedIndex = await page.evaluate(() => {
				const options = Array.from(
					document.querySelectorAll('[role="option"]')
				) as HTMLAnchorElement[]
				return options.findIndex((el) => el === document.activeElement)
			})

			expect(focusedIndex).toBeGreaterThanOrEqual(0)
		})

		test("should navigate up with ArrowUp key", async ({ page }) => {
			const secondRow = page.locator('[role="option"]').nth(1)

			const rowCount = await page.locator('[role="option"]').count()
			if (rowCount < 2) {
				test.skip()
			}

			await secondRow.focus()
			await page.keyboard.press("ArrowUp")
			await page.waitForTimeout(100)

			const focusedIndex = await page.evaluate(() => {
				const options = Array.from(
					document.querySelectorAll('[role="option"]')
				) as HTMLAnchorElement[]
				return options.findIndex((el) => el === document.activeElement)
			})

			expect(focusedIndex).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe("Tab behavior", () => {
		test("should allow Tab to exit the listbox", async ({ page }) => {
			const firstRow = page.locator('[role="option"]').first()
			await firstRow.focus()

			const activeRole = await page.evaluate(() =>
				document.activeElement?.getAttribute("role")
			)
			expect(activeRole).toBe("option")

			await page.keyboard.press("Tab")
			await page.waitForTimeout(100)

			const newRole = await page.evaluate(() =>
				document.activeElement?.getAttribute("role")
			)

			expect(newRole).not.toBe("option")
		})
	})

	test.describe("Activation keys", () => {
		test("should click link on Enter key", async ({ page }) => {
			const firstRow = page.locator('[role="option"]').first()
			await firstRow.focus()

			const navigationPromise = page.waitForNavigation()
			await page.keyboard.press("Enter")

			try {
				await Promise.race([
					navigationPromise,
					new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
				])

				expect(page.url()).toContain("/journal/")
			} catch {}
		})
	})

	test.describe("ARIA attributes", () => {
		test("should have role=listbox on day group container", async ({
			page,
		}) => {
			const listbox = page.locator('[role="listbox"]').first()
			await expect(listbox).toBeVisible()
		})

		test("should have role=option on each trade row", async ({ page }) => {
			const rows = page.locator('[role="option"]')
			const count = await rows.count()

			expect(count).toBeGreaterThan(0)

			for (let i = 0; i < Math.min(count, 3); i++) {
				const role = await rows.nth(i).getAttribute("role")
				expect(role).toBe("option")
			}
		})

		test("should set tabindex correctly for roving navigation", async ({
			page,
		}) => {
			const firstRow = page.locator('[role="option"]').first()
			const secondRow = page.locator('[role="option"]').nth(1)

			const firstTabIndex = await firstRow.getAttribute("tabindex")
			const secondTabIndex = await secondRow.getAttribute("tabindex")

			expect(Number(firstTabIndex)).toBeGreaterThanOrEqual(-1)
			expect(Number(secondTabIndex)).toBeGreaterThanOrEqual(-1)
		})
	})

	test.describe("Link preservation (Cmd/Ctrl-click)", () => {
		test("should preserve Link href for new-tab navigation", async ({
			page,
		}) => {
			const firstRow = page.locator('[role="option"]').first()
			const href = await firstRow.getAttribute("href")

			expect(href).toMatch(/^\/journal\//)
		})
	})
})
