"use server"

import { cache } from "react"
import {
	invalidateAllData,
	invalidateSettingsData,
} from "@/lib/cache/invalidate"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { users, tradingAccounts, type TradingAccount } from "@/db/schema"
import { createDbRateLimiter } from "@/lib/db-rate-limiter"
import { firstIssueMessage } from "@/lib/zod-helpers"
import { seedUserData } from "@/db/seed-user-data"

import type { SafeUser, AccountPickerItem, AuthContext } from "./auth.types"
import { auth, signIn, signOut } from "@/auth"
import {
	registerSchema,
	loginSchema,
	changePasswordSchema,
	updateProfileSchema,
	type RegisterInput,
	type LoginInput,
	type ChangePasswordInput,
	type UpdateProfileInput,
} from "@/lib/validations/auth"

const SALT_ROUNDS = 12

// 5 login attempts per 15 minutes, keyed by email (DB-backed, survives cold starts)
const loginLimiter = createDbRateLimiter({
	maxAttempts: 5,
	windowMs: 15 * 60 * 1000,
})

// ==========================================
// REGISTRATION
// ==========================================

export const registerUser = async (
	input: RegisterInput
): Promise<{
	status: "success" | "error"
	error?: string
	needsVerification?: boolean
}> => {
	const t = await getTranslations("auth")
	try {
		const validated = registerSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: firstIssueMessage(validated.error) }
		}

		const { name, email, password } = validated.data

		// Check if email already exists
		const existingUser = await db.query.users.findFirst({
			where: eq(users.email, email.toLowerCase()),
		})

		if (existingUser) {
			return { status: "error", error: t("errors.emailExists") }
		}

		const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

		// neon-http driver doesn't support transactions; if the account insert
		// fails, the orphaned user is caught by the unique email constraint on
		// re-registration.
		const [newUser] = await db
			.insert(users)
			.values({
				name,
				email: email.toLowerCase(),
				passwordHash,
			})
			.returning()
		if (!newUser) {
			throw new Error("Failed to create user")
		}

		await db.insert(tradingAccounts).values({
			userId: newUser.id,
			name: t("defaultAccountName"),
			isDefault: true,
			accountType: "personal",
		})

		// Seed starter strategies and tags (best-effort, does not block registration)
		seedUserData(newUser.id).catch((err) =>
			console.error("Seed data failed for user", newUser.id, err)
		)

		// Auto-verify user — email verification disabled for now
		await db
			.update(users)
			.set({ emailVerified: new Date(), updatedAt: new Date() })
			.where(eq(users.id, newUser.id))

		return { status: "success", needsVerification: false }
	} catch (error) {
		console.error("Registration error:", error)
		return { status: "error", error: t("errors.registrationFailed") }
	}
}

// ==========================================
// LOGIN / LOGOUT
// ==========================================

// ==========================================
// ACCOUNT LOCKOUT (exponential backoff via DB rate limiter)
// ==========================================

const LOCKOUT_KEY_PREFIX = "login-fail:"

const LOCKOUT_TIERS = [
	{ failures: 20, lockoutMs: 24 * 60 * 60 * 1000 }, // 20 fails → 24h
	{ failures: 10, lockoutMs: 60 * 60 * 1000 }, // 10 fails → 1h
	{ failures: 5, lockoutMs: 15 * 60 * 1000 }, // 5 fails  → 15min
] as const

const checkAccountLockout = async (
	email: string
): Promise<{ locked: boolean; retryAfterMs: number }> => {
	const key = `${LOCKOUT_KEY_PREFIX}${email.toLowerCase()}`
	const failCount = await loginLimiter.countAttempts(key, 24 * 60 * 60 * 1000) // 24h window

	for (const tier of LOCKOUT_TIERS) {
		if (failCount >= tier.failures) {
			// Check if the lockout period has passed since the last failure
			// eslint-disable-next-line no-await-in-loop -- lockout tiers must be checked sequentially; each tier breaks early on match
			const lastFailure = await loginLimiter.getLatest(key)
			if (!lastFailure) {
				break
			}

			const lockoutEndsAt = lastFailure.getTime() + tier.lockoutMs
			const now = Date.now()

			if (now < lockoutEndsAt) {
				return { locked: true, retryAfterMs: lockoutEndsAt - now }
			}
			// Lockout period passed — allow attempt
			break
		}
	}

	return { locked: false, retryAfterMs: 0 }
}

