import { test, expect } from "@playwright/test"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 7 — Quarter + Year
 *
 * End of quarter / year. Bravo rolls up monthly performance into
 * quarter + year cockpit views, then opens the cross-account
 * comparison surface to benchmark one account against another.
 *
 *   • /en/plan/{YEAR}/{Q}            — Quarter cockpit (narrative,
 *                                       plan-vs-reality card).
 *   • /en/plan/{YEAR}                — Year cockpit (setup card,
 *                                       capital ladder, EOY banner).
 *   • /en/reports (annual section)   — Annual rollup + weekly meta-
 *                                       vs-real (anchored on
 *                                       #annual-section-heading).
 *   • /en/analytics/account-comparison — Multi-account benchmark
 *                                       (renders empty selector when
 *                                       Bravo has a single account).
 *
 * NOT exercised in this stage:
 *   • /en/capital-events — no dedicated route exists; capital ladder
 *     lives inside the year cockpit and is reached transitively
 *     through #plan-year-ladder when the year has events.
 *   • Re-running backtest + monte-carlo + equity shield — Stage 3
 *     already exercises those surfaces. Re-running here adds runtime
 *     without adding coverage; the design-doc intent (re-pressure-test
 *     with real data) needs a multi-month seeded history that Stage 4
 *     doesn't produce yet.
 *
 * Pre-condition: Stage 6 snapshot — Bravo authenticated, admin, with
 *                 her single Stage 4 trade reviewed at monthly + plan
 *                 cockpit level.
 * Post-condition: storageState saved as Stage 7. No DB delta.
 *
 * @journey @stage:quarterly
 */

const PLAN_YEAR = 2026

test.describe("Journey Stage 7 — Quarter + Year", () => {
	test.use(loadStageState(6))

	test.setTimeout(60_000)

	test("Bravo rolls up the quarter, the year, and compares accounts", async ({
		page,
	}) => {
		await annotate(
			page,
			"Stage 7: Quarter + year close — roll up, compare accounts"
		)

		// Trade lives in the current month (Stage 4 default-dated). Quarter
		// follows from month; same coord math the cockpit route guard uses.
		const month = new Date().getMonth() + 1
		const quarter = Math.ceil(month / 3)

		// ── 7a — Quarter cockpit
		await annotate(page, "Quarter — navigator + cockpit body")
		await page.goto(`/en/plan/${PLAN_YEAR}/${quarter}`, {
			waitUntil: "domcontentloaded",
		})
		// The cockpit shows #quarter-narrative ONLY when a quarterlyPlan row
		// exists in DB. Stage 2 seeds the yearly plan only, so this quarter
		// renders its empty state ("no quarter plan yet"). The Quarter-nav
		// landmark is always rendered and is the canonical mount proof.
		await expect(
			page.getByRole("navigation", { name: /quarter navigation/i })
		).toBeVisible({ timeout: 30_000 })
		await screenshotIfDemo(page, "07-01-quarter-cockpit")

		// ── 7b — Year cockpit
		await annotate(page, "Year — setup card, capital ladder, EOY projection")
		await page.goto(`/en/plan/${PLAN_YEAR}`, { waitUntil: "domcontentloaded" })
		// Setup summary card is the stable mount proof for the year cockpit
		// (see setup-summary-card.tsx:85).
		await expect(page.locator("#plan-year-setup-card")).toBeVisible({
			timeout: 30_000,
		})
		await screenshotIfDemo(page, "07-02-year-cockpit")

		// ── 7c — Annual report section on /en/reports
		await annotate(page, "Annual report — yearly rollup + meta-vs-real")
		await page.goto("/en/reports", { waitUntil: "domcontentloaded" })
		// Annual section renders #annual-section-heading when either the
		// annual rollup or the weekly meta-vs-real action returns data. With
		// a single trade in the current year, the rollup is non-empty so
		// the section mounts.
		await expect(page.locator("#annual-section-heading")).toBeVisible({
			timeout: 30_000,
		})
		await screenshotIfDemo(page, "07-03-annual-report")

		// ── 7d — Account comparison
		await annotate(page, "Accounts — compare one account against another")
		await page.goto("/en/analytics/account-comparison", {
			waitUntil: "domcontentloaded",
		})
		// Selector is always rendered, regardless of how many accounts exist.
		// See account-selector.tsx:54.
		await expect(page.locator("#comparison-selector")).toBeVisible({
			timeout: 30_000,
		})
		await screenshotIfDemo(page, "07-04-account-comparison")

		await annotate(
			page,
			"Quarter + year reviewed — next stage: improvement flywheel"
		)
		await saveStageState(page, 7)
	})
})
