import { test, expect } from "@playwright/test"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 6 — Monthly Close
 *
 * End of month. Bravo reviews the month's aggregate performance,
 * inspects the DARF / tax section that lives inside /en/reports, and
 * revisits the corresponding month plan card in her fractal plan
 * cockpit. Three surfaces:
 *
 *   • /en/monthly                 — Monthly Performance page (navigator
 *                                   + profit summary + weekly bars).
 *   • /en/reports (tax section)   — DARF ledger card for the trade
 *                                   month (anchored on #tax-section-
 *                                   heading). Renders only when a
 *                                   monthly_darf row exists.
 *   • /en/plan/{YEAR}/{Q}/{M}     — Month plan card from the fractal
 *                                   tree (narrative + risk profile +
 *                                   month comparison).
 *
 * NOT exercised in this stage:
 *   • recompute-month trigger — no test-only endpoint exists, and a
 *     single-trade month does not exercise meaningful DARF carryover.
 *     Multi-month trade-history seeder is tracked in `docs/backlog.md`.
 *
 * Trade lives in the current month (Stage 4 logged it with default
 * date = now). PLAN_YEAR=2026 matches the seeded fractal tree from
 * Stage 2, and the trade month determines the quarter/month coords
 * for the plan cockpit hop.
 *
 * Pre-condition: Stage 5 snapshot — Bravo authenticated, admin, with
 *                 one trade in her journal and analytics dashboard
 *                 verified.
 * Post-condition: storageState saved as Stage 6. No DB delta — this
 *                 stage is read-only diagnostics.
 *
 * @journey @stage:monthly
 */

const PLAN_YEAR = 2026

test.describe(
	"Journey Stage 6 — Monthly Close",
	{ tag: ["@journey", "@stage:monthly"] },
	() => {
		test.use(loadStageState(4))

		test.setTimeout(60_000)

		test("Bravo closes the month: review aggregates, revisit the plan card", async ({
			page,
		}) => {
			await annotate(
				page,
				"Stage 6: Month close — review performance, revisit the plan card"
			)

			// ── 6a — Monthly Performance page
			await annotate(page, "Monthly — navigator + profit summary for the month")
			await page.goto("/en/monthly", { waitUntil: "domcontentloaded" })

			// Stable month navigator anchor (see monthly.spec.ts:33). The page has
			// no h1, so the navigator is the canonical mount proof.
			await expect(page.locator("#month-nav-previous")).toBeVisible({
				timeout: 30_000,
			})
			await expect(page.locator("#month-nav-next")).toBeVisible({
				timeout: 15_000,
			})
			await screenshotIfDemo(page, "06-01-monthly-performance")

			// ── 6b — Tax section (DARF ledger) on /en/reports
			await annotate(page, "Reports — DARF ledger for the trade month")
			await page.goto("/en/reports", { waitUntil: "domcontentloaded" })

			// Tax section renders #tax-section-heading only when a monthly_darf
			// row exists for the current month. Bravo's trading account defaults
			// to showTaxEstimates=true so getMonthlyDarf lazy-recomputes a row
			// after Stage 4's trade. If this anchor disappears (e.g., account
			// config changes default), demote to a soft check rather than failing.
			await expect(page.locator("#tax-section-heading")).toBeVisible({
				timeout: 30_000,
			})

			// Stage 4b seeded a loss month → carryover history must contain at
			// least one non-zero entry → CarryoverLedger renders the "Prejuízo
			// a Compensar" heading. If this fails, either the seeder regressed,
			// recompute-month.ts changed carryover semantics, or reports-content
			// stopped surfacing the ledger. All three are real signals.
			await expect(
				page.getByRole("heading", { name: /Prejuízo a Compensar/i })
			).toBeVisible({ timeout: 15_000 })
			await screenshotIfDemo(page, "06-02-darf-section")

			// ── 6c — Month plan cockpit card (fractal tree leaf for the trade month)
			await annotate(page, "Plan — month cockpit card, recalibrate next month")

			// Use today's month as the plan coord — Stage 4's trade was saved with
			// the default date (now), so the trade lives in the current month.
			const today = new Date()
			const month = today.getMonth() + 1
			const quarter = Math.ceil(month / 3)

			await page.goto(`/en/plan/${PLAN_YEAR}/${quarter}/${month}`, {
				waitUntil: "domcontentloaded",
			})

			// Month narrative section has a stable id; its presence proves the
			// month cockpit mounted past Suspense (see month-report.tsx:301).
			await expect(page.locator("#month-narrative")).toBeVisible({
				timeout: 30_000,
			})
			await screenshotIfDemo(page, "06-03-month-plan")

			await annotate(
				page,
				"Month closed — next stage: quarter + year rollups, capital events"
			)
			await saveStageState(page, 5)
		})
	}
)