const recordLoginFailure = async (email: string): Promise<void> => {
	await loginLimiter.record(`${LOCKOUT_KEY_PREFIX}${email.toLowerCase()}`)
}

const clearLoginFailures = async (email: string): Promise<void> => {
	await loginLimiter.reset(`${LOCKOUT_KEY_PREFIX}${email.toLowerCase()}`)
}

export const loginUser = async (
	input: LoginInput
): Promise<{
	status: "success" | "error"
	error?: string
	needsAccountSelection?: boolean
	accounts?: AccountPickerItem[]
}> => {
	const t = await getTranslations("auth")
	try {
		const validated = loginSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: firstIssueMessage(validated.error) }
		}

		const { email, password, accountId } = validated.data
		const lowerEmail = email.toLowerCase()

		// Rate limit by email address
		const rateLimitResult = await loginLimiter.check(`login:${lowerEmail}`)
		if (!rateLimitResult.allowed) {
			const retryMinutes = Math.ceil(rateLimitResult.retryAfterMs / 60_000)
			return {
				status: "error",
				error: t("errors.rateLimited", { minutes: retryMinutes }),
			}
		}

		// Check account lockout (exponential backoff)
		const lockout = await checkAccountLockout(lowerEmail)
		if (lockout.locked) {
			const retryMinutes = Math.ceil(lockout.retryAfterMs / 60_000)
			return {
				status: "error",
				error: t("errors.accountLocked", { minutes: retryMinutes }),
			}
		}

		// Find user
		const user = await db.query.users.findFirst({
			where: eq(users.email, lowerEmail),
		})

		if (!user) {
			return { status: "error", error: t("errors.invalidCredentials") }
		}

		// Verify password
		const isValid = await bcrypt.compare(password, user.passwordHash)
		if (!isValid) {
			await recordLoginFailure(lowerEmail)
			return { status: "error", error: t("errors.invalidCredentials") }
		}

		// Email verification check disabled — users register directly
		// if (!user.emailVerified) {
		// 	return { status: "error", error: "EMAIL_NOT_VERIFIED" }
		// }

		// Clear lockout history on successful login
		await clearLoginFailures(lowerEmail)

		// Get user's accounts
		const userAccounts = await db.query.tradingAccounts.findMany({
			where: eq(tradingAccounts.userId, user.id),
			orderBy: (accounts, { desc }) => [desc(accounts.isDefault)],
		})

		// If no accountId provided and user has multiple accounts, return for selection
		// Only expose fields needed for the account picker UI
		if (!accountId && userAccounts.length > 1) {
			const safeAccounts = userAccounts.map(
				({ id, name, accountType, isDefault }) => ({
					id,
					name,
					accountType,
					isDefault,
				})
			)
			return {
				status: "success",
				needsAccountSelection: true,
				accounts: safeAccounts,
			}
		}

		// Sign in with NextAuth
		await signIn("credentials", {
			email,
			password,
			accountId: accountId || userAccounts[0]?.id,
			redirect: false,
		})

		return { status: "success" }
	} catch (error) {
		console.error("Login error:", error)
		return { status: "error", error: t("errors.loginFailed") }
	}
}

export const logoutUser = async (): Promise<void> => {
	await signOut({ redirect: false })
	redirect("/login")
}

// ==========================================
// SESSION HELPERS
// ==========================================

/**
 * Cached helper for loading current user from session.
 * Deduplicates user row fetches within a single request.
 */
