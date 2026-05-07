/**
 * Seed playbooks (strategies) and tags onto existing trades for a demo/test account.
 *
 * This script fetches all strategies and tags belonging to a given user,
 * then distributes them realistically across all trades in the target account.
 * Designed to populate chart data for demo presentations.
 *
 * Distribution logic:
 *   - ~85% of trades get a strategy assigned (weighted toward active strategies)
 *   - ~75% of trades get 1-3 tags (mix of setup, mistake, general types)
 *   - Win trades are more likely to get "setup" tags, loss trades get "mistake" tags
 *   - Idempotent: --overwrite flag controls whether existing assignments are replaced
 *
 * Usage:
 *   pnpm tsx scripts/seed-playbooks-tags.ts <accountId> <userId>
 *   pnpm tsx scripts/seed-playbooks-tags.ts <accountId> <userId> --dry-run
 *   pnpm tsx scripts/seed-playbooks-tags.ts <accountId> <userId> --overwrite
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import { eq, and, inArray } from "drizzle-orm"
import * as schema from "../src/db/schema"

// ==========================================
// SETUP
// ==========================================

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

// ==========================================
// HELPERS
// ==========================================

const pickRandom = <T>(arr: T[]): T =>
	arr[Math.floor(Math.random() * arr.length)]

const pickRandomN = <T>(arr: T[], min: number, max: number): T[] => {
	if (arr.length === 0) {
		return []
	}
	const count = Math.floor(Math.random() * (max - min + 1)) + min
	const capped = Math.min(count, arr.length)
	const shuffled = [...arr].sort(() => Math.random() - 0.5)
	return shuffled.slice(0, capped)
}

const rollPercent = (percent: number): boolean => Math.random() * 100 < percent

// ==========================================
// MAIN SCRIPT
// ==========================================

const main = async () => {
	const accountId = process.argv[2]
	const userId = process.argv[3]
	const isDryRun = process.argv.includes("--dry-run")
	const shouldOverwrite = process.argv.includes("--overwrite")

	if (!accountId || !userId) {
		console.error(
			"Usage: pnpm tsx scripts/seed-playbooks-tags.ts <accountId> <userId> [--dry-run] [--overwrite]"
		)
		process.exit(1)
	}

	console.log(`\n🎯 Seeding playbooks & tags`)
	console.log(`   Account: ${accountId}`)
	console.log(`   User:    ${userId}`)
	console.log(`   Mode:    ${isDryRun ? "DRY RUN" : "LIVE"}`)
	console.log(`   Overwrite existing: ${shouldOverwrite}\n`)

	// 1. Verify account belongs to user
	const account = await db.query.tradingAccounts.findFirst({
		where: and(
			eq(schema.tradingAccounts.id, accountId),
			eq(schema.tradingAccounts.userId, userId)
		),
		columns: { id: true, name: true },
	})

	if (!account) {
		console.error(`❌ Account ${accountId} not found for user ${userId}`)
		process.exit(1)
	}

	console.log(`✓ Account found: "${account.name}"`)

	// 2. Fetch strategies (playbooks) for this user
	const strategies = await db.query.strategies.findMany({
		where: and(
			eq(schema.strategies.userId, userId),
			eq(schema.strategies.isActive, true)
		),
		columns: { id: true, name: true, code: true },
	})

	if (strategies.length === 0) {
		console.error(
			"❌ No active strategies found for this user. Create some strategies first."
		)
		process.exit(1)
	}

	console.log(`✓ Found ${strategies.length} active strategies:`)
	for (const strategy of strategies) {
		console.log(`   [${strategy.code}] ${strategy.name}`)
	}

	// 3. Fetch tags for this user
	const tags = await db.query.tags.findMany({
		where: eq(schema.tags.userId, userId),
		columns: { id: true, name: true, type: true },
	})

	if (tags.length === 0) {
		console.warn(
			"⚠️  No tags found for this user — trades will only get strategies assigned."
		)
	} else {
		console.log(`✓ Found ${tags.length} tags:`)
		const setupTags = tags.filter((t) => t.type === "setup")
		const mistakeTags = tags.filter((t) => t.type === "mistake")
		const generalTags = tags.filter((t) => t.type === "general")
		console.log(
			`   Setup: ${setupTags.length} | Mistake: ${mistakeTags.length} | General: ${generalTags.length}`
		)
	}

	// 4. Fetch trades (non-archived)
	const trades = await db.query.trades.findMany({
		where: and(
			eq(schema.trades.accountId, accountId),
			eq(schema.trades.isArchived, false)
		),
		columns: { id: true, outcome: true, strategyId: true, followedPlan: true },
	})

	console.log(`\n✓ Found ${trades.length} trades to process\n`)

	if (trades.length === 0) {
		console.error("❌ No trades found for this account.")
		process.exit(1)
	}

	// 5. Fetch existing trade tags to avoid duplicates
	const tradeIds = trades.map((t) => t.id)
	const existingTradeTags = await db.query.tradeTags.findMany({
		where: inArray(schema.tradeTags.tradeId, tradeIds),
		columns: { tradeId: true, tagId: true },
	})

	const existingTagMap = new Map<string, Set<string>>()
	for (const tt of existingTradeTags) {
		if (!existingTagMap.has(tt.tradeId)) {
			existingTagMap.set(tt.tradeId, new Set())
		}
		existingTagMap.get(tt.tradeId)!.add(tt.tagId)
	}

	// Separate tags by type for smarter distribution
	const setupTags = tags.filter((t) => t.type === "setup")
	const mistakeTags = tags.filter((t) => t.type === "mistake")
	const generalTags = tags.filter((t) => t.type === "general")

	// 6. Process each trade
	let strategyAssignedCount = 0
	let strategySkippedCount = 0
	let tagsAssignedCount = 0
	let tagsSkippedCount = 0
	let disciplineAssignedCount = 0
	let disciplineSkippedCount = 0

	const tradeTagsToInsert: Array<{ tradeId: string; tagId: string }> = []
	const tradeStrategyUpdates: Array<{ id: string; strategyId: string }> = []
	const tradeDisciplineUpdates: Array<{ id: string; followedPlan: boolean }> =
		[]

	for (const trade of trades) {
		const isWin = trade.outcome === "win"
		const isLoss = trade.outcome === "loss"

		// --- Strategy assignment ---
		const hasStrategy = trade.strategyId !== null
		const shouldAssignStrategy = shouldOverwrite ? true : !hasStrategy

		if (shouldAssignStrategy && rollPercent(85)) {
			const strategy = pickRandom(strategies)
			tradeStrategyUpdates.push({ id: trade.id, strategyId: strategy.id })
			strategyAssignedCount++
		} else if (!shouldAssignStrategy && hasStrategy) {
			strategySkippedCount++
		}

		// --- Discipline (followedPlan) assignment ---
		// Realistic distribution: winners follow the plan more often,
		// losses are split (sometimes you follow the plan and still lose — that's normal)
		const hasFollowedPlan = trade.followedPlan !== null
		const shouldAssignDiscipline = shouldOverwrite ? true : !hasFollowedPlan

		if (shouldAssignDiscipline) {
			let followedPlanChance: number
			if (isWin) {
				followedPlanChance = 82 // wins: 82% followed plan
			} else if (isLoss) {
				followedPlanChance = 45 // losses: 45% followed plan (realistic — plans fail too)
			} else {
				followedPlanChance = 65 // breakeven/unknown: neutral
			}
			tradeDisciplineUpdates.push({
				id: trade.id,
				followedPlan: rollPercent(followedPlanChance),
			})
			disciplineAssignedCount++
		} else {
			disciplineSkippedCount++
		}

		// --- Tag assignment ---
		const existingTagsForTrade = existingTagMap.get(trade.id) ?? new Set()
		const hasAnyTags = existingTagsForTrade.size > 0
		const shouldAssignTags = shouldOverwrite ? true : !hasAnyTags

		if (!shouldAssignTags) {
			tagsSkippedCount++
			continue
		}

		if (!rollPercent(75)) {
			continue
		}

		// Build pool of candidates based on trade outcome
		const tagCandidates: Array<{ id: string; name: string; type: string }> = []

		if (isWin && setupTags.length > 0) {
			// Wins: bias toward setup tags (80%) + general (50%)
			tagCandidates.push(...setupTags)
			if (generalTags.length > 0 && rollPercent(50)) {
				tagCandidates.push(...generalTags)
			}
		} else if (isLoss && mistakeTags.length > 0) {
			// Losses: bias toward mistake tags (80%) + general (40%)
			tagCandidates.push(...mistakeTags)
			if (setupTags.length > 0 && rollPercent(20)) {
				tagCandidates.push(pickRandom(setupTags)) // occasionally valid setup on a loss
			}
			if (generalTags.length > 0 && rollPercent(40)) {
				tagCandidates.push(...generalTags)
			}
		} else {
			// No outcome or breakeven: mixed pool
			tagCandidates.push(...tags)
		}

		if (tagCandidates.length === 0) {
			continue
		}

		// Pick 1-3 unique tags
		const uniqueCandidates = [
			...new Map(tagCandidates.map((t) => [t.id, t])).values(),
		]
		const selectedTags = pickRandomN(uniqueCandidates, 1, 3)

		for (const tag of selectedTags) {
			// Skip if already assigned (deduplication)
			if (existingTagsForTrade.has(tag.id)) {
				continue
			}

			tradeTagsToInsert.push({ tradeId: trade.id, tagId: tag.id })
			existingTagsForTrade.add(tag.id) // prevent duplicate within this batch
			tagsAssignedCount++
		}
	}

	// 7. Summary before writing
	console.log(`📋 Plan:`)
	console.log(`   Strategy updates:   ${tradeStrategyUpdates.length} trades`)
	console.log(
		`   Tag insertions:     ${tradeTagsToInsert.length} trade-tag links`
	)
	console.log(`   Discipline updates: ${tradeDisciplineUpdates.length} trades`)
	console.log(`   Strategy skipped (already set):   ${strategySkippedCount}`)
	console.log(`   Tags skipped (already set):       ${tagsSkippedCount}`)
	console.log(`   Discipline skipped (already set): ${disciplineSkippedCount}`)

	if (isDryRun) {
		console.log("\n⚠️  DRY RUN: No changes were written to the database.")
		console.log("Run without --dry-run to apply changes.")

		// Show sample of what would be assigned
		console.log("\n📊 Sample assignments (first 10):")
		for (const update of tradeStrategyUpdates.slice(0, 10)) {
			const strategy = strategies.find((s) => s.id === update.strategyId)
			console.log(
				`   Trade ${update.id.slice(0, 8)}… → Strategy [${strategy?.code}] ${strategy?.name}`
			)
		}
		return
	}

	// 8. Apply strategy updates in batches of 50
	console.log("\n🔄 Applying strategy assignments...")
	const BATCH_SIZE = 50
	let strategyBatchCount = 0

	for (let i = 0; i < tradeStrategyUpdates.length; i += BATCH_SIZE) {
		const batch = tradeStrategyUpdates.slice(i, i + BATCH_SIZE)
		await Promise.all(
			batch.map((update) =>
				db
					.update(schema.trades)
					.set({ strategyId: update.strategyId })
					.where(eq(schema.trades.id, update.id))
			)
		)
		strategyBatchCount += batch.length
		process.stdout.write(
			`\r   ${strategyBatchCount}/${tradeStrategyUpdates.length} strategies assigned`
		)
	}

	if (tradeStrategyUpdates.length > 0) {
		console.log() // newline after progress
	}

	// 9. Apply tag insertions in batches of 100
	console.log("🔄 Applying tag assignments...")
	let tagBatchCount = 0

	for (let i = 0; i < tradeTagsToInsert.length; i += BATCH_SIZE) {
		const batch = tradeTagsToInsert.slice(i, i + BATCH_SIZE)
		await db.insert(schema.tradeTags).values(
			batch.map((item) => ({
				tradeId: item.tradeId,
				tagId: item.tagId,
			}))
		)
		tagBatchCount += batch.length
		process.stdout.write(
			`\r   ${tagBatchCount}/${tradeTagsToInsert.length} tag links inserted`
		)
	}

	if (tradeTagsToInsert.length > 0) {
		console.log() // newline after progress
	}

	// 10. Apply discipline (followedPlan) updates in batches
	console.log("🔄 Applying discipline assignments...")
	let disciplineBatchCount = 0

	for (let i = 0; i < tradeDisciplineUpdates.length; i += BATCH_SIZE) {
		const batch = tradeDisciplineUpdates.slice(i, i + BATCH_SIZE)
		await Promise.all(
			batch.map((update) =>
				db
					.update(schema.trades)
					.set({ followedPlan: update.followedPlan })
					.where(eq(schema.trades.id, update.id))
			)
		)
		disciplineBatchCount += batch.length
		process.stdout.write(
			`\r   ${disciplineBatchCount}/${tradeDisciplineUpdates.length} discipline values set`
		)
	}

	if (tradeDisciplineUpdates.length > 0) {
		console.log()
	}

	// 11. Final summary
	const followedCount = tradeDisciplineUpdates.filter(
		(u) => u.followedPlan
	).length
	const notFollowedCount = tradeDisciplineUpdates.filter(
		(u) => !u.followedPlan
	).length

	console.log(`\n${"=".repeat(60)}`)
	console.log(`Total trades:        ${trades.length}`)
	console.log(`Strategies assigned: ${strategyAssignedCount}`)
	console.log(`Strategies skipped:  ${strategySkippedCount}`)
	console.log(`Tag links created:   ${tagsAssignedCount}`)
	console.log(`Tags skipped:        ${tagsSkippedCount}`)
	console.log(
		`Discipline set:      ${disciplineAssignedCount} (followed: ${followedCount} | not followed: ${notFollowedCount})`
	)
	console.log(`Discipline skipped:  ${disciplineSkippedCount}`)
	console.log(`${"=".repeat(60)}`)
	console.log(
		"\n✅ Done! Charts should now have meaningful playbook, tag & discipline data."
	)
}

main().catch((error) => {
	console.error("❌ Error:", error instanceof Error ? error.message : error)
	process.exit(1)
})
