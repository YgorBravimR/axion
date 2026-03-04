"use server"

import { cache } from "react"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { eq, and } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { users, tradingAccounts, type User, type TradingAccount } from "@/db/schema"
import { createRateLimiter } from "@/lib/rate-limiter"
// Field-level encryption disabled — imports preserved for re-activation:
// import { generateKey, encryptDek, encryptField } from "@/lib/crypto"
import { getUserDek, decryptAccountFields } from "@/lib/user-crypto"

/** User type without passwordHash/encryptedDek — safe to send to the client */
export type SafeUser = Omit<User, "passwordHash" | "encryptedDek">
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

// 5 login attempts per 15 minutes, keyed by email
const loginLimiter = createRateLimiter({
	maxAttempts: 5,
	windowMs: 15 * 60 * 1000,
})

// ==========================================
// REGISTRATION
// ==========================================

export const registerUser = async (
	input: RegisterInput
): Promise<{ status: "success" | "error"; error?: string }> => {
	try {
		const validated = registerSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: validated.error.issues[0].message }
		}

		const { name, email, password } = validated.data

		// Check if email already exists
		const existingUser = await db.query.users.findFirst({
			where: eq(users.email, email.toLowerCase()),
		})

		if (existingUser) {
			return { status: "error", error: "An account with this email already exists" }
		}

		// Hash password
		const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

		// Field-level encryption disabled — skip DEK generation
		// To re-enable: uncomment the lines below and remove the plaintext insert
		// const dek = generateKey()
		// const encryptedDekValue = encryptDek(dek)
		// const encryptedName = encryptField(name, dek) ?? name

		const [newUser] = await db
			.insert(users)
			.values({
				name,
				email: email.toLowerCase(),
				passwordHash,
				encryptedDek: null,
			})
			.returning()

		// Create default trading account
		await db.insert(tradingAccounts).values({
			userId: newUser.id,
			name: "Personal",
			isDefault: true,
			accountType: "personal",
		})

		return { status: "success" }
	} catch (error) {
		console.error("Registration error:", error)
		return { status: "error", error: "An error occurred during registration" }
	}
}

// ==========================================
// LOGIN / LOGOUT
// ==========================================

/** Minimal account info returned to the client for account selection */
interface AccountPickerItem {
	id: string
	name: string
	accountType: string
	isDefault: boolean
}

export const loginUser = async (
	input: LoginInput
): Promise<{ status: "success" | "error"; error?: string; needsAccountSelection?: boolean; accounts?: AccountPickerItem[] }> => {
	try {
		const validated = loginSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: validated.error.issues[0].message }
		}

		const { email, password, accountId } = validated.data

		// Rate limit by email address
		const rateLimitResult = loginLimiter.check(email.toLowerCase())
		if (!rateLimitResult.allowed) {
			const retryMinutes = Math.ceil(rateLimitResult.retryAfterMs / 60_000)
			return {
				status: "error",
				error: `Too many login attempts. Please try again in ${retryMinutes} minute(s).`,
			}
		}

		// Find user
		const user = await db.query.users.findFirst({
			where: eq(users.email, email.toLowerCase()),
		})

		if (!user) {
			return { status: "error", error: "Invalid email or password" }
		}

		// Verify password
		const isValid = await bcrypt.compare(password, user.passwordHash)
		if (!isValid) {
			return { status: "error", error: "Invalid email or password" }
		}

		// Get user's accounts
		const userAccounts = await db.query.tradingAccounts.findMany({
			where: eq(tradingAccounts.userId, user.id),
			orderBy: (accounts, { desc }) => [desc(accounts.isDefault)],
		})

		// If no accountId provided and user has multiple accounts, return for selection
		// Only expose fields needed for the account picker UI
		if (!accountId && userAccounts.length > 1) {
			const safeAccounts = userAccounts.map(({ id, name, accountType, isDefault }) => ({
				id,
				name,
				accountType,
				isDefault,
			}))
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
		return { status: "error", error: "An error occurred during login" }
	}
}

export const logoutUser = async (): Promise<void> => {
	await signOut({ redirect: false })
	redirect("/login")
}

// ==========================================
// SESSION HELPERS
// ==========================================

