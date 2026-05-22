import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import type { SQL } from "drizzle-orm"

/**
 * Driver-agnostic Drizzle client for E2E scripts.
 *
 * Mirrors the pattern in src/db/drizzle.ts:
 *   - Neon URLs (*.neon.tech) → neon-http (HTTP API, works in serverless)
 *   - All other URLs           → postgres-js (native wire protocol, works locally)
 *
 * E2E scripts only call db.execute(sql`...`) so a minimal interface suffices.
 */

type E2eDb = { execute(query: SQL): Promise<{ rows: unknown[] }> }

const isNeonUrl = (url: string): boolean => /@[^/]*\.neon\.tech/i.test(url)

// One db instance per URL per process — prevents "too many clients" when
// buildDb() is called multiple times across a single test worker.
const dbCache = new Map<string, E2eDb>()

export const createDb = (url: string): E2eDb => {
	const cached = dbCache.get(url)
	if (cached) return cached

	let db: E2eDb
	if (isNeonUrl(url)) {
		db = drizzleNeon(url)
	} else {
		// postgres-js execute() returns an array-like (rows are direct elements, not .rows).
		// Wrap it to normalise the result shape to { rows: [...] } — matching neon-http's
		// output so callers can always use result.rows without driver-specific branching.
		// max:1 caps the pool to a single wire connection; the seeder is serial so this is safe.
		const pgDb = drizzlePg(postgres(url, { prepare: false, max: 1 }))
		db = {
			execute: async (query: SQL) => {
				const result = await pgDb.execute(query)
				return { rows: Array.from(result as unknown as unknown[]) }
			},
		}
	}

	dbCache.set(url, db)
	return db
}
