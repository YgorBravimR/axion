/**
 * Global Vitest setup — runs before each test file.
 *
 * Resets module-level mutable state (like the trade factory counter)
 * to prevent ID accumulation across tests within the same worker process.
 */

import { beforeEach, vi } from "vitest"
import { resetTradeIdCounter } from "./lib/fixtures/trade-factory"
import { loadEnvFile } from "process"

// Load .env file for tests that need DB access
loadEnvFile(".env")

// next-intl/server cannot run in Vitest's Node environment — it requires the
// Next.js RSC runtime. Mock it globally so any test that imports a server action
// using getTranslations() does not throw "not supported in Client Components".
//
// The mock returns a translator function that resolves known translation keys to
// human-readable strings so that tests asserting on error message content pass.
// Unknown keys fall back to the key itself (identity). Interpolation params are
// appended so assertions like /3 minute/ can match against { minutes: 3 }.
const TRANSLATION_MAP: Record<string, string> = {
	// auth namespace (used in src/app/actions/auth.ts)
	"errors.emailExists": "An account with this email already exists",
	"errors.registrationFailed": "An error occurred during registration",
	"errors.rateLimited":
		"Too many requests. Please wait {minutes} minute(s) and try again",
	"errors.accountLocked":
		"Your account is locked. Please wait {minutes} minute(s)",
	"errors.invalidCredentials": "Invalid email or password",
	"errors.loginFailed": "An error occurred. Please try again",
	"errors.notAuthenticated": "Not authenticated",
	"errors.userNotFound": "User not found",
	"errors.incorrectPassword": "Incorrect password",
	"errors.accountNotFound": "Account not found",
	"defaultAccountName": "My Account",
	// auth.verifyEmail namespace (used in src/app/actions/email-verification.ts)
	// These keys are resolved relative to the namespace passed to getTranslations,
	// so "auth.verifyEmail" + "errors.rateLimited" → lookup key below.
	"auth.verifyEmail.errors.invalidInput": "Invalid input",
	// Matches the actual en.json translation: auth.verifyEmail.errors.rateLimited
	"auth.verifyEmail.errors.rateLimited":
		"Too many requests. Try again in {minutes} minute(s).",
	"errors.invalidInput": "Invalid input",
}

const buildTranslator =
	(namespace: string) =>
	(key: string, params?: Record<string, unknown>): string => {
		// Prefer the fully-qualified namespace.key lookup so per-namespace overrides
		// take precedence over generic key matches (e.g. "auth.verifyEmail.errors.rateLimited"
		// returns a different string than the generic "errors.rateLimited").
		const fullKey = `${namespace}.${key}`
		const template = TRANSLATION_MAP[fullKey] ?? TRANSLATION_MAP[key] ?? key
		if (!params) {
			return template
		}
		// Interpolate {paramName} placeholders in the template string
		return Object.entries(params).reduce<string>(
			(str, [paramKey, paramValue]) =>
				str.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue)),
			template
		)
	}

vi.mock("next-intl/server", () => ({
	getTranslations: vi
		.fn()
		.mockImplementation((namespace: string) =>
			Promise.resolve(buildTranslator(namespace))
		),
	getLocale: vi.fn().mockResolvedValue("en"),
	getMessages: vi.fn().mockResolvedValue({}),
	getNow: vi.fn().mockResolvedValue(new Date()),
	getTimeZone: vi.fn().mockResolvedValue("UTC"),
}))

beforeEach(() => {
	resetTradeIdCounter()
})
