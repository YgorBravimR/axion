import { test as setup, expect } from "@playwright/test"

// Use the admin user from seed.ts for full access to all features
const TEST_USER = {
	email: "admin@axion.com",
	password: "Admin123!",
}

setup("authenticate", async ({ page }) => {
	// Login with the seeded admin user
	await page.goto("/en/login")
	await page.waitForLoadState("networkidle")

	// Fill login form
	await page.getByLabel("Email").fill(TEST_USER.email)
	await page.locator("#password").fill(TEST_USER.password)
	await page.getByRole("button", { name: "Sign In" }).click()

	// Wait for either:
	// 1. Redirect to dashboard (single account)
	// 2. Account selection UI appears (multi-account) - this stays on /login page
	// 3. Error message
	const result = await Promise.race([
		page.waitForURL(/\/(en|pt-BR)\/?$/, { timeout: 30000 }).then(() => "dashboard"),
		page.getByText("Select Account").waitFor({ timeout: 30000 }).then(() => "select-account"),
		page.locator("text=/Invalid|Error/i").waitFor({ timeout: 30000 }).then(() => "error"),
	]).catch(() => "timeout")

	if (result === "error") {
		const errorText = await page.locator("text=/Invalid|Error/i").textContent().catch(() => "Unknown error")
		throw new Error(`Login failed: ${errorText}`)
	}

	if (result === "timeout") {
		const currentUrl = page.url()
		throw new Error(`Login timed out. Current URL: ${currentUrl}`)
	}

	// Handle account selection if shown (within login page, not separate URL)
	if (result === "select-account") {
		// The account selection UI is visible, "Personal" is pre-selected as default
		// Just click Continue to proceed with the default account
		await page.getByRole("button", { name: "Continue" }).click()

		// Wait for redirect to dashboard
		await expect(page).toHaveURL(/\/(en|pt-BR)\/?$/, { timeout: 30000 })
	}

	// Verify we're on the dashboard (no heading — verify via sidebar active link or metric cards)
	await expect(page.getByText(/Gross P&L|Net P&L|Trading Calendar/i).first()).toBeVisible({ timeout: 30000 })

	// Save authentication state
	await page.context().storageState({ path: "e2e/.auth/user.json" })
})
