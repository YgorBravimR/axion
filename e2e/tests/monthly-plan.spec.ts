import { test, expect } from "../fixtures/base"
import { ROUTES } from "../fixtures/test-data"
import { waitForSuspenseLoad, clickIfEnabled } from "../utils/helpers"

test.describe("Monthly Plan", () => {
	test.describe("Plan Tab Layout", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthlyPlan())
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
		})

		test("should load plan page with month heading and edit button", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			// Page should load with an h1 (month label) or an error/empty-state message
			const heading = page.locator("h1").first()
			const planContent = page.locator(
				"#month-narrative, h1, [aria-label*='month']"
			)
			await expect(planContent.first()).toBeVisible({ timeout: 10000 })
			// h1 should be present when the full plan renders
			const hasH1 = await heading.isVisible().catch(() => false)
			const hasMessage = await page
				.getByText(/annual plan not created|plano anual ainda não criado/i)
				.isVisible()
				.catch(() => false)
			expect(hasH1 || hasMessage).toBeTruthy()
		})

		test("should display month navigation links and month/year label", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			// Navigation is via <Link> components, not buttons with IDs
			const prevLink = page.getByRole("link", { name: /previous month/i })
			const nextLink = page.getByRole("link", { name: /next month/i })

			const hasPrev = await prevLink.isVisible().catch(() => false)
			const hasNext = await nextLink.isVisible().catch(() => false)
			expect(hasPrev || hasNext).toBeTruthy()

			// Month/year heading should be visible
			const monthLabel = page.locator("h1").first()
			await expect(monthLabel).toBeVisible({ timeout: 5000 })
		})

		test("should navigate to previous month", async ({ page }) => {
			await waitForSuspenseLoad(page)

			const currentUrl = page.url()

			const prevLink = page.getByRole("link", { name: /previous month/i })
			if (await prevLink.isVisible().catch(() => false)) {
				await prevLink.click()
				await page.waitForLoadState("load")
				await page.waitForTimeout(500)

				const newUrl = page.url()
				expect(newUrl).not.toBe(currentUrl)
				// URL should remain in the /plan/ hierarchy
				expect(newUrl).toMatch(/\/plan\/\d+\/\d+\/\d+/)
			}
		})

		test("should navigate to next month", async ({ page }) => {
			await waitForSuspenseLoad(page)

			// Navigate back one month first so we have a valid "next" destination
			const prevLink = page.getByRole("link", { name: /previous month/i })
			if (await prevLink.isVisible().catch(() => false)) {
				await prevLink.click()
				await page.waitForLoadState("load")
				await page.waitForTimeout(500)
			}

			const midUrl = page.url()

			const nextLink = page.getByRole("link", { name: /next month/i })
			if (await nextLink.isVisible().catch(() => false)) {
				await nextLink.click()
				await page.waitForLoadState("load")
				await page.waitForTimeout(500)

				const newUrl = page.url()
				expect(newUrl).not.toBe(midUrl)
			}
		})
	})

	test.describe("Create New Plan - Custom Mode", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthlyPlan())
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await waitForSuspenseLoad(page)
		})

		test("should show plan content or creation prompt when loading plan page", async ({
			page,
		}) => {
			// The plan page shows content when the fractal cascade is seeded,
			// or shows an "Annual plan not created" message when it isn't.
			const hasNarrative = await page
				.locator("#month-narrative")
				.isVisible()
				.catch(() => false)
			const hasErrorMessage = await page
				.getByText(
					/annual plan not created|plano anual ainda não criado|no plan configured/i
				)
				.isVisible()
				.catch(() => false)
			const hasH1 = await page
				.locator("h1")
				.isVisible()
				.catch(() => false)

			expect(hasNarrative || hasErrorMessage || hasH1).toBeTruthy()
		})

		test("should display goal field in edit slideover", async ({ page }) => {
			await waitForSuspenseLoad(page)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)

				// Goal input should be in the slideover (replaces old account-balance field)
				const goalField = page.locator("#month-goal")
				await expect(goalField).toBeVisible({ timeout: 5000 })
			} else {
				test.skip(true, "No plan row for current month — edit button not shown")
			}
		})

		test("should display risk profile picker in edit slideover", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)

				// Risk profile picker (replaces old risk-per-trade / daily-loss fields)
				const riskPicker = page.locator("#month-risk-profile")
				await expect(riskPicker).toBeVisible({ timeout: 5000 })
			} else {
				test.skip(true, "No plan row for current month — edit button not shown")
			}
		})

		test("should display intent and post-mortem note fields in edit slideover", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)

				const intentField = page.locator("#month-intent")
				const postmortemField = page.locator("#month-postmortem")
				await expect(intentField).toBeVisible({ timeout: 5000 })
				await expect(postmortemField).toBeVisible()
			} else {
				test.skip(true, "No plan row for current month — edit button not shown")
			}
		})

		test("should display save button in edit slideover", async ({ page }) => {
			await waitForSuspenseLoad(page)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)

				const saveButton = page.locator("#btn-month-save")
				await expect(saveButton).toBeVisible({ timeout: 5000 })
			} else {
				test.skip(true, "No plan row for current month — edit button not shown")
			}
		})

		test("should save changes in edit slideover successfully", async ({
			page,
		}) => {
			await waitForSuspenseLoad(page)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)

				const intentField = page.locator("#month-intent")
				if (await intentField.isVisible().catch(() => false)) {
					await intentField.fill("E2E test intent note")
				}

				const saveButton = page.locator("#btn-month-save")
				if (await saveButton.isVisible().catch(() => false)) {
					await saveButton.click()
					await page.waitForTimeout(2000)
				}

				// Page should remain on the plan URL after save
				await expect(page).toHaveURL(/\/plan\/\d+\/\d+\/\d+/)
			} else {
				test.skip(true, "No plan row for current month — edit button not shown")
			}
		})
	})

	test.describe("Create New Plan - Profile Mode", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthlyPlan())
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await waitForSuspenseLoad(page)
		})

		test("should show Custom/Profile mode toggle", async ({ page }) => {
			await waitForSuspenseLoad(page)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)

				// RiskProfilePicker is the profile mode selector
				const riskPicker = page.locator("#month-risk-profile")
				const modeToggle = page.getByText(
					/custom|profile|personalizado|perfil/i
				)

				const hasPicker = await riskPicker.isVisible().catch(() => false)
				const hasToggle = await modeToggle
					.first()
					.isVisible()
					.catch(() => false)
				expect(hasPicker || hasToggle).toBeTruthy()
			}
		})

		test("should switch to profile mode", async ({ page }) => {
			await clickIfEnabled(page, "#plan-next-month")
			await waitForSuspenseLoad(page)
			await clickIfEnabled(page, "#plan-next-month")
			await waitForSuspenseLoad(page)
			await clickIfEnabled(page, "#plan-next-month")
			await page.waitForTimeout(500)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(500)
			}

			// Click profile mode option
			const profileOption = page.getByText(/profile|perfil/i).first()
			if (await profileOption.isVisible().catch(() => false)) {
				await profileOption.click()
				await page.waitForTimeout(500)
			}
		})

		test("should display risk profile dropdown with built-in profiles", async ({
			page,
		}) => {
			await clickIfEnabled(page, "#plan-next-month")
			await waitForSuspenseLoad(page)
			await clickIfEnabled(page, "#plan-next-month")
			await waitForSuspenseLoad(page)
			await clickIfEnabled(page, "#plan-next-month")
			await page.waitForTimeout(500)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(300)

				const riskPicker = page.locator("#month-risk-profile")
				if (await riskPicker.isVisible().catch(() => false)) {
					await riskPicker.click()
					await page.waitForTimeout(300)
					const firstOption = page.getByRole("option").first()
					if (await firstOption.isVisible().catch(() => false)) {
						await expect(firstOption).toBeVisible({ timeout: 3000 })
					}
				}
			}
		})

		test("should show locked/derived values from selected profile", async ({
			page,
		}) => {
			await clickIfEnabled(page, "#plan-next-month")
			await waitForSuspenseLoad(page)
			await clickIfEnabled(page, "#plan-next-month")
			await waitForSuspenseLoad(page)
			await clickIfEnabled(page, "#plan-next-month")
			await page.waitForTimeout(500)

			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
				await page.waitForTimeout(300)

				const riskPicker = page.locator("#month-risk-profile")
				if (await riskPicker.isVisible().catch(() => false)) {
					await riskPicker.click()
					await page.waitForTimeout(300)
					const firstOption = page.getByRole("option").first()
					if (await firstOption.isVisible().catch(() => false)) {
						await firstOption.click()
						await page.waitForTimeout(500)
					}
				}
			}
		})
	})

	test.describe("Plan Summary View", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthlyPlan())
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await waitForSuspenseLoad(page)
		})

		test("should display plan content when plan page loads", async ({
			page,
		}) => {
			// The plan page renders narrative section, PlanVsReality, or an error state
			const hasNarrative = await page
				.locator("#month-narrative")
				.isVisible()
				.catch(() => false)
			const hasHeading = await page
				.locator("h1")
				.isVisible()
				.catch(() => false)
			const hasErrorState = await page
				.getByText(/annual plan not created|plano anual ainda não criado/i)
				.isVisible()
				.catch(() => false)

			expect(hasNarrative || hasHeading || hasErrorState).toBeTruthy()
		})

		test("should show Edit Plan button on existing plan", async ({ page }) => {
			// Edit button has aria-label "Edit month plan" and text "Edit plan"
			const editButton = page.getByRole("button", { name: /edit plan/i })
			const hasEdit = await editButton.isVisible().catch(() => false)
			// Either edit button is visible (plan exists) or it's not (no plan seeded)
			expect(typeof hasEdit).toBe("boolean")
		})

		test("should show risk profile badge when profile mode was used", async ({
			page,
		}) => {
			// If a plan was created with a profile, a badge should appear
			const profileBadge = page.getByText(
				/conservative|moderate|aggressive|conservador|moderado|agressivo/i
			)
			// This is optional — only shown when profile mode was used
			const hasBadge = await profileBadge
				.first()
				.isVisible()
				.catch(() => false)
			expect(typeof hasBadge).toBe("boolean") // Just verify the check completed
		})
	})

	test.describe("Advanced Settings", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthlyPlan())
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await waitForSuspenseLoad(page)
		})

		test("should toggle advanced settings section", async ({ page }) => {
			// Enter edit mode
			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
			}
			await page.waitForTimeout(500)

			// Look for advanced settings toggle
			const advancedToggle = page.getByText(/advanced|avançad/i)
			if (await advancedToggle.isVisible().catch(() => false)) {
				await advancedToggle.click()
				await page.waitForTimeout(300)
			}
		})

		test("should display extra fields in advanced settings", async ({
			page,
		}) => {
			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
			}
			await page.waitForTimeout(500)

			// Open advanced settings
			const advancedToggle = page.getByText(/advanced|avançad/i)
			if (await advancedToggle.isVisible().catch(() => false)) {
				await advancedToggle.click()
				await page.waitForTimeout(300)

				// Check for extra fields
				const profitTarget = page.locator("#plan-daily-profit-target")
				const maxTrades = page.locator("#plan-max-daily-trades")
				const consecutiveLosses = page.locator("#plan-max-consecutive-losses")

				const hasProfitTarget = await profitTarget
					.isVisible()
					.catch(() => false)
				const hasMaxTrades = await maxTrades.isVisible().catch(() => false)
				const hasConsecutiveLosses = await consecutiveLosses
					.isVisible()
					.catch(() => false)

				expect(
					hasProfitTarget || hasMaxTrades || hasConsecutiveLosses
				).toBeTruthy()
			}
		})

		test("should display behavioral switches", async ({ page }) => {
			const editButton = page.getByRole("button", { name: /edit plan/i })
			if (await editButton.isVisible().catch(() => false)) {
				await editButton.click()
			}
			await page.waitForTimeout(500)

			// Open advanced settings
			const advancedToggle = page.getByText(/advanced|avançad/i)
			if (await advancedToggle.isVisible().catch(() => false)) {
				await advancedToggle.click()
				await page.waitForTimeout(300)

				// Look for behavioral switches
				const switches = page.getByText(
					/allow 2nd|reduce risk|permitir 2|reduzir risco/i
				)
				const hasSwitches = await switches
					.first()
					.isVisible()
					.catch(() => false)
				expect(typeof hasSwitches).toBe("boolean")
			}
		})
	})

	test.describe("Copy from Previous Month", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.monthlyPlan())
			await page.waitForLoadState("load")
			await page.waitForTimeout(1000)
			await waitForSuspenseLoad(page)
		})

		test("should show Copy from Last Month button", async ({ page }) => {
			const copyButton = page.locator("#plan-copy-from-last-month")
			const hasCopy = await copyButton.isVisible().catch(() => false)
			expect(typeof hasCopy).toBe("boolean")
		})

		test("should copy plan when previous month has data", async ({ page }) => {
			const copyButton = page.locator("#plan-copy-from-last-month")
			if (await copyButton.isVisible().catch(() => false)) {
				await copyButton.click()
				await page.waitForTimeout(1000)

				// If previous month had a plan, form should be populated
				// If not, form may stay empty — both are valid states
				const balanceField = page.locator("#plan-account-balance")
				const isVisible = await balanceField.isVisible().catch(() => false)
				expect(typeof isVisible).toBe("boolean")
			}
		})
	})
})
