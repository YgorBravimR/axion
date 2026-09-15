import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import postgres, { type Sql } from "postgres"
import { isNeonUrl } from "@/db/url"

// Both drivers expose the same tagged-template `sql\`…\`` API used throughout
// the seed. We pick the driver by URL: Neon HTTPS for prod/staging, postgres-js
// for local Docker / per-worktree dbs / any wire-protocol Postgres.
export type SeedSql =
	NeonQueryFunction<false, false> | Sql<Record<string, unknown>>

export const createSeedSql = (databaseUrl: string): SeedSql => {
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)
	SEED_SQL_IS_NEON.set(sql, isNeonUrl(databaseUrl))
	return sql
}

// Which driver produced a given sql handle. Needed because the two drivers
// execute raw (non-parameterisable) statements through DIFFERENT methods, and
// picking the wrong one fails SILENTLY. See rawQuery below.
const SEED_SQL_IS_NEON = new WeakMap<object, boolean>()

/**
 * Runs a raw SQL string that cannot be parameterised (TRUNCATE table lists,
 * DDL). Use the tagged template for everything else.
 *
 * ⚠️ WHY THIS EXISTS. The two drivers disagree, and the disagreement is a trap:
 *
 *   postgres-js  sql.unsafe(text)  EXECUTES and resolves to rows.
 *   neon-http    sql.unsafe(text)  DOES NOT EXECUTE. It returns a descriptor
 *                                  object, `{ sql: "..." }`, intended to be
 *                                  handed to sql.transaction([...]). Awaiting
 *                                  it resolves to that descriptor, so the call
 *                                  looks like it succeeded and nothing ran.
 *   neon-http    sql.query(text)   EXECUTES and resolves to rows.
 *
 * Neon exposes BOTH .unsafe and .query, so any code that feature-detects
 * `.unsafe` first silently no-ops against Neon. That is exactly what happened
 * to the reset on 2026-09-01: cleanup logged "67 tables truncated" and had
 * truncated nothing, and only the next INSERT's unique-violation revealed it.
 *
 * Never feature-detect these methods. Route through the URL, which is the same
 * thing createSeedSql uses to pick the driver in the first place.
 */
export const rawQuery = async (
	sql: SeedSql,
	statement: string
): Promise<unknown> => {
	const isNeon = SEED_SQL_IS_NEON.get(sql as unknown as object)
	if (isNeon === undefined) {
		throw new Error(
			"rawQuery received an sql handle that did not come from createSeedSql, so the driver is unknown"
		)
	}
	const runner = sql as unknown as {
		query: (_q: string) => Promise<unknown>
		unsafe: (_q: string) => Promise<unknown>
	}
	return isNeon ? runner.query(statement) : runner.unsafe(statement)
}

// postgres-js holds a persistent connection; without an explicit close the node
// process won't exit. neon() is stateless HTTPS so it doesn't need this.
export const closeSeedSql = async (sql: SeedSql): Promise<void> => {
	const maybeEnd = (sql as { end?: () => Promise<void> }).end
	if (typeof maybeEnd === "function") {
		await maybeEnd.call(sql)
	}
}
