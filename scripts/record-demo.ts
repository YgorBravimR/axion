/**
 * ProfitJournal Demo Video Recorder
 *
 * Usage:
 *   npx tsx scripts/record-demo.ts
 *
 * Toggle scenes on/off in the SCENES config at the bottom.
 */

import { chromium, type Page } from "playwright"
import path from "path"
import fs from "fs"

// ── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
	baseUrl: "http://localhost:3003",
	locale: "pt-BR",
	credentials: {
		email: "admin@profitjournal.com",
		password: "Admin123!",
	},
	accountName: "T100",
	csvFile: path.resolve("video-trades.csv"),
	viewport: { width: 1749, height: 980 },
	videoDir: path.resolve("demo-videos"),

	timing: {
		pageLoad: 2500,
		sectionView: 2000,
		scrollPause: 1200,
		beforeClick: 500,
		afterClick: 1000,
		shortPause: 600,
		tabSwitch: 1200,
	},
}

// ── Screenshot Capture ──────────────────────────────────────────────────────

const CAPTURE_SCREENSHOTS = true
const SCREENSHOT_DIR = path.resolve("demo-videos/frames")
let frameCounter = 0
let currentScene = ""

const capture = async (page: Page, label: string) => {
	if (!CAPTURE_SCREENSHOTS) return
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
	frameCounter++
	const paddedNum = String(frameCounter).padStart(3, "0")
	const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_")
	const filename = `${paddedNum}_${currentScene}_${safeLabel}.png`
	await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const scrollTo = async (page: Page, top: number) => {
	await page.evaluate((scrollTop) => {
		// Find the actual scrollable container by walking all elements
		let bestMatch: Element | null = null
		let bestHeight = 0

		document.querySelectorAll("*").forEach(el => {
			const s = getComputedStyle(el)
			if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "hidden") && el.scrollHeight > el.clientHeight) {
				const diff = el.scrollHeight - el.clientHeight
				if (diff > bestHeight) {
					bestHeight = diff
					bestMatch = el
				}
			}
		})

		if (bestMatch) {
			(bestMatch as Element).scrollTo({ top: scrollTop, behavior: "smooth" })
		}
	}, top)
}

/**
 * Smoothly scrolls an element into the center of the viewport.
 */
const scrollToElement = async (page: Page, selector: string) => {
	await page.evaluate((sel) => {
		const el = document.querySelector(sel)
		if (!el) return

		let scrollParent = el.parentElement
		while (scrollParent) {
			const s = getComputedStyle(scrollParent)
			if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "hidden") && scrollParent.scrollHeight > scrollParent.clientHeight) break
			scrollParent = scrollParent.parentElement
		}

		if (scrollParent) {
			const elRect = el.getBoundingClientRect()
			const parentRect = scrollParent.getBoundingClientRect()
			const offset = elRect.top - parentRect.top + elRect.height / 2
			scrollParent.scrollTo({ top: Math.max(0, scrollParent.scrollTop + offset - parentRect.height / 2), behavior: "smooth" })
		} else {
			el.scrollIntoView({ behavior: "smooth", block: "center" })
		}
	}, selector)
	await pause(800)
}

const scrollLocatorIntoView = async (page: Page, locator: ReturnType<Page["locator"]>) => {
	const elHandle = await locator.elementHandle()
	if (!elHandle) return

	await page.evaluate((el) => {
		let scrollParent = (el as Element).parentElement
		while (scrollParent) {
			const s = getComputedStyle(scrollParent)
			if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "hidden") && scrollParent.scrollHeight > scrollParent.clientHeight) break
			scrollParent = scrollParent.parentElement
		}

		if (scrollParent) {
			const elRect = (el as Element).getBoundingClientRect()
			const parentRect = scrollParent.getBoundingClientRect()
			const offset = elRect.top - parentRect.top + elRect.height / 2
			scrollParent.scrollTo({ top: Math.max(0, scrollParent.scrollTop + offset - parentRect.height / 2), behavior: "smooth" })
		} else {
			(el as Element).scrollIntoView({ behavior: "smooth", block: "center" })
		}
	}, elHandle)

	await pause(800)
}

const log = (msg: string) => console.log(`  ${msg}`)

/**
 * Navigate to a page by clicking the sidebar link.
 * Falls back to direct URL if sidebar link not found.
 */
const navigateViaSidebar = async (page: Page, sidebarText: RegExp, fallbackPath: string) => {
	const sidebarLink = page.locator("nav a, aside a").filter({ hasText: sidebarText }).first()
	if (await sidebarLink.isVisible().catch(() => false)) {
		const box = await sidebarLink.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
			await pause(CONFIG.timing.beforeClick)
			await sidebarLink.click()
		}
	} else {
		await page.goto(`${CONFIG.baseUrl}/${CONFIG.locale}${fallbackPath}`)
	}
	await page.waitForLoadState("domcontentloaded")
	await pause(CONFIG.timing.pageLoad)
}

