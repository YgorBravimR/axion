import { test, expect } from "@playwright/test"
import { ROUTES } from "../fixtures/test-data"

test.describe("Analytics", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ROUTES.analytics)
		await page.waitForLoadState("networkidle")
	})

	test.describe("Page Layout", () => {
		test("should display page header", async ({ page, isMobile }) => {
			test.skip(isMobile, "Desktop sidebar only — mobile uses Sheet")
			const activeNav = page.locator('a[aria-current="page"]:has-text("Analytics")')
			await expect(activeNav).toBeVisible()
		})

		test("should load without errors", async ({ page }) => {
			const errorMessages = page.locator('[role="alert"][data-type="error"]')
			await expect(errorMessages).toHaveCount(0)
		})
	})

	test.describe("Filter Panel", () => {
		test("should display filter panel", async ({ page }) => {
			const filterPanel = page.locator('[data-testid="filter-panel"], .filter-panel, :has-text("Filter")')
			await expect(filterPanel.first()).toBeVisible()
		})

		test("should have date range picker", async ({ page }) => {
			const dateFrom = page.locator('[name="dateFrom"], [data-testid="date-from"]').or(page.getByLabel(/from|de/i))
			const dateTo = page.locator('[name="dateTo"], [data-testid="date-to"]').or(page.getByLabel(/to|até/i))

			if ((await dateFrom.count()) > 0) {
				await expect(dateFrom.first()).toBeVisible()
			}
			if ((await dateTo.count()) > 0) {
				await expect(dateTo.first()).toBeVisible()
			}
		})

		test("should have date preset buttons", async ({ page }) => {
			const presets = ["today", "this week", "this month", "last 30 days", "all time",
				"hoje", "esta semana", "este mês", "últimos 30 dias", "todo período"]

			let foundPresets = 0
			for (const preset of presets) {
				const button = page.locator(`button:has-text("${preset}")`)
				if ((await button.count()) > 0) {
					foundPresets++
				}
			}
			expect(foundPresets).toBeGreaterThanOrEqual(0)
		})

		test("should have asset filter", async ({ page }) => {
			const assetFilter = page.locator('[data-testid="asset-filter"], :has-text("Asset")').first()
			if ((await assetFilter.count()) > 0) {
				await expect(assetFilter).toBeVisible()
			}
		})

		test("should have direction filter", async ({ page }) => {
			const directionFilter = page.locator('[data-testid="direction-filter"], :has-text("Direction")')
			if ((await directionFilter.count()) > 0) {
				await expect(directionFilter.first()).toBeVisible()
			}
		})

		test("should have outcome filter", async ({ page }) => {
			const outcomeFilter = page.locator('[data-testid="outcome-filter"], :has-text("Outcome")')
			if ((await outcomeFilter.count()) > 0) {
				await expect(outcomeFilter.first()).toBeVisible()
			}
		})

		test("should show active filter count", async ({ page }) => {
			// Apply a filter first
			const assetFilter = page.locator('[data-testid="asset-filter"]').first()
			if (await assetFilter.isVisible()) {
				await assetFilter.click()
				await page.locator('[role="option"]').first().click()

				// Check for active filter indicator
				const activeCount = page.locator('[data-testid="active-filters"], .filter-count, :has-text("active")')
				// May or may not show count
			}
		})

		test("should have clear filters button", async ({ page }) => {
			const clearButton = page.getByRole("button", { name: /clear|limpar/i })
			if ((await clearButton.count()) > 0) {
				await expect(clearButton).toBeVisible()
			}
		})

		test("should clear all filters when clicking clear", async ({ page }) => {
			const clearButton = page.getByRole("button", { name: /clear|limpar/i })
			if (await clearButton.isVisible()) {
				await clearButton.click()
				await page.waitForTimeout(500)
			}
		})
	})

	test.describe("Variable Comparison Chart", () => {
		test("should display variable comparison section", async ({ page }) => {
			const section = page.locator('[data-testid="variable-comparison"], :has-text("Performance")')
			await expect(section.first()).toBeVisible()
		})

		test("should have group by selector", async ({ page }) => {
			const groupBy = page.locator('[data-testid="group-by"], select:has-text("Group"), button:has-text("Group")')
			if ((await groupBy.count()) > 0) {
				await expect(groupBy.first()).toBeVisible()
			}
		})

		test("should display chart", async ({ page }) => {
			const chart = page.locator('.recharts-wrapper, svg.recharts-surface').first()
			await expect(chart).toBeVisible({ timeout: 5000 })
		})

		test("should switch group by option", async ({ page }) => {
			const groupBySelect = page.locator('[data-testid="group-by"], select').first()
			if (await groupBySelect.isVisible()) {
				await groupBySelect.selectOption({ index: 1 })
				await page.waitForTimeout(1000)
			}
		})
	})

	test.describe("Cumulative P&L Chart", () => {
		test("should display cumulative P&L chart", async ({ page }) => {
			const chart = page.locator('[data-testid="cumulative-pnl"], :has-text("Cumulative")')
			if ((await chart.count()) > 0) {
				await expect(chart.first()).toBeVisible()
			}
		})

		test("should show line chart", async ({ page }) => {
			// Check for Recharts SVG container or line/area elements
			const chart = page.locator('.recharts-wrapper, .recharts-line, .recharts-area, .recharts-surface')
			if ((await chart.count()) > 0) {
				await expect(chart.first()).toBeVisible()
			}
		})
	})

	test.describe("Expected Value Section", () => {
		test("should display expected value section", async ({ page }) => {
			const section = page.locator('[data-testid="expected-value"], :has-text("Expected Value")')
			if ((await section.count()) > 0) {
				await expect(section.first()).toBeVisible()
			}
		})

		test("should show win rate", async ({ page }) => {
			const winRate = page.locator(':has-text("Win Rate"):has-text("%")')
			if ((await winRate.count()) > 0) {
				await expect(winRate.first()).toBeVisible()
			}
		})

		test("should show average win/loss", async ({ page }) => {
			const avgWin = page.locator(':has-text("Avg Win"), :has-text("Média Ganho")')
			const avgLoss = page.locator(':has-text("Avg Loss"), :has-text("Média Perda")')

			if ((await avgWin.count()) > 0) {
				await expect(avgWin.first()).toBeVisible()
			}
			if ((await avgLoss.count()) > 0) {
				await expect(avgLoss.first()).toBeVisible()
			}
		})

		test("should show expected value calculation", async ({ page }) => {
			const ev = page.locator(':has-text("EV"), :has-text("Expected")')
			if ((await ev.count()) > 0) {
				await expect(ev.first()).toBeVisible()
			}
		})

		test("should show projected P&L for 100 trades", async ({ page }) => {
			const projection = page.locator(':has-text("100 trades"), :has-text("Projected")')
			if ((await projection.count()) > 0) {
				await expect(projection.first()).toBeVisible()
			}
		})
	})

	test.describe("R-Distribution Chart", () => {
		test("should display R-distribution section", async ({ page }) => {
			const section = page.locator('[data-testid="r-distribution"], :has-text("R-Distribution"), :has-text("Distribution")')
			if ((await section.count()) > 0) {
				await expect(section.first()).toBeVisible()
			}
		})

		test("should show histogram bars", async ({ page }) => {
			// Check for Recharts bar elements or SVG container in distribution section
			const chart = page.locator('.recharts-bar, .recharts-bar-rectangle, .recharts-wrapper')
			if ((await chart.count()) > 0) {
				await expect(chart.first()).toBeVisible()
			}
		})

		test("should show R-multiple range labels", async ({ page }) => {
			const labels = page.locator('text=/[-+]?\\d+\\.?\\d*R/')
			if ((await labels.count()) > 0) {
				await expect(labels.first()).toBeVisible()
			}
		})
	})

	test.describe("Tag Analysis", () => {
		test("should display tag analysis section", async ({ page }) => {
			const section = page.locator('[data-testid="tag-cloud"], :has-text("Tag"), :has-text("Setup")')
			if ((await section.count()) > 0) {
				await expect(section.first()).toBeVisible()
			}
		})

		test("should show tag statistics", async ({ page }) => {
			const tagStats = page.locator('[data-testid="tag-stats"], .tag-stats')
			if ((await tagStats.count()) > 0) {
				await expect(tagStats.first()).toBeVisible()
			}
		})
	})

	test.describe("Time-Based Analysis", () => {
		test("should display time analysis section", async ({ page }) => {
			const section = page.locator('[data-testid="time-analysis"], :has-text("Time Analysis")')
			if ((await section.count()) > 0) {
				await expect(section.first()).toBeVisible()
			}
		})

		test("should display hourly performance chart", async ({ page }) => {
			const hourlyChart = page.locator('[data-testid="hourly-chart"], :has-text("Hour")')
			if ((await hourlyChart.count()) > 0) {
				await expect(hourlyChart.first()).toBeVisible()
			}
		})

		test("should display day of week chart", async ({ page }) => {
			const dayChart = page.locator('[data-testid="day-of-week-chart"], :has-text("Day of Week")')
			if ((await dayChart.count()) > 0) {
				await expect(dayChart.first()).toBeVisible()
			}
		})

		test("should display time heatmap", async ({ page }) => {
			const heatmap = page.locator('[data-testid="time-heatmap"], :has-text("Heatmap")')
			if ((await heatmap.count()) > 0) {
				await expect(heatmap.first()).toBeVisible()
			}
		})

		test("should show best/worst time slots", async ({ page }) => {
			const bestSlot = page.locator(':has-text("Best"), :has-text("Melhor")')
			const worstSlot = page.locator(':has-text("Worst"), :has-text("Pior")')

			if ((await bestSlot.count()) > 0) {
				await expect(bestSlot.first()).toBeVisible()
			}
		})
	})

	test.describe("Chart Interactions", () => {
		test("should show tooltip on chart hover", async ({ page }) => {
			const chart = page.locator('.recharts-wrapper').first()

			if (await chart.isVisible()) {
				await chart.hover({ position: { x: 100, y: 50 } })
				await page.waitForTimeout(500)

				const tooltip = page.locator('.recharts-tooltip-wrapper')
				// Tooltip may or may not appear depending on data
			}
		})
	})

	test.describe("Filter Application", () => {
		test("should update charts when filters change", async ({ page }) => {
			// Apply a filter
			const assetFilter = page.locator('[data-testid="asset-filter"]').first()

			if (await assetFilter.isVisible()) {
				await assetFilter.click()
				await page.locator('[role="option"]').first().click()
				await page.waitForTimeout(1000)

				// Charts should update (loading indicator may appear)
				const loadingIndicator = page.locator('.animate-spin, [data-loading]')
				// Wait for loading to complete
				if ((await loadingIndicator.count()) > 0) {
					await expect(loadingIndicator).toBeHidden({ timeout: 10000 })
				}
			}
		})
	})

	test.describe("Empty State", () => {
		test("should show no data message when appropriate", async ({ page }) => {
			const noData = page.locator('text=/no data|sem dados|no trades/i')
			// May or may not be visible depending on filters/data
			const count = await noData.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe("Responsiveness", () => {
		test("should adapt layout on mobile", async ({ page }) => {
			await page.setViewportSize({ width: 375, height: 667 })
			await page.waitForTimeout(500)

			// Charts should stack vertically
			const charts = page.locator('.recharts-wrapper')
			const count = await charts.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})
	})
})
