import { test, expect } from "@playwright/test"
import { BRAVO } from "./fixtures/bravo-seed"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 1 — Foundation
 *
 * Bravo is now an admin (promoted at the end of Stage 0). This stage exercises
 * the admin-gated settings surfaces and proves that:
 *   - The Assets and Timeframes tabs are visible to her
 *   - She can create a real asset via the dialog
 *
 * Subsequent foundation work (timeframes, tags, conditions, risk profiles,
 * fee rates, first playbook strategy) lands incrementally in Phase 2 follow-ups
 * as they become required by Stages 2-4.
 *
 * Pre-condition: Stage 0 snapshot — Bravo authenticated AND admin.
 * Post-condition: One Bravo-owned asset persisted; storageState saved as Stage 1.
 *
 * @journey @stage:foundation
 */

const BRAVO_ASSET = {
	symbol: "BRVE2E",
	name: "Bravo Journey Asset",
	tickSize: "0.5",
	tickValue: "5",
} as const

test.describe("Journey Stage 1 — Foundation", () => {
	test.use(loadStageState(0))

	test("Bravo opens Settings as admin and creates her first asset", async ({
		page,
	}) => {
		await annotate(page, "Stage 1: Bravo configures her trading environment")

		await page.goto("/en/settings")
		await page.waitForLoadState("networkidle")
		await screenshotIfDemo(page, "01-01-settings-landing")

		// Profile is always visible; Assets/Timeframes require admin (verified
		// here as proof that Stage 0's admin promotion took effect).
		await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible()
		await expect(page.getByRole("tab", { name: "Assets" })).toBeVisible()
		await expect(page.getByRole("tab", { name: "Timeframes" })).toBeVisible()

		await annotate(page, "Admin tabs unlocked — Bravo opens Assets")

		await page.getByRole("tab", { name: "Assets" }).click()
		await page.waitForTimeout(500)
		await screenshotIfDemo(page, "01-02-assets-tab")

		const addAssetButton = page.getByRole("button", { name: /add asset/i })
		await expect(addAssetButton).toBeVisible()
		await addAssetButton.click()
		await page.waitForTimeout(300)

		const dialog = page.getByRole("dialog")
		await expect(dialog).toBeVisible()
		await screenshotIfDemo(page, "01-03-add-asset-dialog")

		await dialog.getByLabel(/symbol/i).fill(BRAVO_ASSET.symbol)
		await dialog.getByLabel(/name/i).fill(BRAVO_ASSET.name)
		await dialog.getByRole("combobox", { name: /type/i }).click()
		await page.getByRole("option").first().click()

		// Tick Size + Tick Value are required (form rejects parseFloat("") = NaN).
		// The Symbol/Name/Type trio is necessary but not sufficient.
		await dialog.getByLabel(/tick size/i).fill(BRAVO_ASSET.tickSize)
		await dialog.getByLabel(/tick value/i).fill(BRAVO_ASSET.tickValue)

		await annotate(page, "Bravo's first asset — saving")

		await dialog.getByRole("button", { name: /^add asset$/i }).click()
		// Dialog closes on success via onOpenChange(false). Wait for that as the
		// signal that the server action returned ok — beats a fixed timeout.
		await expect(dialog).not.toBeVisible({ timeout: 10000 })
		await screenshotIfDemo(page, "01-04-asset-created")

		// Verify the new asset shows up in the table. The DataTable renders rows
		// keyed by symbol; checking the row's visible text is sufficient.
		await expect(page.getByText(BRAVO_ASSET.symbol).first()).toBeVisible({
			timeout: 10000,
		})

		// Also confirm Bravo's identity is intact across stages.
		await page.getByRole("tab", { name: "Profile" }).click()
		await page.waitForTimeout(500)
		await expect(page.getByText(BRAVO.email)).toBeVisible({ timeout: 10000 })

		await annotate(page, "Foundation in progress — next stage: build the plan")

		await saveStageState(page, 1)
	})
})