const smoothClick = async (page: Page, selector: string, options?: { timeout?: number }) => {
	const locator = page.locator(selector).first()
	await locator.waitFor({ state: "visible", timeout: options?.timeout ?? 10000 })
	const box = await locator.boundingBox()
	if (!box) return
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
	await pause(CONFIG.timing.beforeClick)
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
	await pause(CONFIG.timing.afterClick)
}

const smoothClickText = async (page: Page, text: string | RegExp) => {
	const locator = page.getByText(text).first()
	await locator.waitFor({ state: "visible", timeout: 10000 })
	const box = await locator.boundingBox()
	if (!box) return
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
	await pause(CONFIG.timing.beforeClick)
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
	await pause(CONFIG.timing.afterClick)
}

const smoothClickRole = async (page: Page, role: "button" | "link" | "tab", name: string | RegExp) => {
	const locator = page.getByRole(role, { name })
	await locator.waitFor({ state: "visible", timeout: 10000 })
	const box = await locator.boundingBox()
	if (!box) return
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
	await pause(CONFIG.timing.beforeClick)
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
	await pause(CONFIG.timing.afterClick)
}

const smoothFill = async (page: Page, selector: string, value: string) => {
	const locator = page.locator(selector).first()
	await locator.waitFor({ state: "visible", timeout: 10000 })
	const box = await locator.boundingBox()
	if (!box) return
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
	await pause(300)
	await locator.click()
	await pause(200)
	await locator.fill(value)
	await pause(CONFIG.timing.shortPause)
}

// ── Click Indicator ─────────────────────────────────────────────────────────

const injectClickIndicator = async (page: Page) => {
	await page.addInitScript(() => {
		const style = document.createElement("style")
		style.textContent = `
			.pw-click-indicator {
				position: fixed; width: 30px; height: 30px; border-radius: 50%;
				background: rgba(234, 179, 8, 0.4); border: 2px solid rgba(234, 179, 8, 0.8);
				pointer-events: none; z-index: 999999; transform: translate(-50%, -50%);
				animation: pw-ripple 0.6s ease-out forwards;
			}
			@keyframes pw-ripple {
				0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
				100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
			}
			.pw-cursor-dot {
				position: fixed; width: 14px; height: 14px; border-radius: 50%;
				background: rgba(234, 179, 8, 0.9); border: 2px solid white;
				pointer-events: none; z-index: 999998; transform: translate(-50%, -50%);
				transition: left 0.08s ease-out, top 0.08s ease-out;
				box-shadow: 0 0 10px rgba(234, 179, 8, 0.5);
			}
		`
		document.addEventListener("DOMContentLoaded", () => {
			document.head.appendChild(style)
			const dot = document.createElement("div")
			dot.className = "pw-cursor-dot"
			dot.style.left = "-100px"
			dot.style.top = "-100px"
			document.body.appendChild(dot)
			document.addEventListener("mousemove", (e) => {
				dot.style.left = e.clientX + "px"
				dot.style.top = e.clientY + "px"
			})
			document.addEventListener("click", (e) => {
				const ripple = document.createElement("div")
				ripple.className = "pw-click-indicator"
				ripple.style.left = e.clientX + "px"
				ripple.style.top = e.clientY + "px"
				document.body.appendChild(ripple)
				setTimeout(() => ripple.remove(), 600)
			})
		})
	})
}

// ── Scenes ──────────────────────────────────────────────────────────────────

const sceneLogin = async (page: Page) => {
	log("📱 Logging in...")
	const loc = CONFIG.locale
	await page.goto(`${CONFIG.baseUrl}/${loc}/login`, { timeout: 30000 })
	await page.waitForLoadState("domcontentloaded")
	await pause(CONFIG.timing.sectionView)
	await capture(page, "login-page")

	await smoothFill(page, "[name='email'], #email, input[type='email']", CONFIG.credentials.email)
	await smoothFill(page, "#password", CONFIG.credentials.password)
	await smoothClickRole(page, "button", /sign in|entrar/i)

	log("🔑 Selecting account...")
	const loginResult = await Promise.race([
		page.waitForURL("**/", { timeout: 10000 }).then(() => "dashboard" as const),
		page.getByText(/Select Account|Selecionar Conta/i).waitFor({ timeout: 5000 }).then(() => "select-account" as const),
	]).catch(() => "dashboard" as const)

	if (loginResult === "select-account") {
		await pause(CONFIG.timing.sectionView)
		await capture(page, "account-selection")
		await smoothClickText(page, CONFIG.accountName)
		await smoothClickRole(page, "button", /continue|continuar/i)
		await page.waitForURL("**/", { timeout: 15000 })
	}

	await page.waitForLoadState("domcontentloaded")
	await pause(CONFIG.timing.pageLoad)
}

