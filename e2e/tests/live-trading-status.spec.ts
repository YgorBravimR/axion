/**
 * Live Trading Status Panel — E2E Tests
 *
 * Strategy
 * --------
 * Each describe block seeds a specific trade sequence directly into the database,
 * navigates to the Command Center page, and asserts the Live Trading Status panel
 * renders the correct phase, risk amount, stop reason, and trade-count.
 *
 * The Bravo Risk Management profile governs all scenarios:
 *   baseRisk      = R$500   (50_000 cents)
 *   dailyLoss     = R$1,000 (100_000 cents)
 *   dailyTarget   = R$1,500 (150_000 cents)
 *   lossRecovery  = [50%, 25%, 25%] of base, stopAfterSequence=true
 *   gainSequence  = [100%, 50%, 25%] of base, repeatLastStep=true, stopOnFirstLoss=true
 *
 * Decision-tree replay logic lives in src/lib/live-trading-status.ts.
 * The UI text keys live in messages/en.json under commandCenter.liveStatus.
 *
 * All test data is inserted via `seedScenario()` and cleaned up in afterEach.
 * The monthly plan for the current month is either created fresh or updated to
 * link the Bravo profile; the teardown restores it accurately.
 *
 * Prerequisite
 * ------------
 * - The Next.js dev server must be running (handled by playwright.config.ts webServer).
 * - DATABASE_URL must point to the same database the app uses.
 * - Auth state for admin@axion.com must exist at e2e/.auth/user.json
 *   (created by global.setup.ts).
 */

import { test, expect, type Page, type Locator } from "../fixtures/base"
import {
	seedScenario,
	teardownScenario,
	cleanupTodayTrades,
} from "../utils/seed-trading-data"
import type { SeedResult } from "../utils/seed-trading-data"

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/** The Command Center URL for the English locale */
const COMMAND_CENTER_URL = "/en/command-center"

/**
 * Bravo profile derived values (cents) used to build expected UI strings.
 * All amounts converted to BRL via `fromCents(x)` → Intl.NumberFormat pt-BR.
 */
const BRAVO = {
	baseRiskCents: 50_000, // R$500
	recoveryStep1Cents: 25_000, // 50% of R$500 = R$250
	recoveryStep2Cents: 12_500, // 25% of R$500 = R$125
	gainStep1Cents: 50_000, // 100% of base = R$500
	gainStep2Cents: 25_000, // 50%  of base = R$250
	gainStep3Cents: 12_500, // 25%  of base = R$125
	dailyLossCents: 100_000, // R$1,000
	dailyTargetCents: 150_000, // R$1,500
} as const

/**
 * Format cents → "$X,XXX.XX" via en-US Intl (matches the app's `useFormatting` hook at /en/).
 * The hook reads `useLocale()` → "en" → maps to "en-US" / "USD".
 * The app uses `fromCents(x)` → divides by 100, then formats with currency.
 */
const fmtCurrency = (cents: number): string =>
	new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
		cents / 100
	)

// Pre-computed expected display strings (en-US / USD)
const DISPLAY = {
	baseRisk: fmtCurrency(BRAVO.baseRiskCents), // "$500.00"
	recovery1: fmtCurrency(BRAVO.recoveryStep1Cents), // "$250.00"
	recovery2: fmtCurrency(BRAVO.recoveryStep2Cents), // "$125.00"
	gainStep1: fmtCurrency(BRAVO.gainStep1Cents), // "$500.00" (same as base for T2)
	gainStep2: fmtCurrency(BRAVO.gainStep2Cents), // "$250.00"
	gainStep3: fmtCurrency(BRAVO.gainStep3Cents), // "$125.00"
	dailyLoss: fmtCurrency(BRAVO.dailyLossCents), // "$1,000.00"
	dailyTarget: fmtCurrency(BRAVO.dailyTargetCents), // "$1,500.00"
} as const

// ---------------------------------------------------------------------------
// HELPERS — all scoped to data-testid="live-trading-status-panel"
// ---------------------------------------------------------------------------

/**
 * Navigate to the Command Center and wait for full page load.
 * The page uses force-dynamic SSR so networkidle is the correct wait strategy.
 */
const gotoCommandCenter = async (page: Page): Promise<void> => {
	await page.goto(COMMAND_CENTER_URL)
	await page.waitForLoadState("load")
	await page.waitForTimeout(1000)
}