const getCachedCurrentUser = cache(async (): Promise<SafeUser | null> => {
	const session = await auth()
	if (!session) {
		return null
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, session.user.id),
		columns: {
			id: true,
			name: true,
			email: true,
			emailVerified: true,
			image: true,
			isAdmin: true,
			role: true,
			preferredLocale: true,
			theme: true,
			dateFormat: true,
			createdAt: true,
			updatedAt: true,
		},
	})

	if (!user) {
		// User was deleted while session is still active — delegate to route handler
		// (can't call signOut() during rendering — cookies are read-only outside Server Actions)
		redirect("/api/auth/force-signout")
	}

	return user
})

export const getCurrentUser = async (): Promise<SafeUser | null> => {
	return getCachedCurrentUser()
}

export const getCurrentAccount = async (): Promise<TradingAccount | null> => {
	const session = await auth()
	if (!session || !session.user.accountId) {
		return null
	}

	const account = await db.query.tradingAccounts.findFirst({
		where: and(
			eq(tradingAccounts.id, session.user.accountId),
			eq(tradingAccounts.userId, session.user.id)
		),
	})

	if (!account) {
		// Account was deleted — delegate to route handler to clear session
		// (can't call signOut() during rendering — cookies are read-only outside Server Actions)
		redirect("/api/auth/force-signout")
	}

	return account
}

export const getUserAccounts = async (): Promise<TradingAccount[]> => {
	const session = await auth()
	if (!session) {
		return []
	}

	const accounts = await db.query.tradingAccounts.findMany({
		where: eq(tradingAccounts.userId, session.user.id),
		orderBy: (accounts, { desc }) => [desc(accounts.isDefault)],
	})

	return accounts
}

/**
 * Cached auth context provider - deduplicates auth checks within a single request.
 * When multiple server actions call requireAuth() in parallel (e.g., dashboard fetching 6 data sources),
 * this ensures auth is only checked once per request and queries are parallelized.
 *
 * @see React.cache() docs: https://react.dev/reference/react/cache
 */
export const requireAuth = cache(async (): Promise<AuthContext> => {
	const session = await auth()
	if (!session) {
		redirect("/login")
	}
	if (!session.user.accountId) {
		// No account selected - redirect to login to re-authenticate
		redirect("/login")
	}

	const userId = session.user.id
	const accountId = session.user.accountId

	// Import userSettings schema once for reuse
	const { userSettings } = await import("@/db/schema")

	// Parallelize independent DB queries: user check, account check, settings, accounts-list
	const [dbUser, currentAccount, settings, allAccounts] = await Promise.all([
		db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { id: true },
		}),
		db.query.tradingAccounts.findFirst({
			where: and(
				eq(tradingAccounts.id, accountId),
				eq(tradingAccounts.userId, userId)
			),
			columns: { id: true },
		}),
		db.query.userSettings.findFirst({
			where: eq(userSettings.userId, userId),
		}),
		db.query.tradingAccounts.findMany({
			where: eq(tradingAccounts.userId, userId),
			columns: { id: true },
		}),
	])

	// User was deleted — delegate to route handler to clear session and redirect
	if (!dbUser) {
		redirect("/api/auth/force-signout")
	}

	// Account was deleted — delegate to route handler to clear session.
	// On re-login, the authorize flow auto-selects the default account.
	if (!currentAccount) {
		redirect("/api/auth/force-signout")
	}

	// Build allAccountIds: use all accounts if showAllAccounts is enabled, else just current
	const allAccountIds = settings?.showAllAccounts
		? allAccounts.map((a) => a.id)
		: [accountId]

	return {
		userId,
		accountId,
		showAllAccounts: settings?.showAllAccounts ?? false,
		allAccountIds,
	}
})

// ==========================================
// ACCOUNT SWITCHING
// ==========================================