const sceneCsvImport = async (page: Page) => {
	const { timing } = CONFIG

	log("➕ Navigating to New Trade...")
	await navigateViaSidebar(page, /novo trade|new trade/i, "/journal/new")

	log("📄 Switching to CSV Import...")
	await smoothClickText(page, /Importar CSV|CSV Import/i)
	await pause(timing.tabSwitch)
	await capture(page, "csv-upload-zone")

	log("📤 Waiting for CSV file drop...")
	log("   👉 DROP the video-trades.csv file onto the upload area now")
	await pause(timing.sectionView)

	const uploadZone = page.locator("#csv-upload-zone")
	const zoneBox = await uploadZone.boundingBox()
	if (zoneBox) {
		await page.mouse.move(zoneBox.x + zoneBox.width / 2, zoneBox.y + zoneBox.height / 2, { steps: 20 })
	}

	await page.locator("#csv-import-submit").waitFor({ state: "visible", timeout: 120000 })
	await pause(timing.pageLoad)
	log("   ✅ CSV validated")

	log("👀 Viewing imported trades...")
	await pause(timing.sectionView)
	await capture(page, "csv-validated-trades")
	await scrollTo(page, 500)
	await pause(timing.scrollPause)

	log("✅ Saving imported trades...")
	const importBtn = page.locator("#csv-import-submit")
	await scrollLocatorIntoView(page, importBtn)
	await pause(timing.sectionView)
	await smoothClick(page, "#csv-import-submit", { timeout: 15000 })

	log("   Waiting for import processing...")
	await page.waitForURL("**/journal**", { timeout: 60000 })
	await page.waitForLoadState("domcontentloaded")
	await pause(timing.pageLoad)
}

const sceneJournal = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📓 Browsing trades in Journal...")

	// Navigate to journal if not already there
	if (!page.url().includes("/journal")) {
		await navigateViaSidebar(page, /diário|journal/i, "/journal")
	}

	await pause(timing.sectionView)

	// Click "All" / "Todos" filter
	const allFilter = page.locator("button").filter({ hasText: /^(all|todos|tudo)$/i }).first()
	if (await allFilter.isVisible().catch(() => false)) {
		await smoothClickText(page, /^(all|todos|tudo)$/i)
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.pageLoad)
	}

	await capture(page, "journal-all-trades")
	await scrollTo(page, 400)
	await pause(timing.scrollPause)
	await scrollTo(page, 800)
	await pause(timing.scrollPause)
}

const sceneDashboard = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📊 Showing Dashboard...")
	await navigateViaSidebar(page, /painel|dashboard/i, "/")

	// KPI cards
	await pause(timing.sectionView)
	await capture(page, "dashboard-kpis")

	// Calendar + quick stats
	await scrollTo(page, 400)
	await pause(timing.scrollPause)

	// Daily P&L + radar
	await scrollTo(page, 800)
	await pause(timing.scrollPause)

	// Equity curve
	await scrollTo(page, 1200)
	await pause(timing.sectionView)
	await capture(page, "dashboard-equity-curve")

	// Back to top
	await scrollTo(page, 0)
	await pause(timing.scrollPause)
}

const scenePageGuide = async (page: Page) => {
	const { timing } = CONFIG

	log("💡 Starting Page Guide...")

	const guideTrigger = page.getByRole("button", { name: /page guide|guia da página/i })
	const isVisible = await guideTrigger.isVisible({ timeout: 5000 }).catch(() => false)

	if (!isVisible) {
		log("   ⚠️ Guide trigger not found")
		return
	}

	const triggerBox = await guideTrigger.boundingBox()
	if (triggerBox) {
		await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2, { steps: 20 })
		await pause(timing.beforeClick)
		await guideTrigger.click()
	}
	await pause(timing.afterClick)

	// Walk through all guide steps
	let stepCount = 0
	const maxSteps = 20

	while (stepCount < maxSteps) {
		await pause(timing.sectionView)

		const nextBtn = page.locator("button").filter({ hasText: /^(next|próximo)$/i }).first()
		const hasNext = await nextBtn.isVisible().catch(() => false)

		if (!hasNext) break

		const nextBox = await nextBtn.boundingBox()
		if (nextBox) {
			await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await nextBtn.click()
			await pause(timing.afterClick)
		}
		stepCount++
	}

	log(`   Completed ${stepCount + 1} guide steps`)

	// Close the guide overlay
	const closeBtn = page.locator("button").filter({ hasText: /^(close|fechar)$/i }).first()
	if (await closeBtn.isVisible().catch(() => false)) {
		const box = await closeBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await closeBtn.click()
			await pause(timing.afterClick)
		}
	}

	await pause(timing.sectionView)
}

