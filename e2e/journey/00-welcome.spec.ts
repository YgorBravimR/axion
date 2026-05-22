import { test, expect } from "../fixtures/base"
import { BRAVO } from "./fixtures/bravo-seed"
import { annotate } from "./helpers/annotate"
import { cleanupBravo } from "./helpers/cleanup-bravo"
import { promoteBravoToAdmin } from "./helpers/promote-bravo-to-admin"
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

test.describe(
	"Journey Stage 0 — Welcome",
	{ tag: ["@journey", "@stage:welcome"] },
	() => {
		test.use({ storageState: { cookies: [], origins: [] } })

		// Guard against stale state from a failed previous run. globalSetup runs in
		// the CLI launcher process where env vars may not be fully resolved, so its
		// cleanup can silently fail. This beforeAll runs in the test-worker process
		// where DATABASE_URL is always available, making Stage 0 self-healing.
		test.beforeAll(async () => {
			await cleanupBravo(BRAVO.email)
		})

		test("Bravo creates an account, logs in, and reaches the dashboard", async ({
			page,
		}) => {
			await annotate(page, "Bravo discovers Axion and creates her account")

			await page.goto("/en/register")
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
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

			// Promote Bravo to admin BEFORE login so the session cookie minted on
			// sign-in carries her elevated role. Required to access admin-gated
			// settings tabs (Assets, Timeframes) in Stage 1.
			await promoteBravoToAdmin(BRAVO.email)

			await annotate(
				page,
				"Account created — Bravo signs in for the first time"
			)

			// Force a clean navigation to /login so the registration form leaves the
			// DOM before we interact with the login inputs (otherwise #email and
			// #password resolve to two elements during the transition).
			await page.goto("/en/login")
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

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

			// networkidle (not load) here — the "Continue" account-selection server
			// action sends a Set-Cookie with the updated JWT (accountId). networkidle
			// ensures that cookie arrives before saveStageState captures the context.
			// Saving with load+1s races against the Set-Cookie and produces sessions
			// missing accountId, which the proxy redirects to login.
			await page.waitForLoadState("networkidle")
			await screenshotIfDemo(page, "00-05-dashboard-first-view")

			await annotate(
				page,
				"Welcome to Axion. The cockpit is empty — time to build it."
			)

			await saveStageState(page, 0)
		})
	}
)
