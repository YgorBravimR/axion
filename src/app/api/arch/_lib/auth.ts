import { db } from "@/db/drizzle"
import { users, tradingAccounts, userSettings } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { NextResponse } from "next/server"

interface ArchAuthContext {
	userId: string
	accountId: string
	showAllAccounts: boolean
	allAccountIds: string[]
}

type AuthResult =
	| { success: true; auth: ArchAuthContext }
	| { success: false; response: NextResponse }

/**
 * Parses ARCH_USER_EMAILS env var (comma-separated) into a trimmed, lowercased allowlist.
 */
const getAllowedEmails = (): string[] => {
	const raw = process.env.ARCH_USER_EMAILS ?? ""
	return raw
		.split(",")
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean)
}

/**
 * Validates Bearer token auth against env vars and resolves the user + default account.
 *
 * Security:
 * - Bearer token must match ARCH_API_KEY
 * - User must be in the ARCH_USER_EMAILS allowlist (comma-separated)
 * - User must have isAdmin = true in the database
 * - Caller can select which email via the X-Arch-User header (defaults to first in allowlist)
 *
 * @param request - The incoming Next.js request
 * @returns AuthResult with either the auth context or an error response
 */
const archAuth = async (request: Request): Promise<AuthResult> => {
	const apiKey = process.env.ARCH_API_KEY
	if (!apiKey) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "Arch API key not configured" },
				{ status: 500 }
			),
		}
	}

	const authHeader = request.headers.get("authorization")
	if (!authHeader?.startsWith("Bearer ")) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "Missing or invalid Authorization header" },
				{ status: 401 }
			),
		}
	}

	const token = authHeader.slice(7)
	if (token !== apiKey) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "Invalid API key" },
				{ status: 401 }
			),
		}
	}

	const allowedEmails = getAllowedEmails()
	if (allowedEmails.length === 0) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "ARCH_USER_EMAILS not configured" },
				{ status: 500 }
			),
		}
	}

	// Caller can select which email via X-Arch-User header; defaults to first in allowlist
	const requestedEmail = request.headers.get("x-arch-user")?.trim().toLowerCase()
	const targetEmail = requestedEmail && allowedEmails.includes(requestedEmail)
		? requestedEmail
		: allowedEmails[0]

	if (requestedEmail && !allowedEmails.includes(requestedEmail)) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "Requested email is not in the allowed list" },
				{ status: 403 }
			),
		}
	}

	const [user] = await db
		.select({ id: users.id, isAdmin: users.isAdmin })
		.from(users)
		.where(eq(users.email, targetEmail))
		.limit(1)

	if (!user) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "Arch user not found" },
				{ status: 401 }
			),
		}
	}

	if (!user.isAdmin) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "Arch access requires admin privileges" },
				{ status: 403 }
			),
		}
	}

	const [defaultAccount] = await db
		.select({ id: tradingAccounts.id })
		.from(tradingAccounts)
		.where(
			and(
				eq(tradingAccounts.userId, user.id),
				eq(tradingAccounts.isDefault, true)
			)
		)
		.limit(1)

	if (!defaultAccount) {
		return {
			success: false,
			response: NextResponse.json(
				{ status: "error", message: "No default trading account found" },
				{ status: 401 }
			),
		}
	}

	const [settings] = await db
		.select({ showAllAccounts: userSettings.showAllAccounts })
		.from(userSettings)
		.where(eq(userSettings.userId, user.id))
		.limit(1)

	const showAllAccounts = settings?.showAllAccounts ?? false

	let allAccountIds: string[] = [defaultAccount.id]

	if (showAllAccounts) {
		const accounts = await db
			.select({ id: tradingAccounts.id })
			.from(tradingAccounts)
			.where(eq(tradingAccounts.userId, user.id))

		allAccountIds = accounts.map((account) => account.id)
	}

	return {
		success: true,
		auth: {
			userId: user.id,
			accountId: defaultAccount.id,
			showAllAccounts,
			allAccountIds,
		},
	}
}

export { archAuth }
export type { ArchAuthContext, AuthResult }
