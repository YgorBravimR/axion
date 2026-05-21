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

export const createDb = (url: string): E2eDb => {
	if (isNeonUrl(url)) {
		return drizzleNeon(url)
	}
	// postgres-js execute() returns an array-like (rows are direct elements, not .rows).
	// Wrap it to normalise the result shape to { rows: [...] } — matching neon-http's
	// output so callers can always use result.rows without driver-specific branching.
	const pgDb = drizzlePg(postgres(url, { prepare: false }))
	return {
		execute: async (query: SQL) => {
			const result = await pgDb.execute(query)
			return { rows: Array.from(result as unknown as unknown[]) }
		},
	}
}
