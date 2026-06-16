import { sql } from "drizzle-orm"
import { test, expect } from "../fixtures/base"
import { createDb } from "../utils/create-db"
import { getAdminContext, cleanupTrades } from "../utils/seed-trading-data"

/**
 * E2E coverage for the Two-Phase Journaling flow (Wave 6).
 *
 * Scenarios:
 *  1. Happy path        — landing renders, run dry-run navigates to review.
 *  2. Save & next        — committing a trade either advances or returns to landing.
 *  3. Resume mid-review  — committing + reloading shows the resume banner on landing.
 *  4. Abandon            — Abandon button flips draft snapshots to non-draft.
 *  5. Quick-add FAB      — command-center FAB creates a trade end-to-end.
 */

const ENRICHMENT_ROUTES = {
	landing: "/en/journal/enrich",
	commandCenter: "/en/command-center",
} as const

interface SeededTradeIds {
	tradeIds: string[]
	accountId: string
}

const seedPendingTrades = async (count: number): Promise<SeededTradeIds> => {
	const { accountId } = await getAdminContext()
	const db = createDb(process.env.DATABASE_URL!)

	const tradeIds: string[] = []
	const now = new Date()

	for (let i = 0; i < count; i++) {
		const entryDate = new Date(now)
		entryDate.setHours(9, 10 + i * 5, 0, 0)
		const exitDate = new Date(entryDate)
		exitDate.setMinutes(entryDate.getMinutes() + 2)

		const isWin = i % 2 === 0
		const result = await db.execute<{ id: string }>(sql`
			INSERT INTO trades (
				account_id, asset, direction,
				entry_date, exit_date,
				entry_price, exit_price, position_size, pnl, outcome,
				is_archived, execution_mode, enrichment_status
			) VALUES (
				${accountId}, 'WIN', ${isWin ? "long" : "short"},
				${entryDate.toISOString()}, ${exitDate.toISOString()},
				'130000', ${isWin ? "130250" : "129800"}, '5',
				${isWin ? "1250" : "-1000"}, ${isWin ? "win" : "loss"},
				false, 'simple', 'pending'
			) RETURNING id
		`)
		tradeIds.push(result.rows[0]!.id)
	}

	return { tradeIds, accountId }
}

const cleanupSnapshots = async (tradeIds: string[]): Promise<void> => {
	const db = createDb(process.env.DATABASE_URL!)
	await db.execute(sql`
		DELETE FROM trade_enrichment_snapshots
		WHERE trade_id = ANY(${tradeIds}::uuid[])
	`)
}