export const switchAccount = async (
	accountId: string
): Promise<{ status: "success" | "error"; error?: string }> => {
	const t = await getTranslations("auth")
	const tSettings = await getTranslations("settings")
	try {
		const session = await auth()
		if (!session) {
			return { status: "error", error: t("errors.notAuthenticated") }
		}

		// Verify account belongs to user
		const account = await db.query.tradingAccounts.findFirst({
			where: and(
				eq(tradingAccounts.id, accountId),
				eq(tradingAccounts.userId, session.user.id)
			),
		})

		if (!account) {
			return { status: "error", error: tSettings("errors.accountNotFound") }
		}

		// Note: The actual session update happens via the update trigger in the JWT callback
		// This requires the client to call update() on the session
		invalidateAllData(session.user.id)

		return { status: "success" }
	} catch (error) {
		console.error("Switch account error:", error)
		return { status: "error", error: t("errors.loginFailed") }
	}
}

/**
 * Revalidate all app paths after account switch
 * This ensures all cached data is refreshed with the new account's data
 */
export const revalidateAfterAccountSwitch = async (): Promise<void> => {
	const session = await auth()
	invalidateAllData(session ? session.user.id : "")
}

// ==========================================
// PROFILE MANAGEMENT
// ==========================================

export const updateUserProfile = async (
	input: UpdateProfileInput
): Promise<{ status: "success" | "error"; error?: string }> => {
	const t = await getTranslations("auth")
	try {
		const session = await auth()
		if (!session) {
			return { status: "error", error: t("errors.notAuthenticated") }
		}

		const validated = updateProfileSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: firstIssueMessage(validated.error) }
		}

		const updateData = { ...validated.data } as Record<string, unknown>

		await db
			.update(users)
			.set({
				...updateData,
				updatedAt: new Date(),
			})
			.where(eq(users.id, session.user.id))

		invalidateSettingsData(session.user.id)

		return { status: "success" }
	} catch (error) {
		console.error("Update profile error:", error)
		return { status: "error", error: t("errors.loginFailed") }
	}
}

export const changePassword = async (
	input: ChangePasswordInput
): Promise<{ status: "success" | "error"; error?: string }> => {
	const t = await getTranslations("auth")
	try {
		const session = await auth()
		if (!session) {
			return { status: "error", error: t("errors.notAuthenticated") }
		}

		const validated = changePasswordSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: firstIssueMessage(validated.error) }
		}

		// Get current user
		const user = await db.query.users.findFirst({
			where: eq(users.id, session.user.id),
		})

		if (!user) {
			return { status: "error", error: t("errors.userNotFound") }
		}

		// Verify current password
		const isValid = await bcrypt.compare(
			validated.data.currentPassword,
			user.passwordHash
		)
		if (!isValid) {
			return { status: "error", error: t("errors.incorrectPassword") }
		}

		// Hash new password
		const newPasswordHash = await bcrypt.hash(
			validated.data.newPassword,
			SALT_ROUNDS
		)

		// Update password
		await db
			.update(users)
			.set({
				passwordHash: newPasswordHash,
				updatedAt: new Date(),
			})
			.where(eq(users.id, session.user.id))

		return { status: "success" }
	} catch (error) {
		console.error("Change password error:", error)
		return { status: "error", error: t("errors.loginFailed") }
	}
}

// ==========================================
// ACCOUNT CURRENCY
// ==========================================

/**
 * Get the active account's currency from the session
 * Cached at request level to avoid duplicate DB queries
 */
export const getAccountCurrency = cache(async (): Promise<string> => {
	try {
		const session = await auth()
		if (!session || !session.user.accountId) {
			return "BRL" // Default to BRL if no account selected
		}

		const account = await db.query.tradingAccounts.findFirst({
			where: eq(tradingAccounts.id, session.user.accountId),
			columns: { defaultCurrency: true },
		})

		return account?.defaultCurrency ?? "BRL"
	} catch (error) {
		console.error("Get account currency error:", error)
		return "BRL" // Fallback to BRL on error
	}
})
