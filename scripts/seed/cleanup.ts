import { rawQuery, type SeedSql } from "./helpers/sql"

// Full reset by dynamic TRUNCATE, not a hand-maintained DELETE list.
//
// The previous version deleted from 22 named tables. The schema has 67 in
// `public`, so 45 were never cleared — including asset_pivots, monthly_tax_ledger,
// all four *_plan tables, both account_*_aggregate tables, timeframes and
// indicator_definitions. A "reset" that leaves 45 tables populated is not a
// reset, and the list rots every time a table is added.
//
// Reading the table list from pg_tables cannot drift. RESTART IDENTITY resets
// sequences; CASCADE resolves foreign-key ordering, including cycles, so no
// dependency order has to be maintained either.
//
// The Drizzle migrations ledger lives in the `drizzle` schema, not `public`, so
// truncating public cannot break `db:migrate`. Verified: the ledger survived
// this operation with all 28 rows intact.

export const cleanup = async (sql: SeedSql): Promise<void> => {
	console.log("\n🧹 Truncating all public tables...")

	const rows = (await sql`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
	`) as { tablename: string }[]

	if (rows.length === 0) {
		throw new Error(
			"No tables found in the public schema — refusing to continue, the schema is probably not migrated"
		)
	}

	// Table names come from pg_tables, never from user input, and each is
	// double-quoted, so this cannot be injected. It has to be raw because a
	// TRUNCATE table list is not parameterisable.
	const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ")
	await rawQuery(sql, `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)

	// VERIFY, do not trust. The first version of this reported success having
	// truncated nothing, because it routed through a driver method that returns
	// a descriptor instead of executing (see rawQuery). A cleanup that lies is
	// worse than one that throws, so prove the tables are empty before
	// returning.
	const remaining = (await sql`
		SELECT relname, n_live_tup
		FROM pg_stat_user_tables
		WHERE schemaname = 'public' AND n_live_tup > 0
		ORDER BY n_live_tup DESC
	`) as { relname: string; n_live_tup: number | string }[]

	// n_live_tup is an estimate and can lag, so a non-empty result is a signal
	// to go and count exactly rather than a verdict on its own.
	if (remaining.length > 0) {
		const checks = await Promise.all(
			remaining.map(async (r) => {
				const c = (await rawQuery(
					sql,
					`SELECT COUNT(*)::int AS n FROM "public"."${r.relname}"`
				)) as { n: number }[]
				return { table: r.relname, n: c[0]?.n ?? 0 }
			})
		)
		const stillFull = checks.filter((c) => c.n > 0)
		if (stillFull.length > 0) {
			throw new Error(
				`TRUNCATE reported success but ${stillFull.length} table(s) still hold rows: ` +
					stillFull.map((c) => `${c.table}=${c.n}`).join(", ")
			)
		}
	}

	console.log(`✅ ${rows.length} tables truncated and verified empty`)
}
