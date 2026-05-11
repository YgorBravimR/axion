import { test, expect } from "@playwright/test"
import { BRAVO } from "./fixtures/bravo-seed"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 1 — Foundation (Phase 1 proof of concept scope)
 *
 * Phase 1 goal: prove the storageState handoff from Stage 0 works. The full
 * Foundation flow (assets, timeframes, tags, conditions, risk profiles, fee
 * rates, first playbook strategy) lands in Phase 2 once we resolve Q1 (seeder
 * coverage for stage pre-conditions) and decide how Bravo gets admin-only
 * settings tabs (Assets / Timeframes are gated to admins per
 * e2e/tests/settings.spec.ts L26-34).
 *
 * Pre-condition: Stage 0 snapshot — Bravo authenticated, dashboard reached.
 * Post-condition: Bravo's profile tab visible; storageState saved as Stage 1.
 *
 * @journey @stage:foundation
 */

test.describe("Journey Stage 1 — Foundation (POC)", () => {
	test.use(loadStageState(0))

	test("Bravo opens Settings and confirms her profile is wired up", async ({
		page,
	}) => {
		await annotate(page, "Stage 1: Bravo configures her trading environment")

		await page.goto("/en/settings")
		await page.waitForLoadState("networkidle")
		await screenshotIfDemo(page, "01-01-settings-landing")

		// Profile tab is always visible. Account/Assets/Timeframes vary by role
		// and account count — Phase 2 will cover them after we decide how Bravo
		// gets the admin-gated tabs (Q1 in the design doc).
		await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible()

		await annotate(page, "Profile loads — Bravo's identity is wired up")

		await page.getByRole("tab", { name: "Profile" }).click()
		await page.waitForTimeout(500)
		await screenshotIfDemo(page, "01-02-profile-tab")

		// Proves Stage 0's storageState handoff worked: Bravo is still logged in
		// and her email appears in the rendered profile.
		await expect(page.getByText(BRAVO.email)).toBeVisible({ timeout: 10000 })

		await annotate(page, "Foundation in progress — next stage: build the plan")

		await saveStageState(page, 1)
	})
})
