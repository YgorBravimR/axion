import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import postgres, { type Sql } from "postgres"
import { isNeonUrl } from "@/db/url"

// Both drivers expose the same tagged-template `sql\`…\`` API used throughout
// the seed. We pick the driver by URL: Neon HTTPS for prod/staging, postgres-js
// for local Docker / per-worktree dbs / any wire-protocol Postgres.
export type SeedSql =
	| NeonQueryFunction<false, false>
	| Sql<Record<string, unknown>>

export const createSeedSql = (databaseUrl: string): SeedSql =>
	isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

// postgres-js holds a persistent connection; without an explicit close the node
// process won't exit. neon() is stateless HTTPS so it doesn't need this.
export const closeSeedSql = async (sql: SeedSql): Promise<void> => {
	const maybeEnd = (sql as { end?: () => Promise<void> }).end
	if (typeof maybeEnd === "function") {
		await maybeEnd.call(sql)
	}
}