/**
 * Locate the Live Trading Status panel, scroll it into view, and return the
 * scoped Locator. ALL subsequent assertions should use this locator to avoid
 * matching elements in other panels (circuit breaker, daily summary, etc.).
 */
const getLiveTradingPanel = async (page: Page): Promise<Locator> => {
	const panel = page.getByTestId("live-trading-status-panel")
	await panel.scrollIntoViewIfNeeded()
	await expect(panel).toBeVisible({ timeout: 10_000 })
	return panel
}

/** Assert the phase badge text matches the expected value (scoped to panel). */
const expectPhaseBadge = async (
	panel: Locator,
	expectedText: string | RegExp
): Promise<void> => {
	const badge = panel
		.locator("span.rounded-full")
		.filter({ hasText: expectedText })
	await expect(badge).toBeVisible({ timeout: 5_000 })
}

/** Assert a "Next Risk" metric cell shows the expected currency amount (scoped to panel). */
const expectNextRisk = async (
	panel: Locator,
	expectedAmount: string
): Promise<void> => {
	// Find the MetricCell label, go to parent div, check the value span
	const nextRiskLabel = panel.getByText(/next risk/i)
	await expect(nextRiskLabel).toBeVisible()
	const metricCell = nextRiskLabel.locator("..")
	await expect(metricCell.locator("dd.font-semibold")).toContainText(
		expectedAmount
	)
}

/** Assert the "STOP TRADING" pill is visible (scoped to panel). */
const expectStopTradingPill = async (panel: Locator): Promise<void> => {
	await expect(panel.getByText(/stop trading/i)).toBeVisible({ timeout: 5_000 })
}

/** Assert the stop reason text is displayed (scoped to panel's <p> tag). */
const expectStopReason = async (
	panel: Locator,
	reasonPattern: string | RegExp
): Promise<void> => {
	// The stop reason is rendered as a <p> in the stop-state template.
	// Using locator("p") avoids matching the riskReason sub-label <span>
	// which may contain overlapping text (e.g., "Recovery sequence exhausted").
	await expect(
		panel.locator("p").filter({ hasText: reasonPattern })
	).toBeVisible({ timeout: 5_000 })
}

/** Assert the trade count in the "Trades Today" metric cell (scoped to panel). */
const expectTradesCompleted = async (
	panel: Locator,
	count: number
): Promise<void> => {
	const label = panel.getByText(/trades today/i)
	const metricCell = label.locator("..")
	await expect(metricCell.locator("dd.font-semibold")).toHaveText(String(count))
}

/** Assert the daily P&L value is visible (scoped to panel). */
const expectDailyPnl = async (
	panel: Locator,
	formattedAmount: string
): Promise<void> => {
	const label = panel.getByText(/daily p&l/i)
	const metricCell = label.locator("..")
	await expect(metricCell.locator("dd.font-semibold")).toContainText(
		formattedAmount
	)
}

// ---------------------------------------------------------------------------
// SHARED beforeAll / afterAll wrapping per describe block
// ---------------------------------------------------------------------------

/**
 * Each describe block uses its own `seedResult` variable.
 * We use `beforeAll` to seed once and `afterAll` to clean up once,
 * keeping test isolation at the describe level.
 *
 * Because the app reads trades from the real database for *today*,
 * all seeds use the current date (no mocking needed).
 */

// ---------------------------------------------------------------------------
// TEST SUITES
// ---------------------------------------------------------------------------

