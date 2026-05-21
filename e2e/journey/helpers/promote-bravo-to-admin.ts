import { sql } from "drizzle-orm"
import { createDb } from "../../utils/create-db"

/**
 * Promote the just-registered Bravo user to admin so the journey suite can
 * exercise admin-gated surfaces (Assets, Timeframes, Risk Profiles, Fee Rates).
 *
 * Bypasses Next.js modules and writes via raw SQL — same driver-agnostic
 * pattern as e2e/utils/create-db.ts. We update BOTH the `is_admin` boolean and
 * the `role` enum because admin-gated UI checks vary across the codebase.
 *
 * Called at the end of Stage 0 (after registration, before saving storageState).
 *
 * @param email - Bravo's email address (matches the registration form)
 */
export const promoteBravoToAdmin = async (email: string): Promise<void> => {
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error(
			"[promoteBravoToAdmin] DATABASE_URL is not set. Ensure .env.local loads before Playwright runs."
		)
	}
	const db = createDb(dbUrl)

	const result = await db.execute(sql`
    UPDATE users
       SET is_admin = true,
           role = 'admin'
     WHERE email = ${email}
    RETURNING id
  `)

	if (!result.rows.length) {
		throw new Error(
			`[promoteBravoToAdmin] No user found with email ${email}. Registration may have failed.`
		)
	}
}
