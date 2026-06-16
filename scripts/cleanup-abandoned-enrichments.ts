/**
 * cleanup-abandoned-enrichments.ts — flip expired draft enrichment snapshots to abandoned.
 *
 * Finds all `trade_enrichment_snapshots` rows where `status = 'draft' AND expires_at < now()`,
 * updates them to `status = 'abandoned'`, and clears the `dry_run_output` payload (sets to empty
 * object since the column is NOT NULL). Rows are kept for version tracking.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-abandoned-enrichments.ts                    # run for real
 *   pnpm tsx scripts/cleanup-abandoned-enrichments.ts --dry-run          # report, don't write
 *
 * The script is idempotent — re-runs are safe.
 */

import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

const main = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}

	const dryRun = process.argv.includes("--dry-run")
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const now = new Date()
	console.log(
		`[${now.toISOString()}] Looking for draft snapshots expired before now...`
	)

	const rows = (await sql`
		SELECT id, status, expires_at
		FROM trade_enrichment_snapshots
		WHERE status = 'draft' AND expires_at IS NOT NULL AND expires_at < now()
		ORDER BY expires_at ASC
	`) as Array<{
		id: string
		status: string
		expires_at: string | null
	}>

	if (rows.length === 0) {
		console.log("No expired draft snapshots found.")
		process.exit(0)
	}

	const expiredIds = rows.map((r) => r.id)
	console.log(`Found ${expiredIds.length} expired draft snapshot(s).`)

	if (dryRun) {
		console.log("\n[DRY RUN] Would update these snapshots:")
		for (const r of rows) {
			console.log(`  ${r.id} (expires_at=${r.expires_at})`)
		}
		console.log(`\n[DRY RUN] Total updates: ${expiredIds.length}`)
		process.exit(0)
	}

	console.log(
		`Updating ${expiredIds.length} snapshot(s) to status='abandoned' and dry_run_output='{}'...`
	)

	const stmt = `
		UPDATE trade_enrichment_snapshots
		SET status = 'abandoned', dry_run_output = '{}'::jsonb
		WHERE id = ANY($1)
	`

	if ("query" in sql) {
		await (sql as ReturnType<typeof neon>).query(stmt, [expiredIds])
	} else {
		await (sql as ReturnType<typeof postgres>).unsafe(stmt, [expiredIds])
	}

	console.log(`Updated ${expiredIds.length} snapshot(s) to abandoned.`)
	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