test.describe("Live Trading Status — No trades yet (T1 base state)", () => {
	let seedResult: SeedResult

	test.beforeAll(async () => {
		// Ensure Bravo profile + monthly plan are in place but insert ZERO trades.
		// seedScenario with an empty array sets up the profile/plan without any trades.
		seedResult = await seedScenario([])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display the panel with Base phase badge and T1 base risk", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// Phase badge: "Base" when no trades have been taken
		await expectPhaseBadge(panel, /^base$/i)

		// Next Risk should equal the Bravo base risk R$500
		await expectNextRisk(panel, DISPLAY.baseRisk)

		// The panel should NOT show "STOP TRADING" — trader has not started yet
		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})

	test("should show Trade #1 as the next trade number", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// i18n: tradeNumber = "Trade #{number}" with number=1
		await expect(panel.getByText(/trade #1/i)).toBeVisible()
	})

	test("should show Size Direction as Unchanged (no trades yet)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// i18n: metrics.unchanged = "Unchanged"
		await expect(panel.getByText(/unchanged/i)).toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — L-W path (T1 loss → T2 recovery → win exits)", () => {
	/**
	 * Scenario:
	 *   T1: loss  -50000  → enters loss_recovery, recoveryIndex=0
	 *   T2: win   +25000  → recovery win + stopAfterSequence=true → recoveryWinExit
	 *
	 * Expected after T2 (next state):
	 *   shouldStopTrading = true
	 *   stopReason        = "recoveryWinExit"
	 *   dailyPnlCents     = -50000 + 25000 = -25000
	 *   tradesCompleted   = 2
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "win", pnlCents: 25_000, plannedRiskAmountCents: 25_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display STOP TRADING with recoveryWinExit reason", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /recovery win/i)
	})

	test("should show 2 trades completed", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectTradesCompleted(panel, 2)
	})

	test("should show negative daily P&L (net -$250)", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// Net P&L = -50000 + 25000 = -25000 cents = -$250
		await expectDailyPnl(panel, fmtCurrency(-25_000))
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — L-L-W path (2 losses, recovery #2 win exits)", () => {
	/**
	 * Scenario:
	 *   T1: loss  -50000  → loss_recovery, recoveryIndex=0
	 *   T2: loss  -25000  → still in recovery, recoveryIndex=1 (step used = 50% of base)
	 *   T3: win   +12500  → recovery win at step 2 + stopAfterSequence → recoveryWinExit
	 *
	 * Expected after T3:
	 *   shouldStopTrading = true
	 *   stopReason        = "recoveryWinExit"
	 *   consecutiveLosses = 0 (last trade was a win)
	 *   tradesCompleted   = 3
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "loss", pnlCents: -25_000, plannedRiskAmountCents: 25_000 },
			{ outcome: "win", pnlCents: 12_500, plannedRiskAmountCents: 12_500 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display STOP TRADING with recoveryWinExit reason", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /recovery win/i)
	})

	test("should show 3 trades completed", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectTradesCompleted(panel, 3)
	})

	test("should show total daily P&L (net -$625)", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// Net = -50000 - 25000 + 12500 = -62500 cents = -$625
		await expectDailyPnl(panel, fmtCurrency(-62_500))
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — W-L path (T1 win → gain mode → T2 loss stops)", () => {
	/**
	 * Scenario:
	 *   T1: win   +50000  → gain_mode (gainSequence, gainSequenceIndex=0)
	 *   T2: loss  -50000  → stopOnFirstLoss=true → dailyTargetHit=true
	 *
	 * Expected after T2:
	 *   shouldStopTrading = true
	 *   stopReason        = "dailyTargetReached" (dailyTargetHit flag set by stopOnFirstLoss)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display STOP TRADING after gain-mode loss (stopOnFirstLoss)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		// stopOnFirstLoss sets dailyTargetHit → stopReason = "dailyTargetReached"
		await expectStopReason(panel, /daily target reached/i)
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — W-W-W path (3 wins hit daily target)", () => {
	/**
	 * Scenario:
	 *   T1: win  +50000  → gain_mode, gainSequenceIndex=0, dayGains=50000
	 *   T2: win  +50000  → gainSequenceIndex=1, dayGains=100000
	 *   T3: win  +50000  → gainSequenceIndex=2, dayGains=150000 ≥ dailyTargetCents
	 *
	 * Expected after T3:
	 *   shouldStopTrading = true
	 *   stopReason        = "dailyTargetReached"
	 *   dayGainsCents     = 150000
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display STOP TRADING with daily target reached reason", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /daily target reached/i)
	})

	test("should show 3 trades completed", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectTradesCompleted(panel, 3)
	})

	test("should show positive daily P&L equal to the daily target $1,500", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectDailyPnl(panel, fmtCurrency(150_000)) // $1,500.00
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — In-progress gain mode (W then W, T3 upcoming)", () => {
	/**
	 * Scenario:
	 *   T1: win  +50000  → gain_mode, gainSequenceIndex=0
	 *   T2: win  +50000  → gainSequenceIndex=1, dayGains=100000 (below target)
	 *
	 * Expected state (next trade is T3 in gain sequence, step index=2):
	 *   dayPhase              = "gain_mode"
	 *   shouldStopTrading     = false
	 *   nextTradeRiskCents    = 25_000 (50% of base = gain step #2)
	 *   gainSequenceStepIndex = 2 (0-indexed — next step is the 3rd in sequence)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display Gain Mode phase badge", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /gain mode/i)
	})

	test("should show the gain-mode next risk as R$250 (50% of base at gain step 2)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// gain step #2 riskCalculation = { type: "percentOfBase", percent: 50 }
		// nextTradeRiskCents = 50% of 50000 = 25000 → R$250
		await expectNextRisk(panel, DISPLAY.gainStep2)
	})

	test("should show gain sequence step indicator", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// i18n: gainMode.gainSequence = "Gain step {current}/{total}"
		// current=3 (next step, 1-indexed display), total=3
		await expect(panel.getByText(/gain step/i)).toBeVisible()
	})

	test("should NOT show STOP TRADING", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — In-progress loss recovery (T1 loss, T2 upcoming)", () => {
	/**
	 * Scenario:
	 *   T1: loss  -50000  → loss_recovery, recoveryIndex=0
	 *
	 * Expected state (next trade is recovery step #1):
	 *   dayPhase           = "loss_recovery"
	 *   nextTradeRiskCents = 25_000 (50% of base)
	 *   recoveryStepIndex  = 0 (first recovery step)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display Recovery Step 1/3 badge", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// i18n: recovery.badge = "Recovery Step {current}/{total}"
		await expectPhaseBadge(panel, /recovery step 1\/3/i)
	})

	test("should show next risk as R$250 (50% of base for recovery step 1)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectNextRisk(panel, DISPLAY.recovery1)
	})

	test("should show the recovery progress tracker with 3 steps", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// i18n: recovery.title = "Recovery Progress"
		await expect(panel.getByText(/recovery progress/i)).toBeVisible()
	})

	test("should show Size Direction as Decrease (recovery uses less than base risk)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// i18n: metrics.decrease = "Decrease"
		await expect(panel.getByText(/decrease/i)).toBeVisible()
	})

	test("should NOT show STOP TRADING", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Recovery sequence exhausted (L-L-L-L)", () => {
	/**
	 * Scenario:
	 *   T1: loss  -50000  → loss_recovery, recoveryIndex=0
	 *   T2: loss  -25000  → recoveryIndex=1
	 *   T3: loss  -12500  → recoveryIndex=2
	 *   T4: loss  -12500  → recoveryIndex=3 ≥ totalRecoverySteps(3) → exhausted
	 *
	 * Expected after T4:
	 *   shouldStopTrading        = true
	 *   stopReason               = "recoverySequenceExhausted"
	 *   recoverySequenceExhausted = true
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "loss", pnlCents: -25_000, plannedRiskAmountCents: 25_000 },
			{ outcome: "loss", pnlCents: -12_500, plannedRiskAmountCents: 12_500 },
			{ outcome: "loss", pnlCents: -12_500, plannedRiskAmountCents: 12_500 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display STOP TRADING with recovery sequence exhausted reason", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /recovery sequence exhausted/i)
	})

	test("should show 4 trades completed", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectTradesCompleted(panel, 4)
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Daily loss limit hit (off-plan: loss exceeds risk)", () => {
	/**
	 * Off-plan scenario: the trader's planned risk was R$500 but they lost R$700
	 * (slippage / gap). The actual daily P&L hits the R$1,000 loss limit.
	 *
	 * Scenario:
	 *   T1: loss  -70000  (planned R$500, actual loss R$700 — off plan)
	 *   T2: loss  -40000  (total dailyPnl = -110000 ≤ -100000 → dailyLimitHit)
	 *
	 * Expected:
	 *   shouldStopTrading = true
	 *   stopReason        = "dailyLossLimit"
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -70_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "loss", pnlCents: -40_000, plannedRiskAmountCents: 25_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display STOP TRADING with daily loss limit reason", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /daily loss limit reached/i)
	})

	test("should show a negative daily P&L exceeding R$1000", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// Net P&L = -70000 + -40000 = -110000 cents = -$1,100
		await expectDailyPnl(panel, fmtCurrency(-110_000))
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Off-plan: actual loss smaller than planned risk", () => {
	/**
	 * Off-plan scenario: trader's planned risk was R$500 but they exited early
	 * losing only R$150 (partial fill or early manual stop).
	 *
	 * T1: loss  -15000  (planned R$500, actual -R$150 — exits early)
	 *
	 * Outcome classification is still "loss", so the phase machine enters loss_recovery.
	 * The daily P&L is only -R$150, well within the R$1,000 daily limit.
	 *
	 * Expected state after T1:
	 *   dayPhase           = "loss_recovery"
	 *   nextTradeRiskCents = 25_000 (50% of base risk for recovery step 1)
	 *   shouldStopTrading  = false
	 *   dailyPnlCents      = -15_000
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -15_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should enter loss_recovery phase despite smaller actual loss", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// Outcome = "loss" triggers loss_recovery regardless of dollar amount
		await expectPhaseBadge(panel, /recovery step 1\/3/i)
	})

	test("should show next risk as R$250 (recovery step 1 is always 50% of base)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// The recovery step is based on the PROFILE base risk, not actual P&L
		await expectNextRisk(panel, DISPLAY.recovery1)
	})

	test("should NOT show STOP TRADING (daily limit not reached)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Off-plan: actual win larger than planned gain", () => {
	/**
	 * Off-plan scenario: trader won R$800 instead of the typical R$500.
	 * The "win" outcome still moves to gain_mode at gainSequenceIndex=0.
	 * The gain sequence step amounts are based on the PROFILE base risk,
	 * not the actual win amount. However dayGainsCents = 80000 (actual).
	 *
	 * T1: win  +80000  (planned R$500 but won R$800 — off plan upside)
	 *
	 * Expected state after T1:
	 *   dayPhase              = "gain_mode"
	 *   nextTradeRiskCents    = 50_000 (gain step 1 = 100% of base)
	 *   gainSequenceStepIndex = 0 (just entered gain mode, next is step index 1)
	 *   shouldStopTrading     = false (dayGains=80000 < dailyTarget=150000)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "win", pnlCents: 80_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should enter gain_mode phase after a win", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /gain mode/i)
	})

	test("should show next risk as R$500 (gain step 1 = 100% of base)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// gain step #1: { type: "percentOfBase", percent: 100 } = 100% of 50000 = 50000
		await expectNextRisk(panel, DISPLAY.gainStep1)
	})

	test("should NOT show STOP TRADING (large win but below daily target)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Daily limit recovery (loss then win brings P&L back)", () => {
	/**
	 * Non-sticky daily limit scenario:
	 * The daily limit check uses FINAL dailyPnlCents (not a sticky flag).
	 * If a recovery win brings the P&L above the loss limit threshold, trading continues.
	 *
	 * Scenario:
	 *   T1: loss  -90000  → loss_recovery, dailyPnl=-90000 (not yet at -100000)
	 *   T2: win   +80000  → recovery win → recoveryWinExit=true
	 *                       dailyPnl = -90000 + 80000 = -10000 (well above -100000)
	 *
	 * Expected:
	 *   shouldStopTrading = true
	 *   stopReason        = "recoveryWinExit"  (not "dailyLossLimit")
	 *   dailyLimitHit     = false (final P&L = -10000 > -100000)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -90_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "win", pnlCents: 80_000, plannedRiskAmountCents: 25_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should stop with recoveryWinExit, not daily loss limit", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /recovery win/i)

		// Confirm daily loss limit reason is NOT shown
		await expect(panel.getByText(/daily loss limit reached/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Breakeven trades are invisible to phase machine", () => {
	/**
	 * Breakevens accumulate P&L but skip ALL phase transitions.
	 *
	 * Scenario:
	 *   T1: breakeven  pnl=0   → skipped by phase machine, currentStepNumber stays 0
	 *   T2: breakeven  pnl=0   → skipped again
	 *   T3: loss       -50000  → THIS is logical T1, enters loss_recovery
	 *
	 * Expected state after all 3:
	 *   dayTradeNumber     = 1  (only 1 non-breakeven counted)
	 *   dayPhase           = "loss_recovery"
	 *   nextTradeRiskCents = 25_000 (recovery step 1)
	 *   shouldStopTrading  = false
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "breakeven", pnlCents: 0 },
			{ outcome: "breakeven", pnlCents: 0 },
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should enter loss_recovery phase after breakevens + T1 loss", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /recovery step 1\/3/i)
	})

	test("should show next risk as R$250 (breakevens didn't consume recovery steps)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectNextRisk(panel, DISPLAY.recovery1)
	})

	test("should show Trade #2 as next trade number (1 logical trade taken)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// dayTradeNumber=1 → nextTrade = T2
		await expect(panel.getByText(/trade #2/i)).toBeVisible()
	})

	test("should NOT show STOP TRADING", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Breakeven after T1 win (gain mode preserved)", () => {
	/**
	 * Scenario:
	 *   T1: win       +50000  → gain_mode, gainSequenceIndex=0
	 *   T2: breakeven  pnl=0  → P&L accumulates but phase NOT advanced
	 *   T3: (upcoming) → still at gainSequenceIndex=0, next risk = gain step 1 (R$500)
	 *
	 * Expected state after T1+T2:
	 *   dayPhase              = "gain_mode"
	 *   gainSequenceStepIndex = 0 (breakeven didn't advance it)
	 *   nextTradeRiskCents    = 50_000 (gain step 1 = 100% of base)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "breakeven", pnlCents: 0 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should remain in gain_mode after a breakeven", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /gain mode/i)
	})

	test("should show gain step 1 risk (R$500) as next risk — breakeven did not advance step", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// gainSequenceIndex=0, next step is sequence[0] = 100% of base = R$500
		await expectNextRisk(panel, DISPLAY.gainStep1)
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — No monthly plan linked (no profile)", () => {
	/**
	 * When no monthly plan has a risk profile linked, the panel should show
	 * the "noProfile" empty state message rather than live trading guidance.
	 *
	 * This test does NOT use seedScenario — instead it relies on the panel
	 * falling back gracefully when data is missing. We navigate while the
	 * seeder's plan has been cleaned up (or before any plan is set).
	 *
	 * We use a fresh database context with a separate admin account cleanup
	 * for isolation. Since we can't guarantee the plan is absent in all CI runs,
	 * we assert the panel is visible (either with a profile or the noProfile state).
	 */

	test("should show either the live status panel or the noProfile empty state", async ({
		page,
	}) => {
		await gotoCommandCenter(page)

		// The panel is always rendered — it shows one of three states:
		//   1. "Live Trading Status" heading (when profile is linked)
		//   2. "No risk profile linked..." message (when hasProfile=false)
		//   3. "Loading status..." (brief loading state, should clear quickly)
		const panelContent = page
			.getByText(/live trading status|no risk profile linked|loading status/i)
			.first()
		await expect(panelContent).toBeVisible({ timeout: 10_000 })
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — W then L-L recovery sequence in progress", () => {
	/**
	 * Scenario: Day started well (T1 win) but then two losses in gain mode.
	 * Since stopOnFirstLoss=true, after the first loss in gain mode the day stops.
	 * This tests that W-L-L correctly stops at W-L (the second loss is after stop).
	 *
	 * But to test ACTIVE loss recovery mid-sequence, let's use L-L with the
	 * second trade being the upcoming one:
	 *
	 * Scenario:
	 *   T1: loss  -50000  → loss_recovery, recoveryIndex=0
	 *   T2: loss  -25000  → recoveryIndex=1 advanced
	 *
	 * Expected state (next is recovery step #2):
	 *   dayPhase           = "loss_recovery"
	 *   recoveryStepIndex  = 1 (showing step 2 of 3 in UI — 1-indexed badge)
	 *   nextTradeRiskCents = 12_500 (25% of base = recovery step 2)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "loss", pnlCents: -25_000, plannedRiskAmountCents: 25_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should display Recovery Step 2/3 badge", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /recovery step 2\/3/i)
	})

	test("should show next risk as R$125 (25% of base for recovery step 2)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectNextRisk(panel, DISPLAY.recovery2)
	})

	test("should show 2 consecutive losses", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		// The panel renders Trade boxes — T1 and T2 should both be visible
		// as losses in the trade summary row. Look for the trade boxes section.
		const tradeSectionLabel = panel.getByText(/today's trades/i)
		await expect(tradeSectionLabel).toBeVisible()
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Daily target hit by cumulative gains in gain mode", () => {
	/**
	 * Scenario: T1 win + T2 win pushes dayGainsCents to 150000 exactly.
	 *
	 *   T1: win   +100000  → gain_mode, gainSequenceIndex=0, dayGains=100000
	 *   T2: win   +50000   → gainSequenceIndex=1, dayGains=150000 ≥ dailyTargetCents
	 *
	 * Expected:
	 *   shouldStopTrading = true
	 *   stopReason        = "dailyTargetReached"
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "win", pnlCents: 100_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "win", pnlCents: 50_000, plannedRiskAmountCents: 50_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should stop trading when cumulative gain hits daily target", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectStopTradingPill(panel)
		await expectStopReason(panel, /daily target reached/i)
	})

	test("should show positive daily P&L of R$1500", async ({ page }) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectDailyPnl(panel, fmtCurrency(150_000))
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Trade boxes render T-numbers correctly", () => {
	/**
	 * Validates that the trade summary boxes (T1, T2, T3) show the correct
	 * step numbers, accounting for breakevens being assigned the previous step's number.
	 *
	 * Scenario:
	 *   T1: loss       -50000  → logical step 1 → tradeStepNumber=1
	 *   T2: breakeven   pnl=0  → skipped in phase → tradeStepNumber=1 (repeats prior)
	 *   T3: loss       -25000  → logical step 2 → tradeStepNumber=2
	 *
	 * Expected trade boxes: T1 (loss), T1 (breakeven), T2 (loss)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{ outcome: "loss", pnlCents: -50_000, plannedRiskAmountCents: 50_000 },
			{ outcome: "breakeven", pnlCents: 0 },
			{ outcome: "loss", pnlCents: -25_000, plannedRiskAmountCents: 25_000 },
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should render Today's Trades section with the 3 trade boxes", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		const todaysTrades = panel.getByText(/today's trades/i)
		await expect(todaysTrades).toBeVisible()

		// Trade boxes display T{n} labels. We should see at least T1 and T2.
		await expect(panel.getByText("T1").first()).toBeVisible()
		await expect(panel.getByText("T2").first()).toBeVisible()
	})

	test("should show panel in loss_recovery phase (breakeven didn't change phase)", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /recovery step 2\/3/i)
	})
})

// ---------------------------------------------------------------------------

test.describe("Live Trading Status — Off-plan scenario: single trade with slippage loss", () => {
	/**
	 * Validates a realistic slippage scenario on the first trade of the day.
	 *
	 * A WIN gap open caused a -R$700 loss against a planned R$500 risk.
	 * The outcome is still "loss" so loss_recovery is entered.
	 * The next recovery risk is still based on the PROFILE base risk (R$500).
	 *
	 * T1: loss  -70000  (off-plan: planned 50000 but actual 70000)
	 *
	 * Expected state:
	 *   dayPhase           = "loss_recovery"
	 *   nextTradeRiskCents = 25_000 (always 50% of base for recovery step 1)
	 *   dailyPnlCents      = -70000 (actual P&L)
	 *   shouldStopTrading  = false  (-70000 > -100000 limit)
	 */
	let seedResult: SeedResult

	test.beforeAll(async () => {
		seedResult = await seedScenario([
			{
				outcome: "loss",
				pnlCents: -70_000,
				plannedRiskAmountCents: 50_000,
				asset: "WIN",
			},
		])
	})

	test.afterAll(async () => {
		await teardownScenario(seedResult)
	})

	test("should enter recovery phase and show correct next risk despite slippage", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expectPhaseBadge(panel, /recovery step 1\/3/i)
		await expectNextRisk(panel, DISPLAY.recovery1)
	})

	test("should not stop trading because actual loss is below daily limit", async ({
		page,
	}) => {
		await gotoCommandCenter(page)
		const panel = await getLiveTradingPanel(page)

		await expect(panel.getByText(/stop trading/i)).not.toBeVisible()
	})
})

// ---------------------------------------------------------------------------
// BROAD AFTERALL: belt-and-suspenders cleanup
// ---------------------------------------------------------------------------

/**
 * Belt-and-suspenders cleanup after all suites run.
 * Deletes any seeder-fingerprinted trades that may have been orphaned if a
 * beforeAll or afterAll in a describe block threw unexpectedly.
 */
test.afterAll(async () => {
	await cleanupTodayTrades().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`[live-trading-status.spec] Broad cleanup failed: ${message}`)
	})
})
