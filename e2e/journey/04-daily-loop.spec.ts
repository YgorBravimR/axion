import { test, expect } from "../fixtures/base"
import { annotate } from "./helpers/annotate"
import { installMarketMonitorMock } from "./helpers/mock-market-monitor"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

/**
 * Stage 4 — Daily Loop
 *
 * Bravo's first real trading day. The flow walks through the three
 * cockpit modes a disciplined trader cycles through every session:
 *
 *   • Pre-market   — Command Center (checklist, mood, plan summary)
 *   • Mid-session  — Market Monitor (live quotes, mocked here so the
 *                    test is deterministic and offline-safe) plus
 *                    Position Calculator (risk-bounded sizing)
 *   • Post-market  — Journal entry (manual single-trade form)
 *
 * Market Monitor data is served by an in-browser route mock installed
 * before navigation; product code is untouched. See
 * helpers/mock-market-monitor.ts for the fixture.
 *
 * Trade values use realistic WINFUT (mini-WIN) levels: entry ~190,200,
 * exit ~190,500, 5 contracts. Bravo account is cleaned by user-level
 * teardown (bravo-%@axion-demo.com cascade), not by the entry-price pattern.
 *
 * Pre-condition: Stage 2 snapshot — Bravo authenticated, admin, with
 *                 her fractal plan tree intact and prior-month history
 *                 seeded (Stage 4b).
 * Post-condition: One trade exists in Bravo's journal; storageState
 *                 saved as Stage 4.
 *
 * @journey @stage:daily-loop
 */

test.describe(
	"Journey Stage 4 — Daily Loop",
	{ tag: ["@journey", "@stage:daily-loop"] },
	() => {
		// This stage visits 4 pages and fills 2 forms — wall-clock cost easily
		// exceeds the 30 s default. 120 s gives comfortable headroom.
		test.describe.configure({ timeout: 120_000 })
		test.use(loadStageState(2))

		test("Bravo runs her first trading day: prep, monitor, calculate, log", async ({
			page,
		}) => {
			await annotate(
				page,
				"Stage 4: First real trading day — three cockpit modes"
			)

			// Install the market mock before any page that hits /api/market/*
			await installMarketMonitorMock(page)

			// ── 4a — Pre-market: Command Center
			await annotate(
				page,
				"Pre-market — open the cockpit, check plan and discipline"
			)
			await page.goto("/en/command-center")
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			// Command Center tab is the default; its tablist is the stable anchor.
			await expect(
				page.getByRole("tab", { name: /command center/i })
			).toBeVisible({ timeout: 10000 })
			await screenshotIfDemo(page, "04-01-command-center")

			// ── 4b — Mid-session: Market Monitor tab (consumes the mock)
			await annotate(
				page,
				"Mid-session — scan the tape (quotes mocked for determinism)"
			)
			await page.getByRole("tab", { name: /monitor/i }).click()
			// The mock injects "S&P 500" both as hero (^GSPC) and group quote.
			// Either rendering path is sufficient evidence the feed reached UI.
			await expect(page.getByText(/s&p 500/i).first()).toBeVisible({
				timeout: 15000,
			})
			await screenshotIfDemo(page, "04-02-market-monitor")

			// ── 4c — Mid-session: Position Calculator tab (risk-bounded sizing)
			await annotate(page, "Mid-session — position calculator, R-budgeted size")
			await page.getByRole("tab", { name: /calculator/i }).click()
			// Form is lazy-loaded; the asset combobox is the stable settle anchor.
			await expect(page.locator("#calculator-asset")).toBeVisible({
				timeout: 10000,
			})
			await page.locator("#calculator-entry-price").fill("100")
			await page.locator("#calculator-stop-price").fill("95")
			await page.locator("#calculator-target-price").fill("110")
			await screenshotIfDemo(page, "04-03-calculator-filled")

			// ── 4d — Post-market: log the day's trade
			await annotate(
				page,
				"Post-market — log the trade. Entry=190200 exit=190500 size=5 (WINFUT)"
			)
			await page.goto("/en/journal/new")
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await expect(
				page.getByRole("tab", { name: /single entry/i })
			).toBeVisible({
				timeout: 10000,
			})

			// Asset combobox: open and pick the first available (Bravo's BRVE2E).
			await page.getByRole("combobox").first().click()
			await page.getByRole("option").first().click()

			// Spinbuttons (no <label> association in the form). Order is stable:
			// [0]=Entry, [1]=Exit, [2]=Position Size. See journal.spec.ts:222.
			const spinbuttons = page.getByRole("spinbutton")
			await spinbuttons.nth(0).fill("190200")
			await spinbuttons.nth(1).fill("190500")
			await spinbuttons.nth(2).fill("5")
			await screenshotIfDemo(page, "04-04-trade-form-filled")

			await annotate(page, "Trade — saving")
			await page.getByRole("button", { name: /save trade/i }).click()

			// Submit redirects to the list (or to the detail page); both match.
			await expect(page).toHaveURL(/journal(?!\/new)/, { timeout: 15000 })
			await screenshotIfDemo(page, "04-05-trade-saved")

			// ── 4e — Verify the trade lives in the journal list
			await page.goto("/en/journal")
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			// Trades render as role="option" inside role="listbox" day-groups (TradeDayGroup → TradeRow).
			await expect(
				page.locator('[role="listbox"] [role="option"]').first()
			).toBeVisible({
				timeout: 20000,
			})
			await screenshotIfDemo(page, "04-06-journal-with-trade")

			await annotate(page, "First trade logged — next stage: weekly reflection")
			await saveStageState(page, 3)
		})
	}
)