const sceneTradeDetail = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📋 Opening Trade Detail...")

	await navigateViaSidebar(page, /diário|journal/i, "/journal")

	// Click "All" / "Todos" filter to show all trades
	// Click "All" filter
	const periodButtons = page.locator("main button, [data-radix-scroll-area-viewport] button")
	const allBtn = periodButtons.filter({ hasText: /^(all|todos|tudo)$/i }).first()
	if (await allBtn.isVisible().catch(() => false)) {
		const box = await allBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await allBtn.click()
			await pause(timing.afterClick)
		}
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.pageLoad)
	}

	// Find a clickable trade row
	const tradeRows = page.locator("[class*='cursor-pointer']").filter({ hasText: /WIN|WDO|PETR|VALE|WINFUT|WDOFUT/i })
	const rowCount = await tradeRows.count()

	if (rowCount > 1) {
		// Click the second trade row (first is a loss, second is a win)
		const tradeRow = tradeRows.nth(1)
		await scrollLocatorIntoView(page, tradeRow)
		await pause(timing.shortPause)
		const box = await tradeRow.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
			await pause(timing.beforeClick)
			await tradeRow.click()
		}

		// Wait for navigation to trade detail page
		await page.waitForURL("**/journal/**", { timeout: 10000 }).catch(() => {})
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.pageLoad)

		// Only proceed if we actually navigated to a trade detail
		if (page.url().includes("/journal/") && !page.url().endsWith("/journal") && !page.url().includes("/new")) {
			// Start at top — header with asset, direction, P&L
			await scrollTo(page, 0)
			await pause(timing.sectionView)
			await capture(page, "trade-header")

			// Scroll down to show metrics + executions section
			await scrollTo(page, 400)
			await pause(timing.sectionView)
			await capture(page, "trade-metrics")

			// Scroll to risk/reward analysis bar
			await scrollTo(page, 800)
			await pause(timing.sectionView)
			await capture(page, "trade-risk-analysis")

			// Scroll to bottom — excursion + classification + notes
			await scrollTo(page, 1200)
			await pause(timing.sectionView)
			await capture(page, "trade-bottom")

			// Scroll to very bottom in case there's more
			await scrollTo(page, 2000)
			await pause(timing.sectionView)
		} else {
			log("   ⚠️ Did not navigate to a trade detail page")
		}
	} else {
		log("   ⚠️ No trade rows found — account may be empty")
	}
}