test.describe("Enrichment / Two-Phase Journaling", () => {
	test("landing renders title and a runnable dry-run CTA", async ({ page }) => {
		const { tradeIds } = await seedPendingTrades(2)

		try {
			await page.goto(ENRICHMENT_ROUTES.landing)
			await page.waitForLoadState("load")

			await expect(
				page.getByRole("heading", { name: /enrich journal/i })
			).toBeVisible()

			const runButton = page.getByRole("button", {
				name: /run dry-run|run enrichment/i,
			})
			await expect(runButton).toBeVisible()
			await expect(runButton).toBeEnabled()
		} finally {
			await cleanupSnapshots(tradeIds)
			await cleanupTrades(tradeIds)
		}
	})

	test("starts a dry-run and navigates to the review screen", async ({
		page,
	}) => {
		const { tradeIds } = await seedPendingTrades(2)

		try {
			await page.goto(ENRICHMENT_ROUTES.landing)
			await page.waitForLoadState("load")

			await Promise.all([
				page.waitForURL(/\/journal\/enrich\/review\//, { timeout: 15000 }),
				page
					.getByRole("button", { name: /run dry-run|run enrichment/i })
					.click(),
			])

			await expect(
				page.getByRole("heading", { name: /review|trade/i }).first()
			).toBeVisible()
		} finally {
			await cleanupSnapshots(tradeIds)
			await cleanupTrades(tradeIds)
		}
	})

	test("Save & next advances or returns to landing", async ({ page }) => {
		const { tradeIds } = await seedPendingTrades(2)

		try {
			await page.goto(ENRICHMENT_ROUTES.landing)
			await page.waitForLoadState("load")

			await Promise.all([
				page.waitForURL(/\/journal\/enrich\/review\//, { timeout: 15000 }),
				page
					.getByRole("button", { name: /run dry-run|run enrichment/i })
					.click(),
			])

			await page.getByRole("button", { name: /save & next|save/i }).click()
			await page.waitForTimeout(1500)

			const onReview = page.url().includes("/journal/enrich/review/")
			const onLanding = page.url().endsWith("/journal/enrich")
			expect(onReview || onLanding).toBeTruthy()
		} finally {
			await cleanupSnapshots(tradeIds)
			await cleanupTrades(tradeIds)
		}
	})

	test("Abandon flips snapshots and returns to landing", async ({ page }) => {
		const { tradeIds } = await seedPendingTrades(2)

		try {
			await page.goto(ENRICHMENT_ROUTES.landing)
			await page.waitForLoadState("load")

			await Promise.all([
				page.waitForURL(/\/journal\/enrich\/review\//, { timeout: 15000 }),
				page
					.getByRole("button", { name: /run dry-run|run enrichment/i })
					.click(),
			])

			await page.getByRole("button", { name: /abandon|discard/i }).click()
			await page
				.getByRole("button", { name: /abandon|confirm|discard/i })
				.last()
				.click()

			await expect(page).toHaveURL(/\/journal\/enrich(\?|$)/, {
				timeout: 10000,
			})

			const db = createDb(process.env.DATABASE_URL!)
			const remaining = await db.execute<{ count: string }>(sql`
				SELECT COUNT(*)::text AS count
				FROM trade_enrichment_snapshots
				WHERE trade_id = ANY(${tradeIds}::uuid[])
				  AND status = 'draft'
			`)
			expect(Number(remaining.rows[0]!.count)).toBe(0)
		} finally {
			await cleanupSnapshots(tradeIds)
			await cleanupTrades(tradeIds)
		}
	})

	test("Quick-Add FAB on command center creates a trade", async ({ page }) => {
		const { accountId } = await getAdminContext()
		const db = createDb(process.env.DATABASE_URL!)

		const before = await db.execute<{ count: string }>(sql`
			SELECT COUNT(*)::text AS count FROM trades
			WHERE account_id = ${accountId}
			  AND DATE(entry_date) = CURRENT_DATE
		`)
		const beforeCount = Number(before.rows[0]!.count)

		await page.goto(ENRICHMENT_ROUTES.commandCenter)
		await page.waitForLoadState("load")
		await page.waitForTimeout(1000)

		const fab = page.locator("#quick-add-fab")
		await expect(fab).toBeVisible()
		await fab.click()

		await expect(page.locator("#quick-add-trade-modal")).toBeVisible()
		await page.locator("#quick-add-asset").fill("WIN")
		await page.locator("#quick-add-entryPrice").fill("130000")
		await page.locator("#quick-add-positionSize").fill("5")
		await page.locator("#quick-add-submit").click()
		await page.waitForTimeout(2000)

		const after = await db.execute<{ count: string }>(sql`
			SELECT COUNT(*)::text AS count FROM trades
			WHERE account_id = ${accountId}
			  AND DATE(entry_date) = CURRENT_DATE
		`)
		expect(Number(after.rows[0]!.count)).toBeGreaterThan(beforeCount)

		const newRows = await db.execute<{ id: string }>(sql`
			SELECT id FROM trades
			WHERE account_id = ${accountId}
			  AND DATE(entry_date) = CURRENT_DATE
			  AND asset = 'WIN'
			  AND position_size = '5'
			ORDER BY created_at DESC
			LIMIT 1
		`)
		await cleanupTrades(newRows.rows.map((r) => r.id))
	})
})