export const getCurrentUser = async (): Promise<SafeUser | null> => {
	const session = await auth()
	if (!session?.user?.id) {
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

	if (!user) return null

	// Decrypt name if user has a DEK
	const dek = await getUserDek(session.user.id)
	if (dek) {
		const { decryptField } = await import("@/lib/crypto")
		const decryptedName = decryptField(user.name, dek)
		return { ...user, name: decryptedName ?? user.name }
	}

	return user
}

export const getCurrentAccount = async (): Promise<TradingAccount | null> => {
	const session = await auth()
	if (!session?.user?.accountId) {
		return null
	}

	const account = await db.query.tradingAccounts.findFirst({
		where: eq(tradingAccounts.id, session.user.accountId),
	})

	if (!account) return null

	// Decrypt financial fields if DEK is available
	const dek = session.user.id ? await getUserDek(session.user.id) : null
	if (dek) {
		return decryptAccountFields(account as unknown as Record<string, unknown>, dek) as unknown as TradingAccount
	}

	return account
}

export const getUserAccounts = async (): Promise<TradingAccount[]> => {
	const session = await auth()
	if (!session?.user?.id) {
		return []
	}

	const accounts = await db.query.tradingAccounts.findMany({
		where: eq(tradingAccounts.userId, session.user.id),
		orderBy: (accounts, { desc }) => [desc(accounts.isDefault)],
	})

	// Decrypt financial fields if DEK is available
	const dek = await getUserDek(session.user.id)
	if (dek) {
		return accounts.map((account) =>
			decryptAccountFields(account as unknown as Record<string, unknown>, dek) as unknown as TradingAccount
		)
	}

	return accounts
}

interface AuthContext {
	userId: string
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

/**
 * Cached auth context provider - deduplicates auth checks within a single request.
 * When multiple server actions call requireAuth() in parallel (e.g., dashboard fetching 6 data sources),
 * this ensures auth is only checked once per request instead of 6 times.
 *
 * @see React.cache() docs: https://react.dev/reference/react/cache
 */
export const requireAuth = cache(async (): Promise<AuthContext> => {
	const session = await auth()
	if (!session?.user?.id) {
		redirect("/login")
	}
	if (!session?.user?.accountId) {
		// No account selected - redirect to login to re-authenticate
		redirect("/login")
	}

	// Get user settings for showAllAccounts preference
	const { userSettings } = await import("@/db/schema")
	const settings = await db.query.userSettings.findFirst({
		where: eq(userSettings.userId, session.user.id),
	})

	// Get all user's account IDs for "all accounts" mode
	let allAccountIds: string[] = [session.user.accountId]
	if (settings?.showAllAccounts) {
		const accounts = await db.query.tradingAccounts.findMany({
			where: eq(tradingAccounts.userId, session.user.id),
			columns: { id: true },
		})
		allAccountIds = accounts.map((a) => a.id)
	}

	return {
		userId: session.user.id,
		accountId: session.user.accountId,
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
	try {
		const session = await auth()
		if (!session?.user?.id) {
			return { status: "error", error: "Not authenticated" }
		}

		// Verify account belongs to user
		const account = await db.query.tradingAccounts.findFirst({
			where: and(
				eq(tradingAccounts.id, accountId),
				eq(tradingAccounts.userId, session.user.id)
			),
		})

		if (!account) {
			return { status: "error", error: "Account not found" }
		}

		// Note: The actual session update happens via the update trigger in the JWT callback
		// This requires the client to call update() on the session
		revalidatePath("/")

		return { status: "success" }
	} catch (error) {
		console.error("Switch account error:", error)
		return { status: "error", error: "An error occurred" }
	}
}

/**
 * Revalidate all app paths after account switch
 * This ensures all cached data is refreshed with the new account's data
 */
export const revalidateAfterAccountSwitch = async (): Promise<void> => {
	revalidatePath("/")
	revalidatePath("/journal")
	revalidatePath("/reports")
	revalidatePath("/analytics")
	revalidatePath("/monthly")
	revalidatePath("/playbook")
	revalidatePath("/settings")
}

// ==========================================
// PROFILE MANAGEMENT
// ==========================================

export const updateUserProfile = async (
	input: UpdateProfileInput
): Promise<{ status: "success" | "error"; error?: string }> => {
	try {
		const session = await auth()
		if (!session?.user?.id) {
			return { status: "error", error: "Not authenticated" }
		}

		const validated = updateProfileSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: validated.error.issues[0].message }
		}

		const updateData = { ...validated.data } as Record<string, unknown>
		// Field-level encryption disabled — name stored as plaintext
		// To re-enable:
		// const dek = await getUserDek(session.user.id)
		// if (dek && updateData.name) {
		// 	updateData.name = encryptField(updateData.name as string, dek) ?? updateData.name
		// }

		await db
			.update(users)
			.set({
				...updateData,
				updatedAt: new Date(),
			})
			.where(eq(users.id, session.user.id))

		revalidatePath("/settings")

		return { status: "success" }
	} catch (error) {
		console.error("Update profile error:", error)
		return { status: "error", error: "An error occurred" }
	}
}

export const changePassword = async (
	input: ChangePasswordInput
): Promise<{ status: "success" | "error"; error?: string }> => {
	try {
		const session = await auth()
		if (!session?.user?.id) {
			return { status: "error", error: "Not authenticated" }
		}

		const validated = changePasswordSchema.safeParse(input)
		if (!validated.success) {
			return { status: "error", error: validated.error.issues[0].message }
		}

		// Get current user
		const user = await db.query.users.findFirst({
			where: eq(users.id, session.user.id),
		})

		if (!user) {
			return { status: "error", error: "User not found" }
		}

		// Verify current password
		const isValid = await bcrypt.compare(validated.data.currentPassword, user.passwordHash)
		if (!isValid) {
			return { status: "error", error: "Current password is incorrect" }
		}

		// Hash new password
		const newPasswordHash = await bcrypt.hash(validated.data.newPassword, SALT_ROUNDS)

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
		return { status: "error", error: "An error occurred" }
	}
}