const sceneCommandCenter = async (page: Page) => {
	const { timing } = CONFIG

	log("🎯 Command Center...")
	await navigateViaSidebar(
		page,
		/central de comando|command center/i,
		"/command-center"
	)

	await pause(timing.sectionView)

	// Step 1: We're on the "Plano" tab — show monthly plan
	await capture(page, "cc-plan-overview")
	await pause(timing.sectionView)

	// Step 2: Click "Editar Plano"
	const editPlanBtn = page
		.locator("button")
		.filter({ hasText: /editar plano|edit plan/i })
		.first()
	if (await editPlanBtn.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, editPlanBtn)
		await pause(timing.shortPause)
		const box = await editPlanBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
				steps: 15,
			})
			await pause(timing.beforeClick)
			await editPlanBtn.click()
			await pause(timing.afterClick)
		}
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.sectionView)
		await capture(page, "cc-plan-edit")

		// Scroll down to show the risk profile values
		await scrollTo(page, 400)
		await pause(timing.sectionView)

		// Step 3: Click "Salvar Plano"
		const savePlanBtn = page
			.locator("button")
			.filter({ hasText: /salvar plano|save plan/i })
			.first()
		if (await savePlanBtn.isVisible().catch(() => false)) {
			await scrollLocatorIntoView(page, savePlanBtn)
			await pause(timing.shortPause)
			const box = await savePlanBtn.boundingBox()
			if (box) {
				await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
					steps: 15,
				})
				await pause(timing.beforeClick)
				await savePlanBtn.click()
				await pause(timing.afterClick)
			}
			await page.waitForLoadState("domcontentloaded")
			await pause(timing.sectionView)
		}
	}

	// Step 4: Click "Centro de Comando" tab
	const ccTab = page
		.locator("button[role='tab']")
		.filter({ hasText: /centro de comando|command center/i })
		.first()
	if (await ccTab.isVisible().catch(() => false)) {
		const box = await ccTab.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
				steps: 15,
			})
			await pause(timing.beforeClick)
			await ccTab.click()
			await pause(timing.tabSwitch)
		}
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.sectionView)
		await capture(page, "cc-main-today")
	}

	// Step 5: Select WINFUT asset in the calculator
	const calcAsset = page.locator("#calc-asset")
	if (await calcAsset.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, calcAsset)
		await pause(timing.shortPause)
		const box = await calcAsset.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
		}
		// Select WINFUT from the native dropdown
		await page.selectOption("#calc-asset", { label: "WINFUT" })
		await pause(timing.afterClick)
	}

	// Fill stop distance = 200
	const stopField = page.locator("#calc-stop")
	if (await stopField.isVisible().catch(() => false)) {
		const box = await stopField.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
		}
		await stopField.click()
		await pause(200)
		await stopField.fill("200")
		await pause(timing.sectionView)
		await capture(page, "cc-calculator-filled")
	}

	// Step 6: Navigate back 2 days to show historical data with trades
	const prevDayBtn = page
		.locator("button[aria-label*='anterior'], button[aria-label*='previous']")
		.first()
	if (!(await prevDayBtn.isVisible().catch(() => false))) {
		// Try the left arrow button near the date
		const leftArrow = page.locator("#cc-date-navigator button").first()
		if (await leftArrow.isVisible().catch(() => false)) {
			// Click back twice
			const box = await leftArrow.boundingBox()
			if (box) {
				await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
					steps: 15,
				})
				await pause(timing.beforeClick)
				await leftArrow.click()
				await pause(timing.afterClick)
				await page.waitForLoadState("domcontentloaded")
				await pause(timing.sectionView)

				await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
					steps: 10,
				})
				await pause(timing.beforeClick)
				await leftArrow.click()
				await pause(timing.afterClick)
				await page.waitForLoadState("domcontentloaded")
				await pause(timing.sectionView)
			}
		}
	} else {
		// Click back twice
		for (let i = 0; i < 2; i++) {
			const box = await prevDayBtn.boundingBox()
			if (box) {
				await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
					steps: 15,
				})
				await pause(timing.beforeClick)
				await prevDayBtn.click()
				await pause(timing.afterClick)
			}
			await page.waitForLoadState("domcontentloaded")
			await pause(timing.sectionView)
		}
	}

	// Step 7: Focus on "Status ao Vivo" section
	await capture(page, "cc-historical-circuit-breaker")

	await scrollToElement(page, "#cc-live-trading")
	await pause(timing.sectionView)
	await capture(page, "cc-historical-live-status")

	await pause(timing.sectionView)
}

const sceneAnalytics = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📈 Analytics...")
	await navigateViaSidebar(page, /análises|analytics/i, "/analytics")

	await pause(timing.sectionView)
	await capture(page, "analytics-filters")

	await scrollToElement(page, "#analytics-equity-curve")
	await pause(timing.sectionView)
	await capture(page, "analytics-equity-curve")

	await scrollToElement(page, "#analytics-expected-value")
	await pause(timing.sectionView)
	await capture(page, "analytics-expected-value")

	await scrollToElement(page, "#analytics-heatmap")
	await pause(timing.sectionView)
	await capture(page, "analytics-heatmap")

	await scrollToElement(page, "#analytics-hourly")
	await pause(timing.sectionView)
	await capture(page, "analytics-hourly")
}

const sceneMonteCarlo = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("🎲 Monte Carlo...")
	await navigateViaSidebar(page, /monte carlo/i, "/monte-carlo")

	await pause(timing.sectionView)

	// Open data source dropdown and select "Todas as Estratégias"
	const dataSourceSelect = page.locator("button[role='combobox'], [data-radix-select-trigger]").filter({ hasText: /selecione|select/i }).first()
	if (await dataSourceSelect.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, dataSourceSelect)
		await pause(timing.shortPause)
		const box = await dataSourceSelect.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await dataSourceSelect.click()
			await pause(timing.afterClick)
		}

		// Click "Todas as Estratégias" option
		const allStrategiesOption = page.getByText(/todas as estratégias|all strategies/i).first()
		if (await allStrategiesOption.isVisible({ timeout: 3000 }).catch(() => false)) {
			await pause(timing.shortPause)
			await allStrategiesOption.click()
			await pause(timing.afterClick)
			await page.waitForLoadState("domcontentloaded")
			await pause(timing.sectionView)
		}
	}

	// Click "Usar Estas Estatísticas"
	const useStatsBtn = page.locator("button").filter({ hasText: /usar estas|use these/i }).first()
	if (await useStatsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
		await scrollLocatorIntoView(page, useStatsBtn)
		await pause(timing.shortPause)
		const box = await useStatsBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await useStatsBtn.click()
			await pause(timing.afterClick)
		}
		await pause(timing.sectionView)
	}

	// Scroll to see the filled parameters
	await scrollTo(page, 400)
	await pause(timing.sectionView)

	// Click "Calcular Resultados"
	const calcBtn = page.locator("button").filter({ hasText: /calcular|calculate|run/i }).first()
	if (await calcBtn.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, calcBtn)
		await pause(timing.shortPause)
		const box = await calcBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await calcBtn.click()
			await pause(timing.afterClick)
		}
		await pause(timing.pageLoad + 4000)
		await page.waitForLoadState("domcontentloaded")
	}

	// Scroll to key result sections

	// Distribution histogram
	await scrollToElement(page, "#chart-monte-carlo-distribution-histogram")
	await pause(timing.sectionView)
	await capture(page, "mc-distribution")

	// Sequence stats / metrics
	await scrollToElement(page, "#monte-carlo-metrics")
	await pause(timing.sectionView)
	await capture(page, "mc-metrics")

	// Kelly Criterion
	await scrollToElement(page, "#monte-carlo-kelly")
	await pause(timing.sectionView)
	await capture(page, "mc-kelly")
}

