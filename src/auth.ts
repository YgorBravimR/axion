import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { users, tradingAccounts } from "@/db/schema"
import { authConfig } from "./auth.config"

declare module "next-auth" {
	interface User {
		id: string
		accountId?: string | null
		role?: "admin" | "trader" | "viewer"
	}

	interface Session {
		user: {
			id: string
			name: string
			email: string
			image?: string | null
			accountId?: string | null
			role: "admin" | "trader" | "viewer"
		}
	}

	interface JWT {
		userId: string
		accountId?: string | null
		role: "admin" | "trader" | "viewer"
	}
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	...authConfig,
	adapter: DrizzleAdapter(db),
	providers: [
		Credentials({
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
				accountId: { label: "Account ID", type: "text" },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					return null
				}

				const email = credentials.email as string
				const password = credentials.password as string
				// Handle accountId - could be undefined, null, or empty string
				const rawAccountId = credentials.accountId
				const accountId = typeof rawAccountId === "string" && rawAccountId.trim() !== ""
					? rawAccountId.trim()
					: null

				// Find user by email
				const user = await db.query.users.findFirst({
					where: eq(users.email, email.toLowerCase()),
				})

				if (!user) {
					return null
				}

				// Verify password
				const isValid = await bcrypt.compare(password, user.passwordHash)
				if (!isValid) {
					return null
				}

				// If accountId provided, verify it belongs to user
				let selectedAccountId: string | null = null
				if (accountId) {
					const account = await db.query.tradingAccounts.findFirst({
						where: eq(tradingAccounts.id, accountId),
					})
					if (account && account.userId === user.id) {
						selectedAccountId = account.id
					}
				}

				// If no valid accountId or account not found, get default account
				if (!selectedAccountId) {
					const defaultAccount = await db.query.tradingAccounts.findFirst({
						where: eq(tradingAccounts.userId, user.id),
						orderBy: (accounts, { desc }) => [desc(accounts.isDefault)],
					})
					if (defaultAccount) {
						selectedAccountId = defaultAccount.id
					}
				}

				return {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
					accountId: selectedAccountId,
					role: user.role,
				}
			},
		}),
	],
})
