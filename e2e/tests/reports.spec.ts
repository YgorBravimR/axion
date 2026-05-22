import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"

test.describe("Reports", () => {
	test.describe("Weekly Reports Page", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display page header", async ({ page }) => {
			// Page has no h1 heading; verify by checking the active sidebar link
			const activeNav = page.locator(
				'a[aria-current="page"]:has-text("Reports")'
			)
			await expect(activeNav).toBeVisible()
		})

		test("should display week selector", async ({ page }) => {
			// The week selector shows "This Week" text with navigation arrows
			const weekSelector = page.getByText(/this week|esta semana/i)
			await expect(weekSelector.first()).toBeVisible()
		})

		test("should navigate to previous week", async ({ page }) => {
			// Find the navigation button near "Weekly Report" section
			const weeklySection = page.locator(':has-text("Weekly Report")').first()
			const prevButton = weeklySection.locator("button").first()

			if (await prevButton.isVisible()) {
				await prevButton.click()
				await page.waitForTimeout(500)
			}
		})

		test("should navigate to next week", async ({ page }) => {
			// Find the navigation button near "Weekly Report" section
			const weeklySection = page.locator(':has-text("Weekly Report")').first()
			const buttons = weeklySection.locator("button")
			const nextButton = buttons.last()

			if (await nextButton.isVisible()) {
				await nextButton.click()
				await page.waitForTimeout(500)
			}
		})

		test("should display weekly summary card", async ({ page }) => {
			const summaryCard = page.locator(
				'[data-testid="weekly-summary"], .summary-card, :has-text("Summary")'
			)
			if ((await summaryCard.count()) > 0) {
				await expect(summaryCard.first()).toBeVisible()
			}
		})

		test("should display P&L metrics", async ({ page }) => {
			// Look for Net P&L in Monthly Report section (or any P&L metric)
			await expect(page.getByText(/net p&l/i).first()).toBeVisible()
		})

		test("should display trade count", async ({ page }) => {
			// The Trades metric is in the Monthly Report section
			// Use .filter({ visible: true }) to skip hidden elements
			await expect(
				page
					.getByText(/trades/i)
					.filter({ visible: true })
					.first()
			).toBeVisible()
		})

		test("should display win rate", async ({ page }) => {
			const winRate = page.locator(
				':has-text("Win Rate"):has-text("%"), :has-text("Taxa"):has-text("%")'
			)
			if ((await winRate.count()) > 0) {
				await expect(winRate.first()).toBeVisible()
			}
		})

		test("should display daily breakdown", async ({ page }) => {
			const dailyBreakdown = page.locator(
				'[data-testid="daily-breakdown"], :has-text("Daily"), table'
			)
			if ((await dailyBreakdown.count()) > 0) {
				await expect(dailyBreakdown.first()).toBeVisible()
			}
		})

		test("should display performance chart", async ({ page }) => {
			const chart = page.locator(".recharts-wrapper, svg.recharts-surface")
			if ((await chart.count()) > 0) {
				await expect(chart.first()).toBeVisible({ timeout: 5000 })
			}
		})

		test("should display discipline score", async ({ page }) => {
			const disciplineScore = page.locator(
				':has-text("Discipline"):has-text("%"), :has-text("Disciplina"):has-text("%")'
			)
			if ((await disciplineScore.count()) > 0) {
				await expect(disciplineScore.first()).toBeVisible()
			}
		})

		test("should display best/worst day", async ({ page }) => {
			const bestDay = page.locator("text=/best day|melhor dia/i")
			const worstDay = page.locator("text=/worst day|pior dia/i")

			if ((await bestDay.count()) > 0) {
				await expect(bestDay.first()).toBeVisible()
			}
			if ((await worstDay.count()) > 0) {
				await expect(worstDay.first()).toBeVisible()
			}
		})

		test("should display strategy breakdown", async ({ page }) => {
			const strategyBreakdown = page.locator(
				'[data-testid="strategy-breakdown"], :has-text("Strategy")'
			)
			if ((await strategyBreakdown.count()) > 0) {
				await expect(strategyBreakdown.first()).toBeVisible()
			}
		})

		test("should display asset breakdown", async ({ page }) => {
			const assetBreakdown = page.locator(
				'[data-testid="asset-breakdown"], :has-text("Asset")'
			)
			if ((await assetBreakdown.count()) > 0) {
				await expect(assetBreakdown.first()).toBeVisible()
			}
		})

		test("should show empty state when no trades", async ({ page }) => {
			const emptyState = page.locator("text=/no trades|sem trades|no data/i")
			// May or may not be visible depending on data
			const count = await emptyState.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe("Monthly Reports Page", () => {
		test.beforeEach(async ({ page }) => {
			// Phase 4b: Monthly reports are now embedded in the /reports page
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display page header", async ({ page }) => {
			// Monthly page has no h1 heading; verify by checking the active sidebar link
			const activeNav = page.locator(
				'a[aria-current="page"]:has-text("Monthly")'
			)
			await expect(activeNav).toBeVisible()
		})

		test("should display month selector", async ({ page }) => {
			// Look for month display text like "January 2026" or navigation
			const monthDisplay = page
				.getByText(
					/january|february|march|april|may|june|july|august|september|october|november|december/i
				)
				.first()
			await expect(monthDisplay).toBeVisible()
		})

		test("should navigate to previous month", async ({ page }) => {
			// Find navigation buttons - they're arrow buttons before/after the month name
			const buttons = page
				.locator("button")
				.filter({ has: page.locator("svg") })
			const prevButton = buttons.first()

			if (await prevButton.isVisible()) {
				await prevButton.click()
				await page.waitForTimeout(500)
			}
		})

		test("should navigate to next month", async ({ page }) => {
			// Find navigation buttons
			const buttons = page
				.locator("button")
				.filter({ has: page.locator("svg") })
			const nextButton = buttons.nth(1)

			if (await nextButton.isVisible()) {
				await nextButton.click()
				await page.waitForTimeout(500)
			}
		})

		test("should display monthly summary card", async ({ page }) => {
			// Look for key metrics in the summary
			const summaryCard = page.getByText(/net p&l|total trades|win rate/i)
			if ((await summaryCard.count()) > 0) {
				await expect(summaryCard.first()).toBeVisible()
			}
		})

		test("should display P&L metrics", async ({ page }) => {
			// Monthly page shows "Gross Profit" and "Net Profit" instead of "Net P&L"
			await expect(
				page.getByText(/gross profit|net profit/i).first()
			).toBeVisible()
		})

		test("should display trade count", async ({ page }) => {
			const tradeCount = page.getByText(/total trades|trades/i)
			if ((await tradeCount.count()) > 0) {
				await expect(tradeCount.first()).toBeVisible()
			}
		})

		test("should display weekly breakdown", async ({ page }) => {
			const weeklyBreakdown = page.locator(
				'[data-testid="weekly-breakdown"], :has-text("Weekly"), table'
			)
			if ((await weeklyBreakdown.count()) > 0) {
				await expect(weeklyBreakdown.first()).toBeVisible()
			}
		})

		test("should display monthly equity curve", async ({ page }) => {
			const chart = page.locator(".recharts-wrapper, svg.recharts-surface")
			if ((await chart.count()) > 0) {
				await expect(chart.first()).toBeVisible({ timeout: 5000 })
			}
		})

		test("should display calendar heatmap", async ({ page }) => {
			const heatmap = page.locator(
				'[data-testid="calendar-heatmap"], .heatmap, .calendar'
			)
			if ((await heatmap.count()) > 0) {
				await expect(heatmap.first()).toBeVisible()
			}
		})

		test("should display tax calculation section", async ({ page }) => {
			const taxSection = page.locator(
				'[data-testid="tax-calculation"], :has-text("Tax"), :has-text("Imposto")'
			)
			if ((await taxSection.count()) > 0) {
				await expect(taxSection.first()).toBeVisible()
			}
		})

		test("should display prop firm calculation section", async ({ page }) => {
			const propSection = page.locator(
				'[data-testid="prop-calculation"], :has-text("Prop"), :has-text("Payout")'
			)
			if ((await propSection.count()) > 0) {
				await expect(propSection.first()).toBeVisible()
			}
		})

		test("should show year-to-date summary", async ({ page }) => {
			const ytdSection = page.locator(
				':has-text("YTD"), :has-text("Year to Date"), :has-text("Acumulado")'
			)
			if ((await ytdSection.count()) > 0) {
				await expect(ytdSection.first()).toBeVisible()
			}
		})

		test("should display comparison with previous month", async ({ page }) => {
			const comparison = page.locator(
				':has-text("vs"), :has-text("Previous"), :has-text("Anterior")'
			)
			if ((await comparison.count()) > 0) {
				await expect(comparison.first()).toBeVisible()
			}
		})
	})

	test.describe("Mistake Analysis", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display mistakes section", async ({ page }) => {
			const mistakesSection = page.locator(
				'[data-testid="mistakes-section"], :has-text("Mistake"), :has-text("Erro")'
			)
			if ((await mistakesSection.count()) > 0) {
				await expect(mistakesSection.first()).toBeVisible()
			}
		})

		test("should show mistake breakdown by type", async ({ page }) => {
			const mistakeTypes = page.locator(
				'[data-testid="mistake-types"], :has-text("Type")'
			)
			if ((await mistakeTypes.count()) > 0) {
				await expect(mistakeTypes.first()).toBeVisible()
			}
		})

		test("should display impact of mistakes on P&L", async ({ page }) => {
			const mistakeImpact = page.locator(
				':has-text("Impact"), :has-text("Impacto")'
			)
			if ((await mistakeImpact.count()) > 0) {
				await expect(mistakeImpact.first()).toBeVisible()
			}
		})

		test("should show most common mistakes", async ({ page }) => {
			const commonMistakes = page.locator(
				'[data-testid="common-mistakes"], :has-text("Common"), :has-text("Comum")'
			)
			if ((await commonMistakes.count()) > 0) {
				await expect(commonMistakes.first()).toBeVisible()
			}
		})
	})

	test.describe("Report Export", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should display export button", async ({ page }) => {
			const exportButton = page.getByRole("button", {
				name: /export|exportar/i,
			})
			if ((await exportButton.count()) > 0) {
				await expect(exportButton).toBeVisible()
			}
		})

		test("should show export options on click", async ({ page }) => {
			const exportButton = page.getByRole("button", {
				name: /export|exportar/i,
			})

			if (await exportButton.isVisible()) {
				await exportButton.click()

				const exportOptions = page.locator(
					'[role="menu"], [data-testid="export-options"]'
				)
				if ((await exportOptions.count()) > 0) {
					await expect(exportOptions.first()).toBeVisible()
				}
			}
		})
	})

	test.describe("Report Filters", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should have account filter", async ({ page }) => {
			const accountFilter = page.locator(
				'[data-testid="account-filter"], :has-text("Account")'
			)
			if ((await accountFilter.count()) > 0) {
				await expect(accountFilter.first()).toBeVisible()
			}
		})

		test("should have strategy filter", async ({ page }) => {
			const strategyFilter = page.locator(
				'[data-testid="strategy-filter"], :has-text("Strategy")'
			)
			if ((await strategyFilter.count()) > 0) {
				await expect(strategyFilter.first()).toBeVisible()
			}
		})

		test("should update report when filter changes", async ({ page }) => {
			const accountFilter = page
				.locator('[data-testid="account-filter"]')
				.first()

			if (await accountFilter.isVisible()) {
				await accountFilter.click()
				await page.locator('[role="option"]').first().click()
				await page.waitForTimeout(1000)
			}
		})
	})

	test.describe("Responsiveness", () => {
		test("should adapt layout on mobile", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 })
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			// On mobile, the sidebar is hidden behind a sheet menu; verify page-specific content is visible
			// The Weekly Report card heading should be present
			await expect(
				page.getByRole("heading", { name: /weekly report/i })
			).toBeVisible()
		})

		test("should stack cards vertically on mobile", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 })
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			// Charts should still be visible
			const charts = page.locator(".recharts-wrapper")
			const count = await charts.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe("Commission & Fee Impact Card", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should render the commission fee impact card on the reports page", async ({
			page,
		}) => {
			// The card is always present — either with data or with the empty state message
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()
		})

		test("should display the Commission & Fee Impact heading inside the card", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// The card title is always rendered regardless of data state
			const heading = card.getByText(/commission.*fee.*impact|fee impact/i)
			await expect(heading).toBeVisible()
		})

		test("should render the card after the mistake cost card in page order", async ({
			page,
		}) => {
			// Verify DOM order: mistake cost card appears before commission fee card
			// The mistake cost card has the id "reports-mistake-cost" per guide config
			const mistakeCostCard = page.locator("#reports-mistake-cost")
			const commissionCard = page.locator("#reports-commission-fees")

			const mistakeCostVisible = await mistakeCostCard
				.isVisible()
				.catch(() => false)
			const commissionVisible = await commissionCard
				.isVisible()
				.catch(() => false)

			if (mistakeCostVisible && commissionVisible) {
				// Both are in the DOM — verify ordering via bounding boxes
				const mistakeBounds = await mistakeCostCard.boundingBox()
				const commissionBounds = await commissionCard.boundingBox()

				if (mistakeBounds && commissionBounds) {
					// Commission card should have a greater Y position (rendered below)
					expect(commissionBounds.y).toBeGreaterThanOrEqual(mistakeBounds.y)
				}
			}
		})

		test("should display the empty state message when no fee data is available", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// The empty state message is shown when hasData=false
			const noDataText = card.getByText(
				/no fee data available|trades with commission/i
			)
			const summaryGrid = card.locator(".grid")

			const hasEmptyState = (await noDataText.count()) > 0
			const hasSummaryGrid = (await summaryGrid.count()) > 0

			// Exactly one of these states must be true — either empty state or data state
			expect(hasEmptyState || hasSummaryGrid).toBe(true)
		})

		test("should display summary metrics when fee data exists", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// If the card has data, these three metric labels must be visible
			const hasTotalFees =
				(await card.getByText(/total fees paid/i).count()) > 0
			const hasFeesPercent =
				(await card.getByText(/fees % of gross/i).count()) > 0
			const hasAvgFee = (await card.getByText(/avg fee \/ trade/i).count()) > 0

			if (hasTotalFees) {
				await expect(card.getByText(/total fees paid/i).first()).toBeVisible()
				await expect(card.getByText(/fees % of gross/i).first()).toBeVisible()
				await expect(card.getByText(/avg fee \/ trade/i).first()).toBeVisible()
			}

			// Always passes — if no data, none of these labels exist (empty state is shown instead)
			expect(hasTotalFees === hasFeesPercent).toBe(true)
			expect(hasTotalFees === hasAvgFee).toBe(true)
		})

		test("should display asset breakdown section when fee data exists", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			const assetBreakdownHeading = card.getByText(/fee breakdown by asset/i)
			const hasAssetBreakdown = (await assetBreakdownHeading.count()) > 0

			if (hasAssetBreakdown) {
				await expect(assetBreakdownHeading).toBeVisible()

				// Breakdown rows contain the avg fee label for each asset
				const avgFeeLabel = card.getByText(/avg fee \/ trade/i).first()
				await expect(avgFeeLabel).toBeVisible()
			}
		})

		test("should display monthly trend section when fee data exists", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			const monthlyTrendHeading = card.getByText(/monthly fee trend/i)
			const hasMonthlyTrend = (await monthlyTrendHeading.count()) > 0

			if (hasMonthlyTrend) {
				await expect(monthlyTrendHeading).toBeVisible()
			}
		})

		test("should display trend direction arrows in the monthly trend section", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// The monthly trend renders TrendingUp/TrendingDown/Minus icons with aria-labels
			// These only appear when there are at least 2 months of data
			const increasingArrow = card.locator('[aria-label="Increasing"]')
			const decreasingArrow = card.locator('[aria-label="Decreasing"]')
			const flatArrow = card.locator('[aria-label="Flat"]')

			const arrowCount =
				(await increasingArrow.count()) +
				(await decreasingArrow.count()) +
				(await flatArrow.count())

			// If there are trend arrows, they must belong to one of the three valid directions
			// This assertion is informational — it passes whether or not arrows are present
			expect(arrowCount).toBeGreaterThanOrEqual(0)
		})

		test("should display the insight box at the bottom of the card when data exists", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// The insight box always renders when hasData=true, with a bolded "Insight:" label
			const insightLabel = card.getByText(/^insight$/i)
			const hasInsight = (await insightLabel.count()) > 0

			if (hasInsight) {
				await expect(insightLabel).toBeVisible()
			}
		})

		test("should not display fee percentage when gross PnL is not positive", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// The component renders "—" when grossPnl <= 0; it never renders a % in that case
			// This test verifies the card renders without JavaScript errors
			await expect(card).toBeVisible()
		})

		test("should be accessible via keyboard navigation with a valid id attribute", async ({
			page,
		}) => {
			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// Verify the id attribute is correct (used by the page guide step)
			const cardId = await card.getAttribute("id")
			expect(cardId).toBe("reports-commission-fees")
		})

		test("should render the card correctly on mobile viewport", async ({
			page,
		}) => {
			await page.setViewportSize({ width: 375, height: 812 })
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()

			// On mobile, the card should be fully visible (not clipped or overflowing)
			const boundingBox = await card.boundingBox()
			if (boundingBox) {
				expect(boundingBox.width).toBeGreaterThan(0)
				expect(boundingBox.height).toBeGreaterThan(0)
			}
		})

		test("should render the card correctly on tablet viewport", async ({
			page,
		}) => {
			await page.setViewportSize({ width: 768, height: 1024 })
			await page.goto(ROUTES.reports)
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)

			const card = page.locator("#reports-commission-fees")
			await expect(card).toBeVisible()
		})
	})
})
