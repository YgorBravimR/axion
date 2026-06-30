/**
 * Reconcile the Drizzle migrations ledger with reality.
 *
 * Symptom: `pnpm db:migrate` fails with "relation X already exists" on a
 * migration whose tables are clearly already in the DB. Cause: someone ran
 * `pnpm db:push` (which mutates schema without ever writing to
 * `drizzle.__drizzle_migrations`), so Drizzle's bookkeeping table is missing
 * rows for migrations whose DDL is actually in the database.
 *
 * `__drizzle_migrations` schema (Drizzle internal):
 *   id         serial primary key
 *   hash       text     — sha256 of the raw migration SQL file content
 *   created_at bigint   — ms epoch (Drizzle writes the migration's
 *                         `when` value from _journal.json here, NOT `Date.now()`)
 *
 * How Drizzle's migrator decides "is this migration applied?":
 *   pick lastDbMigration = SELECT * FROM __drizzle_migrations ORDER BY
 *   created_at DESC LIMIT 1
 *   for each migration on disk (sorted by folderMillis):
 *     if (!lastDbMigration || lastDbMigration.created_at < migration.folderMillis):
 *       run it
 *
 * The check is purely by `created_at`, not by hash. So the backfill row's
 * `created_at` MUST equal that migration's `when` from _journal.json — if
 * we use `Date.now()` instead, the backfill row gets a created_at greater
 * than every yet-to-apply migration's `when`, and Drizzle silently skips
 * everything after the backfill point.
 *
 * We hash the SQL the same way Drizzle does (sha256 of raw file content)
 * and insert any missing rows for the migrations whose tables are already
 * present. After this runs cleanly, `pnpm db:migrate` will skip the
 * already-applied entries and execute only truly new migrations.
 *
 * Idempotent: re-running is a no-op once the ledger is in sync.
 */

import { config } from "dotenv"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import { isNeonUrl } from "@/db/url"

config({ path: ".env" })

const MIGRATIONS_FOLDER = "./src/db/migrations"
const JOURNAL_PATH = `${MIGRATIONS_FOLDER}/meta/_journal.json`
const SCHEMA = "drizzle"
const LEDGER_TABLE = "__drizzle_migrations"

interface MigrationFile {
	readonly tag: string
	readonly path: string
	readonly hash: string
	// `when` value from meta/_journal.json. Critical: Drizzle's migrator
	// decides "is this migration applied?" by comparing the ledger's
	// max(created_at) to each migration's `when`. If we backfill with
	// `Date.now()` instead, every TRULY-new migration after the backfill
	// row gets silently skipped because Date.now() > their `when`. Use
	// the original journal timestamp so the next db:migrate run sees
	// gaps correctly.
	readonly folderMillis: number
}

// Match Drizzle's hashing: sha256 of the full SQL file content, hex-encoded.
// (See drizzle-orm/migrator's `readMigrationFiles` — it hashes the unparsed
// SQL exactly as we read it from disk.)
const hashSql = (sql: string): string =>
	createHash("sha256").update(sql).digest("hex")

interface JournalEntry {
	readonly tag: string
	readonly when: number
}

const loadMigrations = (): MigrationFile[] => {
	const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
		entries: JournalEntry[]
	}
	const byTag = new Map<string, number>(
		journal.entries.map((e) => [e.tag, e.when])
	)
	const files = readdirSync(MIGRATIONS_FOLDER)
		.filter((f) => f.endsWith(".sql"))
		.sort()
	return files.map((file) => {
		const path = join(MIGRATIONS_FOLDER, file)
		const sqlText = readFileSync(path, "utf8")
		const tag = file.replace(/\.sql$/, "")
		const folderMillis = byTag.get(tag)
		if (folderMillis === undefined) {
			throw new Error(
				`Migration ${tag} is on disk but missing from _journal.json — run pnpm db:generate to repair.`
			)
		}
		return {
			tag,
			path,
			hash: hashSql(sqlText),
			folderMillis,
		}
	})
}

