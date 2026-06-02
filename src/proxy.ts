import { NextResponse } from "next/server"
import NextAuth from "next-auth"
import createIntlMiddleware from "next-intl/middleware"
import { routing } from "@/i18n/routing"
import { authConfig } from "@/auth.config"
import { canAccessFeature } from "@/lib/feature-access"

/**
 * Next.js 16 proxy — composes NextAuth (route protection) with next-intl (locale routing).
 *
 * Flow: request → auth check (authorized callback) → intlMiddleware (locale resolution)
 *
 * Next.js 16 renamed middleware.ts → proxy.ts
 * @see https://nextjs.org/docs/messages/middleware-to-proxy
 * @see https://authjs.dev/getting-started/session-management/protecting#nextjs-middleware
 */
const intlMiddleware = createIntlMiddleware(routing)

const { auth } = NextAuth(authConfig)

// Public paths that don't require authentication
const publicPaths = [
	"/login",
	"/register",
	"/forgot-password",
	"/api/auth",
	"/api/market",
]

const isPublicPath = (pathname: string): boolean => {
	const pathWithoutLocale = pathname.replace(/^\/(en|pt-BR)/, "") || "/"
	return publicPaths.some((path) => pathWithoutLocale.startsWith(path))
}

export const proxy = auth((req) => {
	const { pathname } = req.nextUrl

	// Allow API routes to pass through
	if (pathname.startsWith("/api/")) {
		return NextResponse.next()
	}

	// If authenticated and on auth page, redirect to dashboard
	const pathWithoutLocale = pathname.replace(/^\/(en|pt-BR)/, "") || "/"
	if (
		req.auth &&
		(pathWithoutLocale === "/login" ||
			pathWithoutLocale === "/register" ||
			pathWithoutLocale === "/forgot-password")
	) {
		return NextResponse.redirect(new URL("/", req.url))
	}

	// If authenticated but no account selected, redirect to login
	if (req.auth?.user && !req.auth.user.accountId && !isPublicPath(pathname)) {
		return NextResponse.redirect(new URL("/login", req.url))
	}

	// Role-based route blocking — redirect to dashboard if user lacks access
	if (req.auth?.user && !isPublicPath(pathname)) {
		const role = req.auth.user.role ?? "trader"
		if (!canAccessFeature(role, pathWithoutLocale)) {
			return NextResponse.redirect(new URL("/", req.url))
		}
	}

	// Fractal-plan cutover redirects (Phase 3, flag-guarded — default ON, disable via "0")
	if (process.env.FRACTAL_PLAN_DUAL_WRITE !== "0") {
		const pathWithoutLocaleStripped =
			pathname.replace(/^\/(en|pt-BR)/, "") || "/"
		const localeMatch = pathname.match(/^\/(en|pt-BR)/)
		const localePrefix = localeMatch ? localeMatch[0] : "/en"

		const now = new Date()
		const year = now.getFullYear()
		const month = now.getMonth() + 1
		const quarter = Math.ceil(month / 3)

		if (pathWithoutLocaleStripped === "/yearly-plan") {
			return NextResponse.redirect(
				new URL(`${localePrefix}/plan/${year}`, req.url),
				308
			)
		}
		if (pathWithoutLocaleStripped === "/quarterly-plan") {
			return NextResponse.redirect(
				new URL(`${localePrefix}/plan/${year}/${quarter}`, req.url),
				308
			)
		}
	}

	// Permanent: /monthly was absorbed into /reports as the Month Closing section.
	{
		const pathWithoutLocaleStripped =
			pathname.replace(/^\/(en|pt-BR)/, "") || "/"
		const localeMatch = pathname.match(/^\/(en|pt-BR)/)
		const localePrefix = localeMatch ? localeMatch[0] : "/en"
		if (pathWithoutLocaleStripped === "/monthly") {
			return NextResponse.redirect(
				new URL(`${localePrefix}/reports`, req.url),
				308
			)
		}
	}

	// Permanent: /replay route is deprecated. Redirect to dashboard.
	{
		const pathWithoutLocaleStripped =
			pathname.replace(/^\/(en|pt-BR)/, "") || "/"
		const localeMatch = pathname.match(/^\/(en|pt-BR)/)
		const localePrefix = localeMatch ? localeMatch[0] : "/en"
		if (pathWithoutLocaleStripped === "/replay") {
			return NextResponse.redirect(new URL(`${localePrefix}/`, req.url), 308)
		}
	}

	// Apply i18n middleware for locale routing
	return intlMiddleware(req)
})

export const config = {
	// Match all pathnames except static files
	matcher: ["/((?!_next|.*\\..*).*)"],
}
