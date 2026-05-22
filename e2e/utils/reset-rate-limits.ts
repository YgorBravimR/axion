/**
 * Rate-limit and account-lockout reset utility for E2E security tests.
 *
 * Auth security tests deliberately trigger rate limits and lockout thresholds.
 * Without resetting the DB state between test runs the suite becomes flaky after
 * the first execution.  This module runs directly against the database using the
 * same raw-SQL pattern as `seed-trading-data.ts` so it never imports Next.js
 * modules that are unavailable in a plain Node context.
 *
 * Call `resetRateLimitsForEmail` in a `test.beforeEach` / `test.afterEach` hook
 * within any describe block that submits failed login attempts.
 */

import { sql } from "drizzle-orm"
import { createDb } from "./create-db"
import dotenv from "dotenv"

dotenv.config()

/** Keys used by the application's rate limiter and lockout system */
const buildRateLimitKeys = (email: string): string[] => {
	const lower = email.toLowerCase()
	return [`login:${lower}`, `login-fail:${lower}`]
}

/**
 * Deletes all rate_limit_attempts rows for the given email so that
 * the next test run starts with a clean counter.
 *
 * @param email - The email address whose rate-limit rows should be cleared
 */
const resetRateLimitsForEmail = async (email: string): Promise<void> => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		console.warn("[E2E RateLimit Reset] DATABASE_URL not set, skipping reset.")
		return
	}

	const db = createDb(dbUrl)
	const keys = buildRateLimitKeys(email)

	for (const key of keys) {
		await db
			.execute(sql`DELETE FROM rate_limit_attempts WHERE identifier = ${key}`)
			.catch((err: unknown) => {
				const message = err instanceof Error ? err.message : String(err)
				console.warn(
					`[E2E RateLimit Reset] Failed to clear key "${key}": ${message}`
				)
			})
	}
}

/**
 * Deletes all rate_limit_attempts rows for every key matching the given prefix.
 * Useful for clearing the email-verification limiters which use a different prefix.
 *
 * @param prefix - The key prefix to match (e.g. "email-verify:")
 */
const resetRateLimitsByPrefix = async (prefix: string): Promise<void> => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		console.warn("[E2E RateLimit Reset] DATABASE_URL not set, skipping reset.")
		return
	}

	const db = createDb(dbUrl)
	const pattern = `${prefix}%`

	await db
		.execute(
			sql`DELETE FROM rate_limit_attempts WHERE identifier LIKE ${pattern}`
		)
		.catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err)
			console.warn(
				`[E2E RateLimit Reset] Failed to clear prefix "${prefix}": ${message}`
			)
		})
}

export { resetRateLimitsForEmail, resetRateLimitsByPrefix }