const sceneRiskSimulation = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("⚗️  Risk Simulation...")
	await navigateViaSidebar(page, /simulador|risk simul/i, "/risk-simulation")

	await pause(timing.sectionView)

	// Click "Todos" year filter
	const todosBtn = page.locator("button").filter({ hasText: /^todos$/i }).first()
	if (await todosBtn.isVisible().catch(() => false)) {
		const box = await todosBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await todosBtn.click()
			await pause(timing.afterClick)
		}
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.sectionView)
	}

	// Click "Bravo Risk Management" prefill
	const bravoBtn = page.locator("button").filter({ hasText: /bravo risk/i }).first()
	if (await bravoBtn.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, bravoBtn)
		await pause(timing.shortPause)
		const box = await bravoBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await bravoBtn.click()
			await pause(timing.afterClick)
		}
		await page.waitForLoadState("domcontentloaded")
		await pause(timing.sectionView)
	}

	// Fill "Saldo da Conta" with 100000
	const balanceInput = page.locator("input[type='number']").first()
	if (await balanceInput.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, balanceInput)
		await pause(timing.shortPause)
		const box = await balanceInput.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
		}
		await balanceInput.click({ clickCount: 3 }) // Select all
		await pause(200)
		await balanceInput.fill("100000")
		await pause(timing.sectionView)
	}

	// Scroll to show parameters
	await scrollTo(page, 400)
	await pause(timing.sectionView)

	// Click "Executar Simulação"
	const execBtn = page.locator("button").filter({ hasText: /executar|run.*simul/i }).first()
	if (await execBtn.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, execBtn)
		await pause(timing.shortPause)
		const box = await execBtn.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await execBtn.click()
			await pause(timing.afterClick)
		}
		await pause(timing.pageLoad + 4000)
		await page.waitForLoadState("domcontentloaded")
	}

	// Scroll to key result sections

	// Equity curve: Original vs Simulated
	await scrollToElement(page, "#risk-sim-equity-chart")
	await pause(timing.sectionView)
	await capture(page, "risksim-equity-curve")

	// Scroll further to see trade comparison / day trace cards
	await scrollTo(page, 1200)
	await pause(timing.sectionView)
	await capture(page, "risksim-day-trace")

	await scrollTo(page, 1600)
	await pause(timing.sectionView)
}

const sceneReports = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📋 Reports...")
	await navigateViaSidebar(page, /relatórios|reports/i, "/reports")

	await pause(timing.sectionView)

	// Expand weekly report details
	const expandWeekly = page.locator("#reports-weekly button").filter({ hasText: /detail|detalh/i }).first()
	if (await expandWeekly.isVisible().catch(() => false)) {
		await scrollLocatorIntoView(page, expandWeekly)
		await pause(timing.shortPause)
		const box = await expandWeekly.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await expandWeekly.click()
			await pause(timing.afterClick)
		}
	}

	await pause(timing.sectionView)

	// Scroll to monthly report
	await scrollTo(page, 500)
	await pause(timing.scrollPause)

	// Expand monthly report details
	const expandMonthly = page.locator("#reports-monthly button").filter({ hasText: /detail|detalh/i }).first()
	if (await expandMonthly.isVisible().catch(() => false)) {
		const box = await expandMonthly.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await expandMonthly.click()
			await pause(timing.afterClick)
		}
	}

	await pause(timing.sectionView)

	// Scroll to Mistake Cost Analysis
	await scrollToElement(page, "#reports-mistake-cost")
	await pause(timing.sectionView)
	await capture(page, "reports-mistake-cost")

	await scrollTo(page, 1400)
	await pause(timing.sectionView)
}

