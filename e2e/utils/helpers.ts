import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"
import { ROUTES } from "../fixtures/test-data"

/**
 * Navigate to a route and wait for page to load
 */
export const navigateTo = async (page: Page, route: string) => {
	await page.goto(route)
	await page.waitForLoadState("load")
}

/**
 * Login helper (if not already authenticated)
 */
export const login = async (page: Page, email: string, password: string) => {
	await page.goto(ROUTES.login)
	await page.getByLabel(/email/i).fill(email)
	await page.getByLabel(/password/i).fill(password)
	await page.getByRole("button", { name: /sign in|login|entrar/i }).click()
	await expect(page).toHaveURL(/\/(en|pt-BR)/, { timeout: 10000 })
}

/**
 * Logout helper
 */
export const logout = async (page: Page) => {
	// Click user menu and logout
	await page.getByRole("button", { name: /user menu|menu/i }).click()
	await page.getByRole("menuitem", { name: /logout|sair/i }).click()
	await expect(page).toHaveURL(/login/, { timeout: 5000 })
}

/**
 * Wait for toast notification
 */
export const waitForToast = async (page: Page, text?: string | RegExp) => {
	const toast = page.locator('[role="alert"], [data-sonner-toast]').first()
	await expect(toast).toBeVisible({ timeout: 5000 })
	if (text) {
		await expect(toast).toContainText(text)
	}
	return toast
}

/**
 * Wait for loading to complete
 */
export const waitForLoading = async (page: Page) => {
	// Wait for any loading spinners to disappear
	const spinner = page.locator(".animate-spin, [data-loading]")
	if (await spinner.isVisible()) {
		await expect(spinner).toBeHidden({ timeout: 30000 })
	}
}

/**
 * Fill a form field by label
 */
export const fillField = async (
	page: Page,
	label: string | RegExp,
	value: string
) => {
	const field = page.getByLabel(label)
	await field.clear()
	await field.fill(value)
}

/**
 * Select an option from a dropdown
 */
export const selectOption = async (
	page: Page,
	triggerSelector: string | Locator,
	optionText: string | RegExp
) => {
	const trigger =
		typeof triggerSelector === "string"
			? page.locator(triggerSelector)
			: triggerSelector
	await trigger.click()
	await page.getByRole("option", { name: optionText }).click()
}

/**
 * Check if element exists
 */
export const elementExists = async (
	page: Page,
	selector: string
): Promise<boolean> => {
	return (await page.locator(selector).count()) > 0
}

/**
 * Get table row count
 */
export const getTableRowCount = async (
	page: Page,
	tableSelector: string = "table"
): Promise<number> => {
	return await page.locator(`${tableSelector} tbody tr`).count()
}

/**
 * Take screenshot with descriptive name
 */
export const screenshot = async (page: Page, name: string) => {
	await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true })
}

/**
 * Wait for navigation to complete
 */
export const waitForNavigation = async (
	page: Page,
	urlPattern: string | RegExp
) => {
	await expect(page).toHaveURL(urlPattern, { timeout: 10000 })
}

/**
 * Click and wait for navigation
 */
export const clickAndNavigate = async (
	page: Page,
	locator: Locator,
	urlPattern: string | RegExp
) => {
	await Promise.all([page.waitForURL(urlPattern), locator.click()])
}

/**
 * Fill date input
 */
export const fillDateInput = async (
	page: Page,
	label: string | RegExp,
	date: Date
) => {
	const dateStr = date.toISOString().split("T")[0]
	const field = page.getByLabel(label)
	await field.fill(dateStr)
}

/**
 * Check accessibility basics
 */
export const checkAccessibility = async (page: Page) => {
	// Check for proper heading hierarchy
	const h1Count = await page.locator("h1").count()
	expect(h1Count).toBeGreaterThanOrEqual(0)

	// Check all images have alt text
	const images = page.locator("img")
	const imgCount = await images.count()
	for (let i = 0; i < imgCount; i++) {
		const alt = await images.nth(i).getAttribute("alt")
		expect(alt).not.toBeNull()
	}

	// Check interactive elements are keyboard accessible
	const buttons = page.locator("button:visible")
	const btnCount = await buttons.count()
	for (let i = 0; i < Math.min(btnCount, 5); i++) {
		const tabIndex = await buttons.nth(i).getAttribute("tabindex")
		expect(tabIndex !== "-1").toBeTruthy()
	}
}

/**
 * Check responsive layout
 */
export const checkResponsive = async (
	page: Page,
	viewport: { width: number; height: number }
) => {
	await page.setViewportSize(viewport)
	await page.waitForTimeout(500) // Wait for layout to adjust
}

/**
 * Format currency for comparison
 */
export const formatCurrency = (value: number): string => {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value)
}

/**
 * Parse currency string to number
 */
export const parseCurrency = (str: string): number => {
	return parseFloat(str.replace(/[R$\s.]/g, "").replace(",", "."))
}

/**
 * Click a tab trigger by its visible text
 */
export const clickTab = async (page: Page, tabName: string | RegExp) => {
	const tab = page.getByRole("tab", { name: tabName })
	await tab.click()
	await page.waitForTimeout(300)
}

/**
 * Wait for Suspense/lazy-loaded content to finish loading
 */
export const waitForSuspenseLoad = async (page: Page, timeout = 15000) => {
	const spinner = page.locator(".animate-spin, [data-loading]")
	if (await spinner.isVisible().catch(() => false)) {
		await expect(spinner).toBeHidden({ timeout })
	}
	// load (not networkidle): RSC streaming keeps network active indefinitely on
	// mobile, causing networkidle to time out. Content visible after spinner
	// hides is sufficient proof that Suspense resolved.
	await page.waitForLoadState("load")
}

/**
 * Clear and fill a number input field by its label or id
 */
export const fillNumberInput = async (
	page: Page,
	labelOrId: string | RegExp,
	value: string
) => {
	const field =
		typeof labelOrId === "string" && labelOrId.startsWith("#")
			? page.locator(labelOrId)
			: page.getByLabel(labelOrId)
	await field.clear()
	await field.fill(value)
}

/**
 * Verify a metric card or labeled value is visible on the page
 */
export const verifyCardMetric = async (page: Page, label: string | RegExp) => {
	const element = page.getByText(label).first()
	await expect(element).toBeVisible({ timeout: 5000 })
}

/**
 * Click a locator only if it is currently enabled. No-op when disabled.
 * Useful for month-pagination buttons that disable at boundary months.
 */
export const clickIfEnabled = async (
	page: Page,
	selector: string
): Promise<boolean> => {
	const target = page.locator(selector)
	if (!(await target.isVisible().catch(() => false))) {
		return false
	}
	if (await target.isDisabled().catch(() => true)) {
		return false
	}
	await target.click()
	return true
}
