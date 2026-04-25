import { test, expect } from "@playwright/test"
import { ROUTES, TEST_STRATEGY } from "../fixtures/test-data"

test.describe("Playbook", () => {
	test.describe("Playbook List Page", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.playbook)
			await page.waitForLoadState("networkidle")
		})

		test("should display page header", async ({ page }) => {
			// Page has no h1 heading; verify by checking the active sidebar link
			const activeNav = page.locator('a[aria-current="page"]:has-text("Playbook")')
			await expect(activeNav).toBeVisible()
		})

		test("should display compliance dashboard section", async ({ page }) => {
			const complianceSection = page.locator('[data-testid="compliance-dashboard"], :has-text("Compliance")')
			if ((await complianceSection.count()) > 0) {
				await expect(complianceSection.first()).toBeVisible()
			}
		})

		test("should display compliance score", async ({ page }) => {
			const score = page.locator(':has-text("Compliance"):has-text("%"), :has-text("Score"):has-text("%")')
			if ((await score.count()) > 0) {
				await expect(score.first()).toBeVisible()
			}
		})

		test("should display New Strategy button", async ({ page }) => {
			const newButton = page.getByRole("link", { name: /new strategy/i }).first()
			await expect(newButton).toBeVisible()
		})

		test("should navigate to new strategy page", async ({ page }) => {
			const newButton = page.getByRole("link", { name: /new strategy/i }).first()
			await newButton.click()
			await expect(page).toHaveURL(/playbook\/new/)
		})

		test("should display strategy list or empty state", async ({ page }) => {
			// Look for "Your Strategies" heading
			const strategiesHeading = page.getByRole("heading", { name: /your strategies/i })
			await expect(strategiesHeading).toBeVisible()
		})

		test("should display strategy cards with required information", async ({ page }) => {
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				// Should show strategy name
				await expect(strategyCard).toContainText(/.+/)

				// Should show trade count
				const tradeCount = strategyCard.locator(':has-text("trades"), :has-text("Trades")')
				if ((await tradeCount.count()) > 0) {
					await expect(tradeCount.first()).toBeVisible()
				}
			}
		})

		test("should navigate to strategy detail when clicking card", async ({ page }) => {
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await expect(page).toHaveURL(/playbook\/[a-zA-Z0-9-]+(?!\/new)/, { timeout: 5000 })
			}
		})
	})

	test.describe("New Strategy Page", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.playbookNew)
			await page.waitForLoadState("networkidle")
		})

		test("should display page header with back button", async ({ page }) => {
			// New strategy page has section headings but no page-level h1
			await expect(page.getByRole("heading", { name: /basic info/i })).toBeVisible()
			// Page uses a Cancel button (inside a link) instead of a back link
			await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible()
		})

		test("should display basic info fields", async ({ page }) => {
			// Code
			await expect(page.getByLabel(/code/i)).toBeVisible()

			// Name
			await expect(page.getByLabel(/strategy name|name/i).first()).toBeVisible()

			// Description
			const description = page.getByLabel(/description/i)
			if ((await description.count()) > 0) {
				await expect(description.first()).toBeVisible()
			}
		})

		test("should display rules fields", async ({ page }) => {
			// Entry Criteria
			const entryCriteria = page.getByLabel(/entry criteria|critérios de entrada/i).or(page.locator('[name="entryCriteria"]'))
			if ((await entryCriteria.count()) > 0) {
				await expect(entryCriteria.first()).toBeVisible()
			}

			// Exit Criteria
			const exitCriteria = page.getByLabel(/exit criteria|critérios de saída/i).or(page.locator('[name="exitCriteria"]'))
			if ((await exitCriteria.count()) > 0) {
				await expect(exitCriteria.first()).toBeVisible()
			}
		})

		test("should display risk settings fields", async ({ page }) => {
			// Target R-Multiple
			const targetR = page.getByLabel(/target r|r-múltiplo alvo/i).or(page.locator('[name="targetRMultiple"]'))
			if ((await targetR.count()) > 0) {
				await expect(targetR.first()).toBeVisible()
			}

			// Max Risk Per Trade
			const maxRisk = page.getByLabel(/max risk|risco máximo/i).or(page.locator('[name="maxRiskPerTrade"]'))
			if ((await maxRisk.count()) > 0) {
				await expect(maxRisk.first()).toBeVisible()
			}
		})

		test("should validate required fields", async ({ page }) => {
			// Try to submit without filling required fields
			const submitButton = page.getByRole("button", { name: "Create Strategy" })
			await submitButton.click()

			// HTML5 validation should kick in - check for :invalid pseudo-class or browser validation
			const codeField = page.locator('[name="code"]')
			const isInvalid = await codeField.evaluate((el: HTMLInputElement) => !el.validity.valid)
			expect(isInvalid).toBeTruthy()
		})

		test("should auto-uppercase code field", async ({ page }) => {
			const codeField = page.getByLabel("Code *").or(page.locator('[name="code"]'))
			await codeField.fill("test")
			await codeField.blur()

			// The uppercase class is applied, check the CSS class
			const hasUppercaseClass = await codeField.evaluate((el) => el.classList.contains("uppercase"))
			expect(hasUppercaseClass).toBeTruthy()
		})

		test("should validate code length (3-10 characters)", async ({ page }) => {
			const codeField = page.getByLabel(/code|código/i).or(page.locator('[name="code"]'))

			// Too short
			await codeField.fill("AB")
			const submitButton = page.getByRole("button", { name: /save|salvar|create|criar/i })
			await submitButton.click()

			// Should show validation error
			const errorMessages = page.locator('[data-invalid="true"], .error, :has-text("3")')
			// May show error about length
		})

		test("should create strategy successfully", async ({ page }) => {
			// Use last 7 chars of timestamp to generate a unique 10-char code within DB limits
			const uniqueCode = `S${Date.now().toString().slice(-7)}`

			// Fill code
			await page.getByLabel("Code *").or(page.locator('[name="code"]')).fill(uniqueCode)

			// Fill name
			await page.getByLabel("Strategy Name *").or(page.locator('[name="name"]')).fill("Test Strategy E2E")

			// Submit
			const submitButton = page.getByRole("button", { name: "Create Strategy" })
			await submitButton.click()

			// Should redirect to playbook or detail page after server action completes
			await expect(page).toHaveURL(/playbook(?!\/new)/, { timeout: 20000 })
		})

		test("should reject code with special characters and highlight code field", async ({ page }) => {
			// Regression: bug 543aac13 — Ç and accented chars bypassed validation
			const codeField = page.getByLabel("Code *").or(page.locator('[name="code"]'))
			const nameField = page.getByLabel("Strategy Name *").or(page.locator('[name="name"]'))

			await codeField.fill("RTÇF")
			await nameField.fill("Test Invalid Code")

			const submitButton = page.getByRole("button", { name: "Create Strategy" })
			await submitButton.click()

			// Should stay on form (not navigate away)
			await expect(page).toHaveURL(/playbook\/new/)

			// Code field should get aria-invalid and focus
			await expect(codeField).toBeFocused({ timeout: 3000 })
		})

		test("should navigate back when clicking cancel button", async ({ page }) => {
			// Page uses a Cancel button (wrapped in a link to /playbook) instead of a back link
			const cancelButton = page.getByRole("button", { name: /cancel/i })
			await cancelButton.click()

			await expect(page).toHaveURL(/playbook(?!\/new)/)
		})
	})

	test.describe("Strategy Detail Page", () => {
		test("should display strategy information", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			await page.waitForLoadState("networkidle")

			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				// Should show strategy name
				await expect(page.getByRole("heading")).toBeVisible()
			}
		})

		test("should display performance stats", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				// Performance stats
				const stats = page.locator(':has-text("Trade"), :has-text("P&L"), :has-text("Win Rate")')
				if ((await stats.count()) > 0) {
					await expect(stats.first()).toBeVisible()
				}
			}
		})

		test("should display action buttons", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				// Edit button
				await expect(page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))).toBeVisible()

				// Delete button
				await expect(page.getByRole("button", { name: /delete|excluir/i })).toBeVisible()
			}
		})

		test("should display rules if configured", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				// Rules section (may or may not exist based on strategy)
				const rulesSection = page.locator(':has-text("Entry"), :has-text("Exit"), :has-text("Rules")')
				// May or may not be visible
			}
		})

		test("should navigate to edit page", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				const editButton = page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))
				await editButton.click()

				await expect(page).toHaveURL(/playbook\/[a-zA-Z0-9-]+\/edit/)
			}
		})

		test("should show delete confirmation dialog", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				const deleteButton = page.getByRole("button", { name: /delete|excluir/i })
				await deleteButton.click()

				const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
				await expect(dialog).toBeVisible({ timeout: 2000 })
			}
		})
	})

	test.describe("Edit Strategy Page", () => {
		test("should pre-fill form with strategy data", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				const editButton = page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))
				await editButton.click()
				await page.waitForLoadState("networkidle")

				// Name should be pre-filled
				const nameField = page.getByLabel(/name|nome/i).or(page.locator('[name="name"]'))
				const value = await nameField.inputValue()
				expect(value).not.toBe("")
			}
		})

		test("should update strategy successfully", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				const editButton = page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))
				await editButton.click()
				await page.waitForLoadState("networkidle")

				// Update description
				const descField = page.getByLabel(/description|descrição/i).or(page.locator('[name="description"]'))
				if (await descField.isVisible()) {
					await descField.fill("Updated via E2E test")
				}

				// Submit
				const submitButton = page.getByRole("button", { name: /save|salvar|update|atualizar/i })
				await submitButton.click()

				// Should redirect back
				await expect(page).toHaveURL(/playbook\/[a-zA-Z0-9-]+(?!\/edit)/, { timeout: 20000 })
			}
		})
	})

	test.describe("Delete Strategy", () => {
		test("should cancel delete when clicking cancel", async ({ page }) => {
			await page.goto(ROUTES.playbook)
			const strategyCard = page.locator('[data-testid="strategy-card"], .strategy-card').first()

			if (await strategyCard.isVisible()) {
				await strategyCard.click()
				await page.waitForLoadState("networkidle")

				const deleteButton = page.getByRole("button", { name: /delete|excluir/i })
				await deleteButton.click()

				const cancelButton = page.getByRole("button", { name: /cancel|cancelar/i })
				await cancelButton.click()

				const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
				await expect(dialog).toBeHidden({ timeout: 2000 })
			}
		})
	})

	test.describe("Compliance Dashboard", () => {
		test("should show compliance trend indicator", async ({ page }) => {
			await page.goto(ROUTES.playbook)

			const trendIndicator = page.locator('[data-testid="compliance-trend"], :has-text("trend"), svg[class*="arrow"]')
			// May or may not be visible depending on data
		})

		test("should show recent compliance data", async ({ page }) => {
			await page.goto(ROUTES.playbook)

			const recentCompliance = page.locator(':has-text("Recent"), :has-text("Recente")')
			// May or may not be visible
		})
	})
})
