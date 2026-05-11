import { test, expect } from "@playwright/test"
import { BRAVO } from "./fixtures/bravo-seed"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { saveStageState } from "./helpers/storage-state"

/**
 * Stage 0 — Welcome
 *
 * Implements the Welcome stage from docs/zero-to-hero.md:
 *   Register account → verify email (auto) → login → land on dashboard.
 *
 * Pre-condition: clean storage state (no auth).
 * Post-condition: Bravo is authenticated; storageState saved to
 *                 e2e/.auth/journey-stage-0.json for Stage 1.
 *
 * @journey @stage:welcome
 */

test.describe("Journey Stage 0 — Welcome", () => {
	test.use({ storageState: { cookies: [], origins: [] } })

	test("Bravo creates an account, logs in, and reaches the dashboard", async ({
		page,
	}) => {
		await annotate(page, "Bravo discovers Axion and creates her account")

		await page.goto("/en/register")
		await page.waitForLoadState("networkidle")
		await screenshotIfDemo(page, "00-01-register-form")

		await page.getByLabel("Full Name").fill(BRAVO.name)
		await page.getByLabel("Email").fill(BRAVO.email)
		await page.locator('input[type="password"]').first().fill(BRAVO.password)
		await page.locator('input[type="password"]').nth(1).fill(BRAVO.password)
		await screenshotIfDemo(page, "00-02-register-filled")

		await page.getByRole("button", { name: "Create Account" }).click()

		await expect(page).toHaveURL(/\/(en|pt-BR)\/login\?registered=true$/, {
			timeout: 15000,
		})
		await screenshotIfDemo(page, "00-03-register-success")

		await annotate(page, "Account created — Bravo signs in for the first time")

		// Force a clean navigation to /login so the registration form leaves the
		// DOM before we interact with the login inputs (otherwise #email and
		// #password resolve to two elements during the transition).
		await page.goto("/en/login")
		await page.waitForLoadState("networkidle")

		await page.locator("#email").fill(BRAVO.email)
		await page.locator("#password").fill(BRAVO.password)
		await page.getByRole("button", { name: "Sign In" }).click()

		const outcome = await Promise.race([
			page
				.getByText("Select Account")
				.waitFor({ timeout: 15000 })
				.then(() => "select-account" as const),
			page
				.waitForURL(/\/(en|pt-BR)\/?$/, { timeout: 15000 })
				.then(() => "dashboard" as const),
		]).catch(() => "timeout" as const)

		expect(outcome).not.toBe("timeout")

		if (outcome === "select-account") {
			await annotate(page, "Bravo selects her default trading account")
			await screenshotIfDemo(page, "00-04-select-account")
			await page.getByRole("button", { name: "Continue" }).click()
			await expect(page).toHaveURL(/\/(en|pt-BR)\/?$/, { timeout: 15000 })
		}

		await page.waitForLoadState("networkidle")
		await screenshotIfDemo(page, "00-05-dashboard-first-view")

		await annotate(
			page,
			"Welcome to Axion. The cockpit is empty — time to build it."
		)

		await saveStageState(page, 0)
	})
})
