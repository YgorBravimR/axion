import { test as setup, expect } from "@playwright/test"

// Use the admin user from seed.ts for full access to all features
const TEST_USER = {
	email: "admin@bravo.com",
	password: "Admin123!",
}

setup("authenticate", async ({ page }) => {
	// Headroom over Playwright's 30s default test timeout. The URL race below
	// has three 30s sub-waits; with a 30s test budget the race's own catch never
	// runs and the test dies as "Test timeout of 30000ms exceeded" instead of
	// the friendlier "Login timed out. Current URL: ..." we try to throw.
	setup.setTimeout(90_000)

	// Login with the seeded admin user. Per docs/gotchas.md:513, `networkidle`
	// reliably times out under React 19 / Next.js 16 — HMR WebSocket and RSC
	// streaming keep the network non-idle indefinitely. Use `load + 1s` here
	// since the login page itself has no critical session-boundary fetches
	// (the storage-state save at the end is what needs cookies — by then the
	// JWT Set-Cookie has already landed via the redirect response).
	await page.goto("/en/login")
	await page.waitForLoadState("load")
	await page.waitForTimeout(1000)

	// If already logged in (session from prior run still valid), the page redirects
	// to dashboard before form renders. Detect this early to avoid waiting 30s for
	// a form field that doesn't exist.
	if (!page.url().includes("/login")) {
		// Already on dashboard, skip form fill
	} else {
		// Fill login form
		await page.getByLabel("Email").fill(TEST_USER.email)
		await page.locator("#password").fill(TEST_USER.password)
		await page.getByRole("button", { name: "Sign In" }).click()
	}

	// Wait for either:
	// 1. Redirect away from /login (any locale, any sub-route)
	// 2. Account selection UI appears (multi-account) — stays on /login
	// 3. Error message
	const result = await Promise.race([
		page
			.waitForURL((url) => !url.pathname.endsWith("/login"), {
				timeout: 20_000,
			})
			.then(() => "dashboard"),
		page
			.getByText(/Select Account|Selecione (uma )?Conta/i)
			.waitFor({ timeout: 20_000 })
			.then(() => "select-account"),
		page
			.locator("text=/Invalid|Error|Inválido|Erro/i")
			.waitFor({ timeout: 20_000 })
			.then(() => "error"),
	]).catch(() => "timeout")

	if (result === "error") {
		const errorText = await page
			.locator("text=/Invalid|Error|Inválido|Erro/i")
			.textContent()
			.catch(() => "Unknown error")
		throw new Error(`Login failed: ${errorText}`)
	}

	if (result === "timeout") {
		const currentUrl = page.url()
		throw new Error(`Login timed out. Current URL: ${currentUrl}`)
	}

	// Handle account selection if shown (within login page, not separate URL)
	if (result === "select-account") {
		// The account selection UI is visible, "Personal" is pre-selected as default
		// Just click Continue / Continuar to proceed with the default account
		await page.getByRole("button", { name: /Continue|Continuar/i }).click()

		// Wait for redirect to dashboard
		await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
			timeout: 20_000,
		})
	}

	// Verify dashboard rendered — locale-agnostic. The seeded admin can render
	// in en or pt-BR depending on their saved preference.
	await expect(
		page
			.getByText(
				/Gross P&L|Net P&L|Trading Calendar|Calendário de Trades|Painel|Início/i
			)
			.first()
	).toBeVisible({ timeout: 20_000 })

	// Save authentication state
	await page.context().storageState({ path: "e2e/.auth/user.json" })
})
