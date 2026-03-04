import { defineRouting } from "next-intl/routing"
import { createNavigation } from "next-intl/navigation"

export const routing = defineRouting({
	// A list of all locales that are supported
	locales: ["pt-BR", "en"],

	// Used when no locale matches
	defaultLocale: "pt-BR",

	// The prefix for the default locale
	localePrefix: "as-needed",

	// Disable Accept-Language header detection — always use pt-BR as fallback
	localeDetection: false,
})

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
	createNavigation(routing)
