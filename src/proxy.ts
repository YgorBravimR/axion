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
const publicPaths = ["/login", "/register", "/forgot-password", "/api/auth", "/monitor", "/api/market"]

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
	if (req.auth && (pathWithoutLocale === "/login" || pathWithoutLocale === "/register" || pathWithoutLocale === "/forgot-password")) {
		return NextResponse.redirect(new URL("/", req.url))
	}

	// If authenticated but no account selected, redirect to login
	if (req.auth && !req.auth.user?.accountId && !isPublicPath(pathname)) {
		return NextResponse.redirect(new URL("/login", req.url))
	}

	// Role-based route blocking — redirect to dashboard if user lacks access
	if (req.auth && !isPublicPath(pathname)) {
		const role = req.auth.user?.role ?? "viewer"
		if (!canAccessFeature(role, pathWithoutLocale)) {
			return NextResponse.redirect(new URL("/", req.url))
		}
	}

	// Apply i18n middleware for locale routing
	return intlMiddleware(req)
})

export const config = {
	// Match all pathnames except static files
	matcher: ["/((?!_next|.*\\..*).*)"],
}