const sceneMonthly = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📅 Monthly Plan...")
	await navigateViaSidebar(page, /mensal|monthly/i, "/monthly")

	await pause(timing.sectionView)
	await capture(page, "monthly-overview")

	if (await page.locator("#monthly-profit-summary").isVisible().catch(() => false)) {
		await scrollToElement(page, "#monthly-profit-summary")
		await pause(timing.sectionView)
		await capture(page, "monthly-profit-summary")
	}

	if (await page.locator("#monthly-projection").isVisible().catch(() => false)) {
		await scrollToElement(page, "#monthly-projection")
		await pause(timing.scrollPause)
	}

	if (await page.locator("#monthly-comparison").isVisible().catch(() => false)) {
		await scrollToElement(page, "#monthly-comparison")
		await pause(timing.scrollPause)
	}

	if (await page.locator("#monthly-weekly-breakdown").isVisible().catch(() => false)) {
		await scrollToElement(page, "#monthly-weekly-breakdown")
		await pause(timing.sectionView)
	}
}

const scenePlaybook = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("📖 Playbook...")
	await navigateViaSidebar(page, /playbook/i, "/playbook")

	await pause(timing.sectionView)
	await capture(page, "playbook-overview")

	// Get scroll height and scroll smoothly to bottom
	const pbScrollHeight = await page.evaluate(() => {
		let best = 0
		document.querySelectorAll("*").forEach(el => {
			const s = getComputedStyle(el)
			if ((s.overflowY === "auto" || s.overflowY === "scroll" || s.overflowY === "hidden") && el.scrollHeight > el.clientHeight) {
				const diff = el.scrollHeight - el.clientHeight
				if (diff > best) best = el.scrollHeight
			}
		})
		return best || 2000
	})

	const steps = 5
	for (let i = 1; i <= steps; i++) {
		await scrollTo(page, Math.floor((pbScrollHeight * i) / steps))
		await pause(timing.scrollPause)
	}

	await pause(4000)
}

const sceneSettings = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("⚙️  Settings...")
	await navigateViaSidebar(page, /configurações|settings/i, "/settings")

	await pause(timing.sectionView)
	await capture(page, "settings-profile")

	// Switch to Account tab
	const accountTab = page.locator("button[role='tab']").filter({ hasText: /conta|account/i }).first()
	if (await accountTab.isVisible().catch(() => false)) {
		const box = await accountTab.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await accountTab.click()
			await pause(timing.tabSwitch)
		}
	}

	// Show fees
	await scrollTo(page, 400)
	await pause(timing.scrollPause)
	await capture(page, "settings-account-fees")

	await scrollTo(page, 0)
	await pause(timing.shortPause)

	// Switch to Tags tab
	const tagsTab = page.locator("button[role='tab']").filter({ hasText: /^tags$/i }).first()
	if (await tagsTab.isVisible().catch(() => false)) {
		const box = await tagsTab.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await tagsTab.click()
			await pause(timing.tabSwitch)
		}
		await pause(timing.sectionView)
	}

	// Switch to Conditions tab
	const conditionsTab = page.locator("button[role='tab']").filter({ hasText: /condições|conditions/i }).first()
	if (await conditionsTab.isVisible().catch(() => false)) {
		const box = await conditionsTab.boundingBox()
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 })
			await pause(timing.beforeClick)
			await conditionsTab.click()
			await pause(timing.tabSwitch)
		}
		await pause(timing.sectionView)
	}
}

const sceneEnd = async (page: Page) => {
	const { timing } = CONFIG
	const loc = CONFIG.locale

	log("🏁 Final shot — Dashboard...")
	await navigateViaSidebar(page, /painel|dashboard/i, "/")
	await pause(timing.sectionView)
}

