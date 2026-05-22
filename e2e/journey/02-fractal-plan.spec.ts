import { test, expect } from "../fixtures/base"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 2 — Fractal Plan
 *
 * Bravo configures her account lifecycle (start year, opening balance,
 * withdrawal target) then seeds her yearly plan, which the server action
 * fans out into a full Y → Q → M → W tree (~69 rows). The tree is the
 * substrate every subsequent stage reads from:
 *   - Stage 3 pressure-tests the plan
 *   - Stage 4 logs trades against it
 *   - Stage 5 reviews weekly performance
 *   - Stage 6 closes the month + tax cycle
 *
 * The plan year MUST equal `account.accountStartYear`; otherwise the
 * editor's pre-save gate (`!existing && !accountCapitalAvailable`) trips
 * even though the balance is set. See plan/[year]/page.tsx:99-102 for the
 * year-match constraint that wires `account.startingBalanceCents` to
 * `defaultInitialCapitalCents`.
 *
 * Pre-condition: Stage 1 snapshot — Bravo authenticated, admin, with one
 *                 asset persisted. Risk profiles were auto-seeded when she
 *                 visited Settings (admin-gated seedBuiltInRiskProfiles).
 * Post-condition: Yearly plan exists for PLAN_YEAR; storageState saved as
 *                 Stage 2.
 *
 * @journey @stage:fractal-plan
 */

const PLAN_YEAR = 2026
const STARTING_BALANCE_REAIS = 30_000
const STARTING_BALANCE_DIGITS = String(STARTING_BALANCE_REAIS * 100)

test.describe(
	"Journey Stage 2 — Fractal Plan",
	{ tag: ["@journey", "@stage:fractal-plan"] },
	() => {
		test.use(loadStageState(1))

		test("Bravo sets her account lifecycle and seeds the yearly plan", async ({
			page,
		}) => {
			await annotate(
				page,
				"Stage 2: Bravo translates intent into a fractal plan"
			)

			// ── 2a — Account lifecycle (Settings → Profile, annual reporting fieldset)
			await page.goto("/en/settings")
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await screenshotIfDemo(page, "02-01-settings-profile")

			const startMonth = page.locator("#account-start-month")
			await startMonth.scrollIntoViewIfNeeded()
			await startMonth.selectOption("1")

			await page.locator("#account-start-year").fill(String(PLAN_YEAR))
			await page.locator("#starting-balance").fill(STARTING_BALANCE_DIGITS)
			await page.locator("#withdrawal-target").fill("20")
			await screenshotIfDemo(page, "02-02-account-lifecycle-filled")

			await annotate(page, "Account lifecycle — saving")
			await page.getByRole("button", { name: /save annual settings/i }).click()

			await expect(page.getByText(/annual settings saved/i)).toBeVisible({
				timeout: 10000,
			})
			await screenshotIfDemo(page, "02-03-account-saved")

			// ── 2b — Seed yearly plan via SetupSummaryCard → slideover
			await annotate(
				page,
				`Bravo opens the planner for ${PLAN_YEAR} — empty slate, full intent`
			)
			await page.goto(`/en/plan/${PLAN_YEAR}`)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await screenshotIfDemo(page, "02-04-plan-year-empty")

			const editButton = page.locator(`#setup-edit-${PLAN_YEAR}`)
			await expect(editButton).toBeVisible()
			await editButton.click()

			const slideover = page.locator(`#yearly-slideover-${PLAN_YEAR}`)
			await expect(slideover).toBeVisible()
			await screenshotIfDemo(page, "02-05-yearly-editor-open")

			// All required fields ship with sensible defaults (see seedForm() in
			// yearly-plan-editor.tsx:108-120). Notes are the one optional touch we
			// add for showcase purposes.
			await slideover
				.locator("#yearly-notes")
				.fill(
					`First plan as a disciplined trader. Target: consistency over heroics. Starting capital R$ ${STARTING_BALANCE_REAIS.toLocaleString("en-US")}.`
				)

			await annotate(page, "Yearly plan — seeding the fractal tree")
			await page.locator("#btn-yearly-save").click()

			await expect(
				page.getByText(/yearly plan seeded|quarter\/month\/week tree/i)
			).toBeVisible({ timeout: 15000 })
			await screenshotIfDemo(page, "02-06-plan-seeded")

			// ── 2c — Cockpit grid materialised: month-1-week-1 link rendered.
			// Month labels go through Intl.DateTimeFormat with the user's locale, so
			// we anchor on the deterministic plan-tree URL instead of a month name.
			await expect(
				page.locator(`a[href*="/plan/${PLAN_YEAR}/1/1"]`).first()
			).toBeVisible({ timeout: 15000 })
			await screenshotIfDemo(page, "02-07-cockpit-grid")

			await annotate(page, "Plan in place — next stage: pressure-test it")
			await saveStageState(page, 2)
		})
	}
)
