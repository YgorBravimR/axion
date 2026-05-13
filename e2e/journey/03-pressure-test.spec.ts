import { test, expect } from "@playwright/test"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 3 — Pressure-Test
 *
 * Before risking real money, Bravo audits her plan against four
 * adversarial surfaces:
 *   • /en/backtest        — strategy-vs-history simulation
 *   • /en/monte-carlo     — Edge (V1) / Capital (V2) expectancy
 *   • /en/risk-simulation — replay her plan under stricter risk rules
 *   • /en/equity-shield   — drawdown shield calibration
 *
 * She has zero trades and zero playbook strategies at this point, so
 * backtest + risk-simulation + equity-shield render in their empty
 * states. Monte Carlo V1 is the only surface that produces a real
 * numeric result here — Manual mode synthesises a trade sequence
 * purely from win-rate / R:R / count inputs.
 *
 * Pre-condition: Stage 2 snapshot — Bravo authenticated, admin, with
 *                 her fractal plan tree seeded for PLAN_YEAR.
 * Post-condition: storageState saved as Stage 3. Bravo has not written
 *                 anything to the DB during this stage — pressure-test
 *                 surfaces are read-only diagnostics.
 *
 * @journey @stage:pressure-test
 */

test.describe("Journey Stage 3 — Pressure-Test", () => {
	test.use(loadStageState(6))

	test("Bravo audits her plan across backtest, monte carlo, risk-sim, and equity shield", async ({
		page,
	}) => {
		await annotate(
			page,
			"Stage 3: Before risking real money — stress-test the plan"
		)

		// ── 3a — Backtest surface (empty-state: no strategies yet)
		await annotate(page, "Backtest — strategy vs. historical data")
		await page.goto("/en/backtest")
		await page.waitForLoadState("networkidle")
		await expect(
			page.getByRole("heading", { level: 1, name: /backtest/i })
		).toBeVisible({ timeout: 10000 })
		await screenshotIfDemo(page, "03-01-backtest")

		// ── 3b — Monte Carlo V1 (Edge Expectancy) — Manual mode produces a result
		await annotate(
			page,
			"Monte Carlo — 1000 trial edge expectancy in manual mode"
		)
		await page.goto("/en/monte-carlo")
		await page.waitForLoadState("networkidle")
		await expect(
			page.getByRole("heading", { name: /monte carlo/i }).first()
		).toBeVisible({ timeout: 10000 })

		// Switch to Manual to bypass the "needs trades" data-source path.
		const manualSwitch = page.getByText(/manual/i).first()
		if (await manualSwitch.isVisible().catch(() => false)) {
			await manualSwitch.click()
		}

		// Inputs use stable form IDs (see simulation-params-form.tsx:64/94/180).
		await page.locator("#simulation-win-rate").fill("55")
		await page.locator("#simulation-reward-risk-ratio").fill("2")
		await page.locator("#simulation-count").fill("1000")
		await screenshotIfDemo(page, "03-02-monte-carlo-params")

		await page.locator("#monte-carlo-run-simulation").click()
		// Run-again button is the deterministic post-result control.
		await expect(page.locator("#monte-carlo-run-again")).toBeVisible({
			timeout: 30000,
		})
		await screenshotIfDemo(page, "03-03-monte-carlo-results")

		// ── 3c — Risk Simulation surface (empty-state: no trades to replay)
		await annotate(page, "Risk Simulation — replay history under tighter rules")
		await page.goto("/en/risk-simulation")
		await page.waitForLoadState("networkidle")
		await expect(
			page.getByRole("heading", { name: /risk simulation/i })
		).toBeVisible({ timeout: 10000 })
		await screenshotIfDemo(page, "03-04-risk-simulation")

		// ── 3d — Equity Shield surface (empty-state: no equity curve yet)
		await annotate(page, "Equity Shield — drawdown firewall calibration")
		await page.goto("/en/equity-shield")
		await page.waitForLoadState("networkidle")
		await expect(
			page.getByRole("heading", { name: /equity shield/i })
		).toBeVisible({ timeout: 10000 })
		await screenshotIfDemo(page, "03-05-equity-shield")

		await annotate(
			page,
			"Plan survived pressure — next stage: daily loop, first real trades"
		)
		await saveStageState(page, 7)
	})
})
