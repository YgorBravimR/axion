import { drizzle } from "drizzle-orm/neon-http"
import { sql } from "drizzle-orm"

/**
 * Pre-run guard: idempotently removes bravo@axion-demo.com and all associated
 * data so Stage 0 can always register a clean account.
 *
 * Called from a beforeAll in 00-welcome.spec.ts — runs inside a Playwright
 * test-worker process where DATABASE_URL is fully resolved (unlike globalSetup,
 * which runs in the CLI launcher process and may see unresolved dotenvx values).
 *
 * Deletes in reverse-dependency order to avoid FK violations, then falls
 * through to the user delete which cascades any remaining child rows.
 */
export const cleanupBravo = async (email: string): Promise<void> => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		console.warn(
			"[cleanupBravo] DATABASE_URL not set — skipping pre-run cleanup."
		)
		return
	}

	const db = drizzle(dbUrl)

	// 1. Remove rate-limit slots so the login step never trips the limiter.
	await db
		.execute(
			sql`
		DELETE FROM rate_limit_attempts
		WHERE identifier = ${"login:" + email}
		   OR identifier LIKE ${"login:bravo-%@axion-demo.com"}
	`
		)
		.catch((e: unknown) =>
			console.warn("[cleanupBravo] rate_limit_attempts:", e)
		)

	// 2. Delete the user — trading_accounts, plans, trades, sessions, etc.
	//    cascade via onDelete: "cascade" FKs defined in schema.ts.
	const result = await db
		.execute(
			sql`
		DELETE FROM users
		WHERE email = ${email}
		   OR email LIKE 'bravo-%@axion-demo.com'
		RETURNING id
	`
		)
		.catch((e: unknown) => {
			console.warn("[cleanupBravo] users:", e)
			return { rows: [] as unknown[] }
		})

	if (result.rows.length > 0) {
		console.log(
			`[cleanupBravo] Removed ${result.rows.length} prior bravo user(s) — clean slate for Stage 0.`
		)
	}
}
