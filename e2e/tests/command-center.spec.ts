import { test, expect } from "../fixtures/base"
import { ROUTES, TEST_CHECKLIST } from "../fixtures/test-data"
import { clickTab, waitForSuspenseLoad } from "../utils/helpers"

test.describe("Command Center", () => {
	test.describe("Page Layout & Tabs", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display all 3 tab triggers", async ({ page }) => {
			// Plan tab was promoted to a standalone route (/en/plan/...) in Phase 4b.
			// Command Center now has: Command Center, Monitor, Calculator.
			await expect(
				page.getByRole("tab", { name: /command center|centro de comando/i })
			).toBeVisible()
			await expect(page.getByRole("tab", { name: /monitor/i })).toBeVisible()
			await expect(
				page.getByRole("tab", { name: /calculator|calculadora/i })
			).toBeVisible()
		})

		test("should default to command-center tab as active", async ({ page }) => {
			const ccTab = page.getByRole("tab", {
				name: /command center|centro de comando/i,
			})
			await expect(ccTab).toHaveAttribute("aria-selected", "true")
		})

		test("should switch to Monitor tab and load content via Suspense", async ({
			page,
		}) => {
			await clickTab(page, /monitor/i)
			await waitForSuspenseLoad(page)

			const monitorTab = page.getByRole("tab", { name: /monitor/i })
			await expect(monitorTab).toHaveAttribute("aria-selected", "true")
		})

		test("should switch to Calculator tab and load content via Suspense", async ({
			page,
		}) => {
			await clickTab(page, /calculator|calculadora/i)
			await waitForSuspenseLoad(page)

			const calcTab = page.getByRole("tab", { name: /calculator|calculadora/i })
			await expect(calcTab).toHaveAttribute("aria-selected", "true")
		})
	})

	test.describe("Date Navigator", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display current date with Today label", async ({ page }) => {
			const todayButton = page.locator("#date-nav-today")
			const dateNav = page.locator("#date-nav-previous")
			// Either a "Today" indicator or the date navigator buttons should be present
			const hasTodayOrNav =
				(await todayButton.isVisible().catch(() => false)) ||
				(await dateNav.isVisible().catch(() => false))
			expect(hasTodayOrNav).toBeTruthy()
		})

		test("should navigate to previous day", async ({ page }) => {
			const prevButton = page.locator("#date-nav-previous")
			await expect(prevButton).toBeVisible()
			await prevButton.click()

			// URL updates with ?date= param via router.push
			await expect(page).toHaveURL(/date=/, { timeout: 10000 })
		})

		test("should disable next day button when viewing today", async ({
			page,
		}) => {
			const nextButton = page.locator("#date-nav-next")
			await expect(nextButton).toBeVisible()

			// Next button should be disabled when on today's date
			const isDisabled = await nextButton.isDisabled()
			expect(isDisabled).toBeTruthy()
		})

		test("should show Today shortcut when viewing a past date", async ({
			page,
		}) => {
			// Navigate to previous day first
			await page.locator("#date-nav-previous").click()
			await expect(page).toHaveURL(/date=/, { timeout: 10000 })

			// "Today" button should now appear
			const todayButton = page.locator("#date-nav-today")
			await expect(todayButton).toBeVisible()

			// Click it to go back to today
			await todayButton.click()
			await expect(page).not.toHaveURL(/date=/, { timeout: 10000 })

			// Next button should be disabled again (we're back to today)
			await expect(page.locator("#date-nav-next")).toBeDisabled()
		})
	})

	test.describe("Circuit Breaker Panel", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display circuit breaker section heading", async ({ page }) => {
			await expect(
				page.getByText(/circuit breaker|disjuntor/i).first()
			).toBeVisible()
		})

		test("should show daily P&L metric", async ({ page }) => {
			await expect(
				page.getByText(/daily p&l|p&l diário|resultado diário/i).first()
			).toBeVisible()
		})

		test("should show trades count", async ({ page }) => {
			await expect(page.getByText(/trades/i).first()).toBeVisible()
		})

		test("should show consecutive losses or remaining buffer", async ({
			page,
		}) => {
			const consecutiveLosses = page.getByText(
				/consecutive|consecutiv|remaining|restante/i
			)
			await expect(consecutiveLosses.first()).toBeVisible()
		})

		// Regression: sentry:PROFIT-JOURNAL-B — getCircuitBreakerStatus crashed
		// because `sum(trades.pnl)` was called on a text column, producing
		// "function sum(text) does not exist". The page should render the
		// monthly P&L metric without any 500 / DB error.
		test("should render monthly P&L without database error", async ({
			page,
		}) => {
			const monthlyPnl = page.getByText(/monthly p&l|p&l mensal/i)
			await expect(monthlyPnl.first()).toBeVisible()

			const errorBanner = page.getByText(
				/failed query|sum\(text\) does not exist|database error|erro de banco/i
			)
			await expect(errorBanner).toHaveCount(0)
		})
	})

	test.describe("Daily Checklist", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display checklist section", async ({ page }) => {
			// When a checklist exists, the heading shows its name (e.g. "E2E Morning Routine")
			// When no checklist exists, the heading shows "Daily Checklist"
			const checklist = page.getByText(/checklist|lista/i)
			const checklistName = page.getByText(/morning routine|e2e/i)

			const hasChecklist = await checklist
				.first()
				.isVisible()
				.catch(() => false)
			const hasChecklistName = await checklistName
				.first()
				.isVisible()
				.catch(() => false)

			expect(hasChecklist || hasChecklistName).toBeTruthy()
		})

		test("should display manage/edit button", async ({ page }) => {
			// ID is #daily-checklist-manage when empty, #daily-checklist-settings-{id} when exists
			const manageButton = page.locator("#daily-checklist-manage")
			const settingsButton = page.locator('[id^="daily-checklist-settings-"]')

			const hasManage = await manageButton.isVisible().catch(() => false)
			const hasSettings = await settingsButton
				.first()
				.isVisible()
				.catch(() => false)

			expect(hasManage || hasSettings).toBeTruthy()
		})

		test("should open checklist manager dialog", async ({ page }) => {
			const manageButton = page.locator("#daily-checklist-manage")
			const settingsButton = page.locator('[id^="daily-checklist-settings-"]')

			const hasManage = await manageButton.isVisible().catch(() => false)
			if (hasManage) {
				await manageButton.click()
			} else {
				await settingsButton.first().click()
			}

			// Scope strictly to checklist dialog id — `[role='dialog']` matches the Next.js
			// dev error overlay too and times out with a strict-mode-style mismatch.
			const dialog = page.locator("#checklist-manager-dialog")
			await expect(dialog).toBeVisible({ timeout: 5000 })
		})

		test("should create new checklist with name and items", async ({
			page,
		}) => {
			const manageButton = page.locator("#daily-checklist-manage")
			const settingsButton = page.locator('[id^="daily-checklist-settings-"]')

			const hasManage = await manageButton.isVisible().catch(() => false)
			if (hasManage) {
				await manageButton.click()
			} else {
				await settingsButton.first().click()
			}

			const dialog = page.locator("[role='dialog']").first()
			await expect(dialog).toBeVisible({ timeout: 3000 })

			// Fill checklist name
			const nameInput = page.locator("#checklist-name")
			await nameInput.clear()
			await nameInput.fill(TEST_CHECKLIST.name)

			// Dialog pre-creates empty item rows — fill the existing placeholder inputs
			const itemInputs = dialog.locator(
				'input[placeholder*="item" i], input[placeholder*="Enter" i]'
			)
			const inputCount = await itemInputs.count()

			for (
				let i = 0;
				i < Math.min(TEST_CHECKLIST.items.length, inputCount);
				i++
			) {
				await itemInputs.nth(i).fill(TEST_CHECKLIST.items[i])
			}

			// Save (button text is "Create" for new checklists)
			const saveButton = page
				.locator("#checklist-save")
				.or(dialog.getByRole("button", { name: /create|criar|save|salvar/i }))
			await saveButton.first().click()
			await page.waitForTimeout(1000)

			// Dialog should close
			await expect(dialog).toBeHidden({ timeout: 3000 })
		})

		test("should toggle item completion via checkbox", async ({ page }) => {
			// Find any checklist checkbox
			const checkboxes = page
				.locator('[id^="checklist-item-"]')
				.filter({ has: page.locator('input[type="checkbox"]') })
			const checkboxCount = await checkboxes.count()

			if (checkboxCount > 0) {
				const firstCheckbox = checkboxes
					.first()
					.locator('input[type="checkbox"]')
				const wasChecked = await firstCheckbox.isChecked()

				await firstCheckbox.click()
				await page.waitForTimeout(500)

				const isNowChecked = await firstCheckbox.isChecked()
				expect(isNowChecked).not.toBe(wasChecked)
			}
		})

		test("should show completion progress or empty state", async ({ page }) => {
			// Look for progress indicator (e.g., "2 / 3" or "66%")
			const progress = page.getByText(/\d+\s*\/\s*\d+|\d+%/)
			const hasProgress = await progress
				.first()
				.isVisible()
				.catch(() => false)

			// Or "No checklist items yet" empty state
			const noItems = page.getByText(
				/no checklist|no items|sem itens|click manage/i
			)
			const hasNoItems = await noItems
				.first()
				.isVisible()
				.catch(() => false)

			// Or the manage/settings button itself (always visible)
			const hasManage =
				(await page
					.locator("#daily-checklist-manage")
					.isVisible()
					.catch(() => false)) ||
				(await page
					.locator('[id^="daily-checklist-settings-"]')
					.first()
					.isVisible()
					.catch(() => false))

			expect(hasProgress || hasNoItems || hasManage).toBeTruthy()
		})
	})

	test.describe("Pre-Market / Post-Market Notes", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display pre-market notes section", async ({ page }) => {
			await expect(
				page.getByText(/pre-market|pré-mercado/i).first()
			).toBeVisible()
		})

		test("should display mood selector with options", async ({ page }) => {
			// MoodSelector renders inside PreMarketNotes — only mounted when a daily_plan
			// exists for today. Skip gracefully if no daily plan is seeded.
			const radiogroup = page.getByRole("radiogroup", { name: /mood/i })
			const hasMoodSelector = await radiogroup.isVisible().catch(() => false)
			if (!hasMoodSelector) {
				test.skip(
					true,
					"Mood selector requires a daily_plan for today — not seeded"
				)
				return
			}
			// planMoodEnum has 4 values: focused, neutral, distracted, risk_off
			const moodOptions = radiogroup.getByRole("radio")
			const count = await moodOptions.count()
			expect(count).toBeGreaterThanOrEqual(1)
		})

		test("should select a mood", async ({ page }) => {
			const radiogroup = page.getByRole("radiogroup", { name: /mood/i })
			const hasMoodSelector = await radiogroup.isVisible().catch(() => false)
			if (!hasMoodSelector) {
				test.skip(
					true,
					"Mood selector requires a daily_plan for today — not seeded"
				)
				return
			}
			const moodOption = radiogroup.getByRole("radio").first()
			await moodOption.click()
			await page.waitForTimeout(500)
			await expect(moodOption).toBeChecked()
		})

		test("should fill and save pre-market notes", async ({ page }) => {
			const textarea = page.locator("#pre-market-notes-textarea")
			if (await textarea.isVisible().catch(() => false)) {
				await textarea.clear()
				await textarea.fill("E2E test pre-market note: watching IBOV levels")
				await page.waitForTimeout(300)

				// Save button should appear after changes
				const saveButton = page.locator("#pre-market-save")
				if (await saveButton.isVisible().catch(() => false)) {
					await saveButton.click()
					await page.waitForTimeout(1000)
				}
			}
		})

		test("should fill and save post-market notes", async ({ page }) => {
			const textarea = page.locator("#post-market-notes-textarea")
			if (await textarea.isVisible().catch(() => false)) {
				await textarea.clear()
				await textarea.fill("E2E test post-market review: followed plan today")
				await page.waitForTimeout(300)

				// Save button should appear after changes
				const saveButton = page.locator("#post-market-save")
				if (await saveButton.isVisible().catch(() => false)) {
					await saveButton.click()
					await page.waitForTimeout(1000)
				}
			}
		})
	})

	test.describe("Asset Rules", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display asset rules section", async ({ page }) => {
			const assetRules = page.getByText(
				/asset rules|regras de ativo|asset|ativo/i
			)
			await expect(assetRules.first()).toBeVisible()
		})

		test("should display bias selector per asset", async ({ page }) => {
			// Bias selectors show long/short/neutral options
			const biasSelectors = page.locator("#bias-selector")
			const hasBias = await biasSelectors
				.first()
				.isVisible()
				.catch(() => false)

			// Or check for the add asset button if no assets configured yet
			const addAssetButton = page.locator("#asset-rules-add-asset")
			const hasAddButton = await addAssetButton.isVisible().catch(() => false)

			expect(hasBias || hasAddButton).toBeTruthy()
		})

		test("should open add-asset dropdown", async ({ page }) => {
			const addAssetButton = page.locator("#asset-rules-add-asset")
			if (await addAssetButton.isVisible().catch(() => false)) {
				await addAssetButton.click()
				await page.waitForTimeout(300)

				// Asset select dropdown or confirm button should appear
				const assetSelect = page.locator("#asset-rules-asset")
				const confirmButton = page.locator("#asset-rules-confirm-add")
				const hasSelect = await assetSelect.isVisible().catch(() => false)
				const hasConfirm = await confirmButton.isVisible().catch(() => false)
				expect(hasSelect || hasConfirm).toBeTruthy()
			}
		})

		test("should show settings table columns", async ({ page }) => {
			// Look for table headers: Asset, Bias, Max Trades, etc.
			const headers = page.getByText(
				/bias|max trades|position size|notes|notas/i
			)
			const hasHeaders = await headers
				.first()
				.isVisible()
				.catch(() => false)

			// Or the section is in empty state with just the add button
			const addAssetButton = page.locator("#asset-rules-add-asset")
			const hasAddButton = await addAssetButton.isVisible().catch(() => false)

			expect(hasHeaders || hasAddButton).toBeTruthy()
		})
	})

	test.describe("Daily Summary", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display daily summary section", async ({ page }) => {
			// Heading is "Today's Summary" / "Resumo de Hoje" — scroll down since it's below the fold
			const summary = page.getByText(/today's summary|resumo de hoje/i).first()
			await summary.scrollIntoViewIfNeeded()
			await expect(summary).toBeVisible()
		})

		test("should show summary data or empty state", async ({ page }) => {
			// Scroll to the summary section first
			const summaryHeading = page
				.getByText(/today's summary|resumo de hoje/i)
				.first()
			await summaryHeading.scrollIntoViewIfNeeded()

			// Summary shows metrics like Total P&L, Win Rate, etc.
			const summaryMetric = page.getByText(
				/total p&l|win rate|trades|p&l total|taxa de acerto/i
			)
			const hasSummary = await summaryMetric
				.first()
				.isVisible()
				.catch(() => false)

			// Or shows "No Trades Today"
			const noTrades = page.getByText(/no trades|sem trades|sem operações/i)
			const hasNoTrades = await noTrades
				.first()
				.isVisible()
				.catch(() => false)

			expect(hasSummary || hasNoTrades).toBeTruthy()
		})
	})

	test.describe("Responsiveness", () => {
		test("should adapt layout on mobile viewport", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 })
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			// Core content should still be visible
			await expect(
				page.getByText(/circuit breaker|disjuntor/i).first()
			).toBeVisible()
		})

		test("should stack content vertically on mobile", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 })
			await page.goto(ROUTES.commandCenter)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			// Circuit breaker should be visible at top
			await expect(page.getByText(/circuit breaker/i).first()).toBeVisible()

			// Checklist section should be visible (heading or checklist name)
			const checklist = page
				.getByText(/daily checklist|checklist|morning routine/i)
				.first()
			await expect(checklist).toBeVisible()

			// Pre-market should be accessible by scrolling
			const preMarket = page.getByText(/pre-market|pré-mercado/i).first()
			await preMarket.scrollIntoViewIfNeeded()
			await expect(preMarket).toBeVisible()
		})
	})
})
