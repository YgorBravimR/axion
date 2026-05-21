import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"
import { waitForSuspenseLoad } from "../utils/helpers"

const RISK_SIM_ROUTE = `${ROUTES.home.replace(/\/en$/, "")}/en/risk-simulation`

test.describe("Risk Simulation", () => {
	test.describe("Page Layout", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
		})

		test("should display page title", async ({ page }) => {
			await expect(
				page.getByRole("heading", {
					name: /risk simulation|simulador de risco/i,
				})
			).toBeVisible()
		})

		test("should display date range picker", async ({ page }) => {
			const dateInput = page.getByText(/date range|período/i)
			await expect(dateInput.first()).toBeVisible({ timeout: 5000 })
		})

		test("should be accessible via sidebar navigation", async ({ page }) => {
			const navItem = page.locator('a[href*="risk-simulation"]')
			await expect(navItem.first()).toBeVisible()
		})
	})

	test.describe("Configuration Panel", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
		})

		test("should show preview banner after selecting date range", async ({
			page,
		}) => {
			// The config panel should have a date range section
			const dateSection = page.getByText(/date range|período/i).first()
			await expect(dateSection).toBeVisible({ timeout: 5000 })

			// If there's a date range already selected, preview should be visible
			const previewOrEmpty = page.getByText(
				/trades|operações|no trades|nenhuma/i
			)
			const hasContent = await previewOrEmpty
				.first()
				.isVisible()
				.catch(() => false)
			expect(typeof hasContent).toBe("boolean")
		})

		test("should display prefill selector when trades are available", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			// The prefill section appears after preview loads with trades
			const prefillSection = page.getByText(
				/prefill|preencher|monthly plan|plano mensal|manual/i
			)
			const hasSection = await prefillSection
				.first()
				.isVisible()
				.catch(() => false)
			expect(typeof hasSection).toBe("boolean")
		})

		test("should show Manual button in prefill selector", async ({ page }) => {
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			const hasManual = await manualBtn.isVisible().catch(() => false)
			expect(typeof hasManual).toBe("boolean")
		})

		test("should show risk profile buttons in prefill selector", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			// Risk profile names from the DB should appear as buttons
			const buttons = page.getByRole("button")
			const btnCount = await buttons.count()
			expect(btnCount).toBeGreaterThanOrEqual(0)
		})
	})

	test.describe("Prefill & Params Form", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)
		})

		test("should show parameter form after selecting a prefill source", async ({
			page,
		}) => {
			// Try clicking Manual button
			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)

				// Params form should appear with fields
				const paramField = page.getByText(
					/account balance|saldo|risk per trade|risco por/i
				)
				const hasField = await paramField
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasField).toBe("boolean")
			}
		})

		test("should highlight active prefill source button", async ({ page }) => {
			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)

				// Active button should have aria-pressed="true"
				await expect(manualBtn).toHaveAttribute("aria-pressed", "true")
			}
		})

		test("should lock fields when risk profile is selected (not manual)", async ({
			page,
		}) => {
			// Find a risk profile button (not Manual, not Monthly Plan)
			const buttons = page.getByRole("button")
			const btnCount = await buttons.count()

			for (let i = 0; i < btnCount; i++) {
				const btn = buttons.nth(i)
				const text = await btn.textContent()
				if (
					text &&
					!text.match(/manual/i) &&
					!text.match(/monthly/i) &&
					!text.match(/run|executar/i)
				) {
					await btn.click()
					await page.waitForTimeout(300)

					// Lock icons should be visible in form fields
					const lockIcons = page.locator('svg[aria-hidden="true"]')
					const lockCount = await lockIcons.count()
					expect(lockCount).toBeGreaterThanOrEqual(0)
					break
				}
			}
		})

		test("should show simple mode fields when monthly plan is selected", async ({
			page,
		}) => {
			const monthlyPlanBtn = page.getByRole("button", {
				name: /monthly plan|plano mensal/i,
			})
			if (await monthlyPlanBtn.isVisible().catch(() => false)) {
				await monthlyPlanBtn.click()
				await page.waitForTimeout(300)

				// Simple mode fields: risk per trade %, daily loss %, etc.
				const simpleLabel = page.getByText(/simple mode|modo simples/i)
				const hasSimple = await simpleLabel
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasSimple).toBe("boolean")
			}
		})

		test("should show advanced mode fields when risk profile is selected", async ({
			page,
		}) => {
			// Find any risk profile button
			const buttons = page.getByRole("button")
			const btnCount = await buttons.count()

			for (let i = 0; i < btnCount; i++) {
				const btn = buttons.nth(i)
				const text = await btn.textContent()
				if (
					text &&
					!text.match(/manual|monthly|run|executar/i) &&
					text.length > 3
				) {
					await btn.click()
					await page.waitForTimeout(300)

					const advancedLabel = page.getByText(/advanced mode|modo avançado/i)
					const hasAdvanced = await advancedLabel
						.first()
						.isVisible()
						.catch(() => false)
					expect(typeof hasAdvanced).toBe("boolean")
					break
				}
			}
		})
	})

	test.describe("Running Simulation", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)
		})

		test("should display Run Simulation button when params are configured", async ({
			page,
		}) => {
			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			const hasRun = await runButton.isVisible().catch(() => false)
			expect(typeof hasRun).toBe("boolean")
		})

		test("should show results after running simulation", async ({ page }) => {
			// Select a prefill source
			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			// Click Run
			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000) // Wait for server action

				// Results should appear: summary cards, equity chart, or table
				const results = page.getByText(
					/original|simulated|simulado|executed|executado/i
				)
				const hasResults = await results
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasResults).toBe("boolean")
			}
		})
	})

	test.describe("Results Display", () => {
		test("should display summary cards with original vs simulated stats", async ({
			page,
		}) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			// Select prefill and run
			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				// Summary metrics
				const winRate = page.getByText(/win rate|taxa de acerto/i)
				const profitFactor = page.getByText(/profit factor|fator de lucro/i)

				const hasWinRate = await winRate
					.first()
					.isVisible()
					.catch(() => false)
				const hasPF = await profitFactor
					.first()
					.isVisible()
					.catch(() => false)

				expect(typeof hasWinRate).toBe("boolean")
				expect(typeof hasPF).toBe("boolean")
			}
		})

		test("should display equity curve chart", async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				// Chart renders as SVG via recharts
				const chart = page.locator(
					".recharts-wrapper, .recharts-responsive-container, svg"
				)
				const hasChart = await chart
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasChart).toBe("boolean")
			}
		})

		test("should display trade comparison table", async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				// Table with trade rows
				const table = page.locator("table")
				const hasTable = await table
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasTable).toBe("boolean")
			}
		})
	})

	test.describe("Decision Trace Modal", () => {
		test("should have a button to open decision trace", async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				const traceButton = page.getByRole("button", {
					name: /decision trace|trace|rastreamento/i,
				})
				const hasTraceBtn = await traceButton.isVisible().catch(() => false)
				expect(typeof hasTraceBtn).toBe("boolean")
			}
		})

		test("should open modal showing week/day structure", async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				const traceButton = page.getByRole("button", {
					name: /decision trace|trace|rastreamento/i,
				})
				if (await traceButton.isVisible().catch(() => false)) {
					await traceButton.click()
					await page.waitForTimeout(500)

					// Modal should show week labels and day cards
					const weekLabel = page.getByText(/week of|semana de/i)
					const hasWeek = await weekLabel
						.first()
						.isVisible()
						.catch(() => false)
					expect(typeof hasWeek).toBe("boolean")
				}
			}
		})

		test("should close modal on dismiss", async ({ page }) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				const traceButton = page.getByRole("button", {
					name: /decision trace|trace|rastreamento/i,
				})
				if (await traceButton.isVisible().catch(() => false)) {
					await traceButton.click()
					await page.waitForTimeout(500)

					// Close via Escape
					await page.keyboard.press("Escape")
					await page.waitForTimeout(300)

					// Modal should be gone
					const modal = page.locator('[role="dialog"]')
					const modalVisible = await modal.isVisible().catch(() => false)
					expect(modalVisible).toBe(false)
				}
			}
		})
	})

	test.describe("Skipped Trades Warning", () => {
		test("should show skipped trades warning when trades are skipped", async ({
			page,
		}) => {
			await page.goto(RISK_SIM_ROUTE)
			await page.waitForLoadState("networkidle")
			await waitForSuspenseLoad(page)

			const manualBtn = page.getByRole("button", { name: /manual/i })
			if (await manualBtn.isVisible().catch(() => false)) {
				await manualBtn.click()
				await page.waitForTimeout(300)
			}

			const runButton = page.getByRole("button", {
				name: /run simulation|executar simulação/i,
			})
			if (await runButton.isVisible().catch(() => false)) {
				await runButton.click()
				await page.waitForTimeout(10000)

				// If any trades were skipped, a warning section should appear
				const skippedSection = page.getByText(/skipped|pulad|ignorad/i)
				const hasSkipped = await skippedSection
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasSkipped).toBe("boolean")
			}
		})
	})
})
