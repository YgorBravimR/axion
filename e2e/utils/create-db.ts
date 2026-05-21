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

export const createDb = (url: string): E2eDb =>
	isNeonUrl(url)
		? drizzleNeon(url)
		: (drizzlePg(postgres(url, { prepare: false })) as unknown as E2eDb)
