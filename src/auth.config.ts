import { NextResponse } from "next/server"
import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"

// Public paths that don't require authentication
const publicPaths = ["/login", "/register", "/forgot-password", "/api/auth", "/monitor"]

// Supported locales
const locales = ["pt-BR", "en"]
const defaultLocale = "pt-BR"

// Extract locale from pathname
const getLocaleFromPathname = (pathname: string): string => {
	for (const locale of locales) {
		if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
			return locale
		}
	}
	return defaultLocale
}

// Remove locale prefix from pathname
const removeLocalePrefix = (pathname: string): string => {
	for (const locale of locales) {
		if (pathname.startsWith(`/${locale}/`)) {
			return pathname.slice(locale.length + 1)
		}
		if (pathname === `/${locale}`) {
			return "/"
		}
	}
	return pathname
}

// Check if a path is public
const isPublicPath = (pathname: string): boolean => {
	const pathWithoutLocale = removeLocalePrefix(pathname)
	return publicPaths.some((path) => pathWithoutLocale.startsWith(path))
}

// Edge-compatible auth config (no database imports)
// This is used by middleware for JWT validation only
export const authConfig: NextAuthConfig = {
	session: { strategy: "jwt" },
	pages: {
		signIn: "/login",
		newUser: "/register",
	},
	providers: [
		// Credentials provider configuration for type safety
		// Actual authorization happens in auth.ts
		Credentials({
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
				accountId: { label: "Account ID", type: "text" },
			},
			// This authorize function is not used in middleware
			// It's defined in auth.ts with database access
			authorize: () => null,
		}),
	],
	callbacks: {
		jwt: async ({ token, user, trigger, session }) => {
			// Initial sign in
			if (user) {
				token.userId = user.id
				token.accountId = user.accountId
				token.role = user.role ?? "trader"
			}

			// Handle account switching via update
			if (trigger === "update" && session?.accountId) {
				token.accountId = session.accountId
			}

			return token
		},
		session: ({ session, token }) => {
			return {
				...session,
				user: {
					...session.user,
					id: token.userId as string,
					accountId: token.accountId as string | null | undefined,
					role: token.role as "admin" | "trader" | "viewer",
				},
			}
		},
		authorized: ({ auth, request }) => {
			const { pathname } = request.nextUrl

			// Allow public paths without authentication
			if (isPublicPath(pathname)) {
				return true
			}

			// For protected paths, require authentication
			const isAuthenticated = !!auth?.user

			if (!isAuthenticated) {
				// Get the locale from the current path to redirect to the correct login page
				const locale = getLocaleFromPathname(pathname)
				const loginPath = locale === defaultLocale ? "/login" : `/${locale}/login`

				// Store callbackUrl WITHOUT locale prefix — the routing layer (next-intl's
				// router.push or intlMiddleware) will re-add the locale on redirect
				const loginUrl = new URL(loginPath, request.nextUrl.origin)
				loginUrl.searchParams.set("callbackUrl", removeLocalePrefix(pathname))

				return NextResponse.redirect(loginUrl)
			}

			return true
		},
	},
}