const sceneCleanup = async () => {
	console.log("\n🧹 Cleaning up demo account trades...")

	const browser = await chromium.launch({ headless: true })
	const context = await browser.newContext({ viewport: CONFIG.viewport })
	const page = await context.newPage()
	const loc = CONFIG.locale

	try {
		await page.goto(`${CONFIG.baseUrl}/${loc}/login`)
		await page.waitForLoadState("domcontentloaded")
		await page.getByLabel("Email").fill(CONFIG.credentials.email)
		await page.locator("#password").fill(CONFIG.credentials.password)
		await page.getByRole("button", { name: /sign in|entrar/i }).click()

		const result = await Promise.race([
			page.waitForURL("**/", { timeout: 10000 }).then(() => "dashboard" as const),
			page.getByText(/Select Account|Selecionar Conta/i).waitFor({ timeout: 5000 }).then(() => "select-account" as const),
		]).catch(() => "dashboard" as const)

		if (result === "select-account") {
			await page.getByText(CONFIG.accountName, { exact: true }).click()
			await pause(500)
			await page.getByRole("button", { name: /continue|continuar/i }).click()
			await page.waitForURL("**/", { timeout: 15000 })
		}

		await page.waitForLoadState("domcontentloaded")
		await page.goto(`${CONFIG.baseUrl}/${loc}/settings?tab=account`)
		await page.waitForLoadState("domcontentloaded")
		await pause(2000)

		await page.evaluate(() => {
			const s = document.querySelector("[data-radix-scroll-area-viewport]")
			if (s) s.scrollTo({ top: 9999, behavior: "instant" })
		})
		await pause(1000)

		const deleteBtn = page.locator("#account-delete-data-trigger")
		if (await deleteBtn.isVisible().catch(() => false)) {
			await deleteBtn.click()
			await pause(1000)
			await page.locator("#delete-data-confirm-input").fill(CONFIG.accountName)
			await pause(500)
			await page.locator("#account-delete-data-confirm").click()
			await pause(5000)
			log("✅ Trades deleted from demo account")
		} else {
			log("⚠️  Could not find delete button")
		}
	} catch (error) {
		console.error("❌ Cleanup error:", error)
	} finally {
		await page.close()
		await context.close()
		await browser.close()
	}
}

// ── Video Save ──────────────────────────────────────────────────────────────

const saveVideo = (videoDir: string) => {
	const files = fs.readdirSync(videoDir).filter((f) => f.endsWith(".webm"))
	if (files.length === 0) return
	const latestFile = files.sort().pop()!
	const src = path.join(videoDir, latestFile)
	const dest = path.join(videoDir, "profitjournal-demo.webm")
	if (src === dest) {
		console.log(`\n🎬 Video saved to: ${dest}`)
		return
	}
	if (fs.existsSync(dest)) fs.unlinkSync(dest)
	fs.renameSync(src, dest)
	console.log(`\n🎬 Video saved to: ${dest}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE PLAYLIST — Toggle scenes on/off here
// ═══════════════════════════════════════════════════════════════════════════

const SCENES: Array<{
	name: string
	enabled: boolean
	run: (page: Page) => Promise<void>
}> = [
	{ name: "Login", enabled: true, run: sceneLogin },
	{ name: "CSV Import", enabled: true, run: sceneCsvImport },
	{ name: "Journal", enabled: true, run: sceneJournal },
	{ name: "Trade Detail", enabled: true, run: sceneTradeDetail },
	{ name: "Dashboard", enabled: true, run: sceneDashboard },
	{ name: "Page Guide", enabled: true, run: scenePageGuide },
	{ name: "Command Center", enabled: true, run: sceneCommandCenter },
	{ name: "Analytics", enabled: true, run: sceneAnalytics },
	{ name: "Monte Carlo", enabled: true, run: sceneMonteCarlo },
	{ name: "Risk Simulation", enabled: true, run: sceneRiskSimulation },
	{ name: "Reports", enabled: true, run: sceneReports },
	{ name: "Monthly", enabled: true, run: sceneMonthly },
	{ name: "Playbook", enabled: true, run: scenePlaybook },
	{ name: "Settings", enabled: true, run: sceneSettings },
	{ name: "End", enabled: true, run: sceneEnd },
]

const CLEANUP_AFTER = true

// ═══════════════════════════════════════════════════════════════════════════

const run = async () => {
	fs.mkdirSync(CONFIG.videoDir, { recursive: true })

	const enabledScenes = SCENES.filter((s) => s.enabled)
	console.log(`\n🎬 Recording ${enabledScenes.length} scenes: ${enabledScenes.map((s) => s.name).join(" → ")}\n`)

	const browser = await chromium.launch({ headless: false, slowMo: 30 })
	const context = await browser.newContext({
		viewport: CONFIG.viewport,
		recordVideo: { dir: CONFIG.videoDir, size: CONFIG.viewport },
	})
	const page = await context.newPage()
	await injectClickIndicator(page)

	try {
		for (const scene of enabledScenes) {
			currentScene = scene.name.replace(/\s+/g, "-").toLowerCase()
			await scene.run(page)
		}
		log("🎬 Recording complete!")
		await pause(CONFIG.timing.pageLoad)
	} catch (error) {
		console.error("\n❌ Error during recording:", error)
	} finally {
		await page.close()
		await context.close()
		await browser.close()
		saveVideo(CONFIG.videoDir)
	}

	if (CLEANUP_AFTER) {
		await sceneCleanup()
	}

	console.log("\n✅ Done!\n")
}

run()