// Run a SQL query and return the resulting rows. We use the raw driver here
// because we're poking at Drizzle's internal bookkeeping table — going through
// the schema-aware client would require modeling the ledger in schema.ts.
//
// Driver shapes differ:
//   - drizzle-neon-http  `db.execute()` returns `{ rows: [...], rowCount }`.
//   - postgres-js        `client.unsafe()` returns an array of rows directly.
// Normalize to `unknown[]` (array of row objects) for the caller.
const exec = async (
	url: string,
	statements: ReadonlyArray<{ sql: string; params?: unknown[] }>
): Promise<unknown[][]> => {
	if (isNeonUrl(url)) {
		const db = drizzleNeon(url)
		const results: unknown[][] = []
		for (const s of statements) {
			const r = (await db.execute(sql.raw(s.sql))) as {
				rows?: unknown[]
			}
			results.push(Array.isArray(r) ? r : (r.rows ?? []))
		}
		return results
	}
	const client = postgres(url, { max: 1 })
	try {
		const results: unknown[][] = []
		for (const s of statements) {
			const r = await client.unsafe(s.sql)
			results.push(r as unknown as unknown[])
		}
		return results
	} finally {
		await client.end()
	}
}

// We probe whether each migration's headline tables exist. If they do, we
// assume the migration was applied (via push) and the ledger just needs to
// be patched. We don't try to verify column-by-column — if `db:push` got the
// table shape wrong, that's a separate problem the user has to resolve by
// hand.
const tableExistsQuery = (table: string): string =>
	`SELECT to_regclass('public."${table}"') IS NOT NULL AS exists`

// Headline table from each migration whose DDL is order-sensitive. If the
// migration starts with `CREATE TABLE "foo"`, that's the headline. Drizzle
// writes one migration per `db:generate` call, so each migration block has
// at least one CREATE TABLE we can probe.
const extractHeadlineTable = (sqlText: string): string | null => {
	const m = sqlText.match(/CREATE TABLE\s+"([^"]+)"/i)
	return m?.[1] ?? null
}

const run = async () => {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}

	const migrations = loadMigrations()
	console.log(`Found ${migrations.length} migration files on disk.`)

	// Ensure the ledger schema + table exists (Drizzle creates these lazily
	// on first migrate; reconciling against an empty DB shouldn't crash).
	await exec(url, [
		{ sql: `CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"` },
		{
			sql: `CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${LEDGER_TABLE}" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)`,
		},
	])

	// Read existing ledger hashes once.
	const [ledgerRows] = await exec(url, [
		{ sql: `SELECT hash FROM "${SCHEMA}"."${LEDGER_TABLE}"` },
	])
	const knownHashes = new Set<string>(
		(ledgerRows as Array<{ hash: string }>).map((r) => r.hash)
	)
	console.log(`Ledger has ${knownHashes.size} applied entries.`)

	let backfilled = 0
	let skipped = 0
	let truly_new = 0

	for (const m of migrations) {
		if (knownHashes.has(m.hash)) {
			skipped += 1
			continue
		}

		// Ledger doesn't know this migration. Either:
		//   (a) it was applied via `db:push` (DDL is in DB, no ledger row)
		//   (b) it's genuinely new and `pnpm db:migrate` should run it
		// Probe the headline table to decide.
		const sqlText = readFileSync(m.path, "utf8")
		const headline = extractHeadlineTable(sqlText)
		if (!headline) {
			// No CREATE TABLE — could be an ALTER-only migration. Bail and
			// let `pnpm db:migrate` handle it; it'll either succeed or
			// surface a real conflict we can address.
			console.log(`  • ${m.tag}: no headline table found — leave to db:migrate`)
			truly_new += 1
			continue
		}

		const [probeRows] = await exec(url, [{ sql: tableExistsQuery(headline) }])
		const exists = (probeRows as Array<{ exists: boolean }>)[0]?.exists === true

		if (!exists) {
			console.log(
				`  • ${m.tag}: headline table "${headline}" missing → db:migrate will apply`
			)
			truly_new += 1
			continue
		}

		// Table is in the DB but not in the ledger → backfill. Use the
		// migration's `folderMillis` as `created_at` (NOT Date.now()) so the
		// next db:migrate run sees the ledger as if Drizzle had applied this
		// migration itself. Using Date.now() would put the backfill row
		// AHEAD of every yet-to-apply migration's `folderMillis`, and
		// Drizzle's migrator would silently skip all of them.
		await exec(url, [
			{
				sql: `INSERT INTO "${SCHEMA}"."${LEDGER_TABLE}" (hash, created_at)
				      VALUES ('${m.hash}', ${m.folderMillis})`,
			},
		])
		backfilled += 1
		console.log(
			`  ✓ ${m.tag}: backfilled (headline "${headline}" already exists)`
		)
	}

	console.log(
		`\nReconciliation complete: ${backfilled} backfilled, ${skipped} already applied, ${truly_new} pending for db:migrate.`
	)
	if (truly_new > 0) {
		console.log("Now run: pnpm db:migrate")
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
