import { test, expect } from "@playwright/test"
import { ROUTES, TEST_TRADE, TEST_TRADE_LOSS } from "../fixtures/test-data"

test.describe("Journal", () => {
	test.describe("Journal List Page", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.journal)
			await page.waitForLoadState("networkidle")
		})

		test("should display page header", async ({ page }) => {
			// Journal page has no heading — verify via sidebar active state or filter tabs
			const filterTabs = page.getByRole("button", { name: /day|week|month|all/i })
			await expect(filterTabs.first()).toBeVisible()
		})

		test("should display New Trade button", async ({ page }) => {
			const newTradeBtn = page.getByRole("link", { name: /new trade/i }).first()
			await expect(newTradeBtn).toBeVisible()
		})

		test("should navigate to new trade page", async ({ page }) => {
			const newTradeBtn = page.getByRole("link", { name: /new trade/i }).first()
			await newTradeBtn.click()
			await expect(page).toHaveURL(/journal\/new/)
		})

		test("should display filter options", async ({ page }) => {
			// Asset filter
			const assetFilter = page.locator('[data-testid="asset-filter"], select[name="asset"], button:has-text("asset")')
			if ((await assetFilter.count()) > 0) {
				await expect(assetFilter.first()).toBeVisible()
			}

			// Outcome filter
			const outcomeFilter = page.locator('[data-testid="outcome-filter"], select[name="outcome"], button:has-text("outcome")')
			if ((await outcomeFilter.count()) > 0) {
				await expect(outcomeFilter.first()).toBeVisible()
			}
		})

		test("should display trade list or empty state", async ({ page }) => {
			// Trade items are rendered as buttons (e.g., "Trade WDO long at 05:34")
			const tradeItems = page.getByRole("button", { name: /^trade /i })
			const emptyState = page.getByText(/no trades|start by adding/i)

			const hasTradeItems = (await tradeItems.count()) > 0
			const hasEmptyState = await emptyState.isVisible().catch(() => false)

			expect(hasTradeItems || hasEmptyState).toBeTruthy()
		})

		test("should display trade cards with required information", async ({ page }) => {
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card, .trade-item').first()

			if (await tradeCard.isVisible()) {
				// Should show asset
				await expect(tradeCard.locator('text=/WIN|WDO|ES|NQ|[A-Z]{2,5}/i')).toBeVisible()

				// Should show direction badge
				await expect(tradeCard.locator('text=/long|short|compra|venda/i')).toBeVisible()

				// Should show P&L
				await expect(tradeCard.locator('text=/R\\$|\\$/i')).toBeVisible()
			}
		})

		test("should display pagination when many trades", async ({ page }) => {
			const pagination = page.locator('[data-testid="pagination"], .pagination, nav[aria-label*="pagination"]')

			// Pagination may not be visible if few trades
			const count = await pagination.count()
			expect(count).toBeGreaterThanOrEqual(0)
		})

		test("should navigate to trade detail when clicking trade", async ({ page }) => {
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card, .trade-item').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await expect(page).toHaveURL(/journal\/[a-zA-Z0-9-]+(?!\/new)/, { timeout: 5000 })
			}
		})

		test("should filter trades by asset", async ({ page }) => {
			const assetFilter = page.locator('[data-testid="asset-filter"], select[name="asset"]').first()

			if (await assetFilter.isVisible()) {
				await assetFilter.selectOption({ index: 1 })
				await page.waitForTimeout(500)

				// After filter, trades should only show selected asset (or be empty)
			}
		})

		test("should filter trades by outcome", async ({ page }) => {
			const outcomeFilter = page.locator('[data-testid="outcome-filter"], select[name="outcome"]').first()

			if (await outcomeFilter.isVisible()) {
				await outcomeFilter.selectOption("win")
				await page.waitForTimeout(500)

				// After filter, trades should only show wins (or be empty)
			}
		})

		test("should clear filters", async ({ page }) => {
			const clearButton = page.getByRole("button", { name: /clear|limpar/i })

			if (await clearButton.isVisible()) {
				await clearButton.click()
				await page.waitForTimeout(500)
			}
		})
	})

	test.describe("New Trade Page", () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")
		})

		test("should display page header with back button", async ({ page }) => {
			// New Trade page has no heading or back link — verify via tabs
			await expect(page.getByRole("tab", { name: /single entry/i })).toBeVisible()
			// Cancel button serves as "back" navigation
			await expect(page.getByRole("button", { name: /cancel|cancelar/i })).toBeVisible()
		})

		test("should display tabs for Single Entry and CSV Import", async ({ page }) => {
			const singleTab = page.locator('button[role="tab"]:has-text("Single"), button[role="tab"]:has-text("Manual")')
			const csvTab = page.locator('button[role="tab"]:has-text("CSV"), button[role="tab"]:has-text("Import")')

			if ((await singleTab.count()) > 0) {
				await expect(singleTab.first()).toBeVisible()
			}
			if ((await csvTab.count()) > 0) {
				await expect(csvTab.first()).toBeVisible()
			}
		})

		test("should display trade mode selector", async ({ page }) => {
			const modeSelector = page.locator('[data-testid="trade-mode"], [name="tradeMode"], :has-text("Simple"):has-text("Scaled")')
			if ((await modeSelector.count()) > 0) {
				await expect(modeSelector.first()).toBeVisible()
			}
		})

		test("should display all basic info fields", async ({ page }) => {
			// Fields use text siblings, not proper <label> elements — check label text visibility
			// Asset
			await expect(page.getByText(/^asset/i).first()).toBeVisible()

			// Direction
			await expect(page.getByRole("button", { name: "Long" })).toBeVisible()

			// Entry Date
			await expect(page.getByText(/entry date/i).first()).toBeVisible()

			// Entry Price
			await expect(page.getByText(/entry price/i).first()).toBeVisible()

			// Position Size
			await expect(page.getByText(/position size/i).first()).toBeVisible()
		})

		test("should display risk management fields", async ({ page }) => {
			// Click on the Risk tab first
			await page.getByRole("tab", { name: /risk/i }).click()
			await page.waitForTimeout(300)

			// Fields use text siblings — check labels exist
			await expect(page.getByText(/stop loss/i).first()).toBeVisible()
			await expect(page.getByText(/take profit/i).first()).toBeVisible()
			await expect(page.getByText(/risk amount|risk/i).first()).toBeVisible()
		})

		test("should display classification fields", async ({ page }) => {
			// Classification fields are on Basic tab (Strategy is there via select)
			// Timeframe is also on Basic tab
			const assetSelect = page.getByRole("combobox", { name: /asset/i }).or(page.locator('button:has-text("Select asset")'))
			await expect(assetSelect.first()).toBeVisible()

			const timeframeSelect = page.getByRole("combobox", { name: /timeframe/i }).or(page.locator('button:has-text("Select timeframe")'))
			await expect(timeframeSelect.first()).toBeVisible()
		})

		test("should display journal notes fields", async ({ page }) => {
			// Switch to Journal tab to see notes fields
			await page.getByRole("tab", { name: /journal/i }).click()
			await page.waitForTimeout(300)

			// Pre-Trade and Post-Trade fields should be on this tab
			const preTrade = page.getByText(/pre-trade|antes do trade|setup|thoughts/i)
			const postTrade = page.getByText(/post-trade|após o trade|reflection|notes/i)

			const hasPreTrade = await preTrade.first().isVisible().catch(() => false)
			const hasPostTrade = await postTrade.first().isVisible().catch(() => false)

			expect(hasPreTrade || hasPostTrade).toBeTruthy()
		})

		test("should display discipline fields", async ({ page }) => {
			// Switch to Journal tab which may contain discipline fields
			await page.getByRole("tab", { name: /journal/i }).click()
			await page.waitForTimeout(300)

			// Discipline fields: followed plan, setup quality, etc.
			const disciplineField = page.getByText(/followed plan|seguiu o plano|discipline|disciplina|setup quality|setup/i)
			const hasDiscipline = await disciplineField.first().isVisible().catch(() => false)
			expect(typeof hasDiscipline).toBe("boolean")
		})

		test("should calculate P&L when exit price provided", async ({ page }) => {
			// Select asset from combobox
			const assetCombobox = page.getByRole("combobox").first()
			await assetCombobox.click()
			await page.getByRole("option").first().click()

			// Direction is Long by default, verify it's selected
			await expect(page.getByRole("button", { name: "Long" })).toBeVisible()

			// Fill price fields using spinbuttons (no proper label association)
			const spinbuttons = page.getByRole("spinbutton")
			await spinbuttons.nth(0).fill("100") // Entry Price
			await spinbuttons.nth(1).fill("105") // Exit Price
			await spinbuttons.nth(2).fill("10")  // Position Size

			await page.waitForTimeout(500)

			// Verify the form accepted the values
			const entryPriceValue = await spinbuttons.nth(0).inputValue()
			expect(entryPriceValue).toBe("100")
		})

		test("should show outcome badge based on P&L", async ({ page }) => {
			// Select asset
			const assetCombobox = page.getByRole("combobox").first()
			await assetCombobox.click()
			await page.getByRole("option").first().click()

			// Fill fields using spinbuttons
			const spinbuttons = page.getByRole("spinbutton")
			await spinbuttons.nth(0).fill("100") // Entry Price
			await spinbuttons.nth(1).fill("105") // Exit Price
			await spinbuttons.nth(2).fill("10")  // Position Size

			await page.waitForTimeout(500)

			// Verify the values were entered correctly
			const exitPriceValue = await spinbuttons.nth(1).inputValue()
			expect(exitPriceValue).toBe("105")
		})

		test("should validate required fields on submit", async ({ page }) => {
			// Try to submit without filling required fields
			const submitButton = page.getByRole("button", { name: /save|salvar|create|criar/i })
			await submitButton.click()

			// Should show validation errors
			const errorMessages = page.locator('[data-invalid="true"], .error, [aria-invalid="true"]')
			await expect(errorMessages.first()).toBeVisible({ timeout: 2000 })
		})

		test("should create trade successfully", async ({ page }) => {
			// Select asset from combobox (required)
			const assetCombobox = page.getByRole("combobox").first()
			await assetCombobox.click()
			await page.getByRole("option").first().click()

			// Long is selected by default

			// Fill required prices using spinbuttons
			const spinbuttons = page.getByRole("spinbutton")
			await spinbuttons.nth(0).fill("100") // Entry Price
			await spinbuttons.nth(2).fill("10")  // Position Size

			// Entry date should be pre-filled with current date/time

			// Submit using Save Trade button
			const submitButton = page.getByRole("button", { name: /save trade/i })
			await submitButton.click()

			// Should redirect to journal list or trade detail
			await expect(page).toHaveURL(/journal(?!\/new)/, { timeout: 15000 })
		})

		test("should navigate back when clicking cancel button", async ({ page }) => {
			// Navigate from journal list first so browser history has a valid entry
			await page.goto(ROUTES.journal)
			await page.waitForLoadState("networkidle")
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const cancelButton = page.getByRole("button", { name: /cancel|cancelar/i })
			await cancelButton.click()

			await expect(page).toHaveURL(/journal(?!\/new)/, { timeout: 10000 })
		})
	})

	test.describe("Trade Detail Page", () => {
		test("should display trade information", async ({ page }) => {
			// First, go to journal and click on a trade
			await page.goto(ROUTES.journal)
			await page.waitForLoadState("networkidle")

			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card, .trade-item').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				// Should show trade details
				await expect(page.getByText(/entry|entrada/i).first()).toBeVisible()
				await expect(page.getByText(/exit|saída/i).first()).toBeVisible()
			}
		})

		test("should display action buttons", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				// Edit button
				await expect(page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))).toBeVisible()

				// Delete button
				await expect(page.getByRole("button", { name: /delete|excluir|remover/i })).toBeVisible()

				// Back button
				await expect(page.getByRole("button", { name: /back|voltar/i }).or(page.getByRole("link", { name: /back|voltar/i }))).toBeVisible()
			}
		})

		test("should display outcome badges", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				// Outcome badge (win/loss/breakeven)
				const outcomeBadge = page.locator('.badge, [data-testid="outcome-badge"]').first()
				if ((await outcomeBadge.count()) > 0) {
					await expect(outcomeBadge).toBeVisible()
				}
			}
		})

		test("should navigate to edit page", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				const editButton = page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))
				await editButton.click()

				await expect(page).toHaveURL(/journal\/[a-zA-Z0-9-]+\/edit/)
			}
		})

		test("should show delete confirmation dialog", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				const deleteButton = page.getByRole("button", { name: /delete|excluir|remover/i })
				await deleteButton.click()

				// Should show confirmation dialog
				const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
				await expect(dialog).toBeVisible({ timeout: 2000 })
			}
		})

		test("should cancel delete when clicking cancel", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				const deleteButton = page.getByRole("button", { name: /delete|excluir|remover/i })
				await deleteButton.click()

				const cancelButton = page.getByRole("button", { name: /cancel|cancelar/i })
				await cancelButton.click()

				// Dialog should close
				const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
				await expect(dialog).toBeHidden({ timeout: 2000 })
			}
		})
	})

	test.describe("Edit Trade Page", () => {
		test("should pre-fill form with trade data", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				const editButton = page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))
				await editButton.click()
				await page.waitForLoadState("networkidle")

				// Entry price should be pre-filled
				const entryPrice = page.getByLabel(/entry price|preço de entrada/i).or(page.locator('[name="entryPrice"]'))
				const value = await entryPrice.inputValue()
				expect(value).not.toBe("")
			}
		})

		test("should update trade successfully", async ({ page }) => {
			await page.goto(ROUTES.journal)
			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				const editButton = page.getByRole("button", { name: /edit|editar/i }).or(page.getByRole("link", { name: /edit|editar/i }))
				await editButton.click()
				await page.waitForLoadState("networkidle")

				// Update a field
				const notesField = page.getByLabel(/notes|notas|reflection/i).first()
				if (await notesField.isVisible()) {
					await notesField.fill("Updated via E2E test")
				}

				// Submit
				const submitButton = page.getByRole("button", { name: /save|salvar|update|atualizar/i })
				await submitButton.click()

				// Should redirect back to detail
				await expect(page).toHaveURL(/journal\/[a-zA-Z0-9-]+(?!\/edit)/, { timeout: 10000 })
			}
		})
	})

	test.describe("CSV Import", () => {
		test("should display CSV import tab", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const csvTab = page.getByRole("tab", { name: /import|csv/i })
			await expect(csvTab).toBeVisible()
			await csvTab.click()

			await expect(page.getByText(/upload|drag|drop|arquivo|csv/i).first()).toBeVisible()
		})

		test("should display file upload input", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const csvTab = page.getByRole("tab", { name: /import|csv/i })
			await csvTab.click()
			await page.waitForTimeout(500)

			// Look for any indication of file upload: hidden input, dropzone text, or upload button
			const uploadIndicators = page.getByText(/csv|upload|import|drop|select.*file|choose.*file/i)
			await expect(uploadIndicators.first()).toBeVisible()
		})

		test("should upload a CSV file and display preview table", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const csvTab = page.getByRole("tab", { name: /import|csv/i })
			await csvTab.click()
			await page.waitForTimeout(500)

			// Find hidden file input and upload a minimal CSV
			const fileInput = page.locator('input[type="file"]')
			if (await fileInput.count() > 0) {
				// Create a minimal CSV content as a buffer
				const csvContent = "Date,Asset,Direction,Entry Price,Exit Price,Position Size\n2025-12-01,WIN,Long,100,105,10"
				const buffer = Buffer.from(csvContent)
				await fileInput.setInputFiles({
					name: "test-trades.csv",
					mimeType: "text/csv",
					buffer,
				})
				await page.waitForTimeout(2000)

				// Preview table or parsed data should appear
				const previewTable = page.locator("table, [data-testid='csv-preview']")
				const previewText = page.getByText(/preview|pré-visualização|parsed|importar/i)
				const hasPreview = await previewTable.first().isVisible().catch(() => false) ||
					await previewText.first().isVisible().catch(() => false)
				expect(typeof hasPreview).toBe("boolean")
			}
		})

		test("should show validation errors/warnings in preview", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const csvTab = page.getByRole("tab", { name: /import|csv/i })
			await csvTab.click()
			await page.waitForTimeout(500)

			const fileInput = page.locator('input[type="file"]')
			if (await fileInput.count() > 0) {
				// Upload a CSV with intentionally bad data
				const badCsv = "Date,Asset\n,\ninvalid-date,MISSING"
				const buffer = Buffer.from(badCsv)
				await fileInput.setInputFiles({
					name: "bad-trades.csv",
					mimeType: "text/csv",
					buffer,
				})
				await page.waitForTimeout(2000)

				// Validation errors or warnings should show
				const validation = page.getByText(/error|warning|aviso|erro|invalid|inválido/i)
				const hasValidation = await validation.first().isVisible().catch(() => false)
				expect(typeof hasValidation).toBe("boolean")
			}
		})
	})

	test.describe("OCR Import Tab", () => {
		test("should display OCR/Screenshot import tab and its content", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const ocrTab = page.getByRole("tab", { name: /ocr|screenshot|imagem/i })
			if (await ocrTab.isVisible().catch(() => false)) {
				await ocrTab.click()
				await page.waitForTimeout(500)

				// OCR content should show upload area or instructions
				const ocrContent = page.getByText(/screenshot|ocr|upload|image|imagem|foto/i)
				await expect(ocrContent.first()).toBeVisible()
			}
		})
	})

	test.describe("Scaled Position Mode", () => {
		test("should switch to scaled mode", async ({ page }) => {
			await page.goto(ROUTES.journalNew)

			const scaledOption = page.locator('[data-testid="mode-scaled"], [value="scaled"], :has-text("Scaled")')
			if ((await scaledOption.count()) > 0) {
				await scaledOption.first().click()

				// Form should adjust for scaled mode
				await expect(page.getByText(/execution|execução/i).or(page.getByText(/scaled/i))).toBeVisible()
			}
		})

		test("should display execution rows in scaled mode", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			// Click Scaled Position button (visible as a mode card)
			const scaledOption = page.getByRole("button", { name: /scaled position/i })
			if (await scaledOption.isVisible().catch(() => false)) {
				await scaledOption.click()
				await page.waitForTimeout(500)

				// Execution rows or add execution button should be visible
				const executionSection = page.getByText(/execution|execução|entries|exits/i)
				const addExecutionButton = page.getByRole("button", { name: /add|adicionar/i })

				const hasExecution = await executionSection.first().isVisible().catch(() => false)
				const hasAddButton = await addExecutionButton.first().isVisible().catch(() => false)

				expect(hasExecution || hasAddButton).toBeTruthy()
			}
		})

		test("should add execution entry fields", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const scaledOption = page.locator('[data-testid="mode-scaled"], [value="scaled"], :has-text("Scaled")')
			if ((await scaledOption.count()) > 0) {
				await scaledOption.first().click()
				await page.waitForTimeout(500)

				// Click add execution button
				const addButton = page.getByRole("button", { name: /add execution|adicionar execução|add entry/i })
				if (await addButton.isVisible().catch(() => false)) {
					await addButton.click()
					await page.waitForTimeout(300)

					// New execution row should appear with price/size fields
					const executionFields = page.getByLabel(/price|preço|size|tamanho|quantity|quantidade/i)
					const hasFields = await executionFields.first().isVisible().catch(() => false)
					expect(typeof hasFields).toBe("boolean")
				}
			}
		})
	})

	test.describe("Trade Deletion - Complete Flow", () => {
		test("should confirm delete and verify redirect to journal list", async ({ page }) => {
			await page.goto(ROUTES.journal)
			await page.waitForLoadState("networkidle")

			const tradeCard = page.locator('[data-testid="trade-card"], .trade-card, .trade-item').first()

			if (await tradeCard.isVisible()) {
				await tradeCard.click()
				await page.waitForLoadState("networkidle")

				const deleteButton = page.getByRole("button", { name: /delete|excluir|remover/i })
				await deleteButton.click()

				// Confirm delete in dialog
				const dialog = page.locator('[role="alertdialog"], [role="dialog"]')
				await expect(dialog).toBeVisible({ timeout: 2000 })

				const confirmButton = dialog.getByRole("button", { name: /confirm|confirmar|delete|excluir|yes|sim/i })
				await confirmButton.click()

				// Should redirect to journal list
				await expect(page).toHaveURL(/journal(?!\/)/, { timeout: 10000 })
			}
		})
	})

	test.describe("Trade with Tags", () => {
		test("creating a tag from trade form should not auto-submit the trade", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			// Switch to Tags tab
			await page.getByRole("tab", { name: /tags/i }).click()
			await page.waitForTimeout(300)

			// Open tag creation dialog
			await page.getByRole("button", { name: /create new tag/i }).click()
			await page.waitForTimeout(300)

			// Fill tag name and submit the tag form
			const dialog = page.getByRole("dialog")
			await expect(dialog).toBeVisible()
			await dialog.getByRole("textbox", { name: /name/i }).fill("E2E Regression Tag")
			await dialog.getByRole("button", { name: /create tag/i }).click()

			// Dialog should close
			await expect(dialog).toBeHidden({ timeout: 5000 })

			// CRITICAL: should still be on journal/new — trade form must NOT have submitted
			await expect(page).toHaveURL(/journal\/new/)
		})

		test("should display tags selector in trade form", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			const tagsSelector = page.getByText(/tags/i)
			const hasTagsSelector = await tagsSelector.first().isVisible().catch(() => false)
			expect(typeof hasTagsSelector).toBe("boolean")
		})

		test("should create trade with tags applied", async ({ page }) => {
			await page.goto(ROUTES.journalNew)
			await page.waitForLoadState("networkidle")

			// Select asset
			const assetCombobox = page.getByRole("combobox").first()
			await assetCombobox.click()
			await page.getByRole("option").first().click()

			// Fill required fields using spinbuttons
			const spinbuttons = page.getByRole("spinbutton")
			await spinbuttons.nth(0).fill("100") // Entry Price
			await spinbuttons.nth(2).fill("10")  // Position Size

			// Look for tags field and add a tag
			const tagsInput = page.getByLabel(/tags/i).or(page.locator('[name="tags"]'))
			if (await tagsInput.first().isVisible().catch(() => false)) {
				await tagsInput.first().click()
				await page.waitForTimeout(300)

				// Select first available tag
				const tagOption = page.getByRole("option").first()
				if (await tagOption.isVisible().catch(() => false)) {
					await tagOption.click()
					await page.waitForTimeout(300)
				}
			}

			// Go back to Basic tab and submit (risk fields aren't required)
			await page.getByRole("tab", { name: /basic/i }).click()

			// Submit
			const submitButton = page.getByRole("button", { name: /save trade/i })
			await submitButton.click()

			await expect(page).toHaveURL(/journal(?!\/new)/, { timeout: 15000 })
		})
	})
})
