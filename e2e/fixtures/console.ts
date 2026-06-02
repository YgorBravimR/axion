import { test as base, expect } from "@playwright/test"
import type { ConsoleMessage as PlaywrightConsoleMessage } from "@playwright/test"

interface ConsoleErrorRecord {
	text: string
	location: {
		url: string
		lineNumber: number
	}
}

/**
 * Allowlist of known benign console errors that should not fail tests.
 * The BRL/Intl.NumberFormat bug would have been caught by RangeError matching,
 * but our allowlist is conservative to surface real issues early.
 *
 * Add entries only when:
 * - The error is framework-internal and doesn't impact user experience
 * - It's a known third-party SDK limitation (documented in gotchas.md)
 * - It's a Next.js dev-mode-only noise (hot reload, turbopack internals)
 */
const BENIGN_ERROR_PATTERNS: readonly RegExp[] = [
	// Next.js dev server hot reload and Turbopack internals
	/Failed to fetch.*_next\/static/,
	/HMR.*failed/i,
	/WebSocket.*closed/i,
	/Failed to import source map/,

	// React 19 / Hydration warnings that don't affect functionality
	/Warning:.*useLayoutEffect.*runs synchronously/,
	/Warning:.*Avoid app cache in development/,

	// Browser extensions and user scripts (not app code)
	/Extension context invalidated/,
	/chrome-extension:\/\//,
]

/**
 * Fixture: console-error listener + allowlist + test failure on unexpected errors.
 *
 * Tracks all browser console.error() messages. On test teardown, compares errors
 * against BENIGN_ERROR_PATTERNS allowlist. Unexpected errors fail the test with
 * a clear list of each violation.
 *
 * Usage: tests already import from '../fixtures/base', which extends this fixture.
 * No changes needed in test files.
 */
export const test = base.extend({
	page: async ({ page }, use, testInfo) => {
		const consoleErrors: ConsoleErrorRecord[] = []

		// Capture all console.error messages
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				const loc = msg.location()
				consoleErrors.push({
					text: msg.text(),
					location: {
						url: loc.url,
						lineNumber: loc.lineNumber,
					},
				})
			}
		})

		// Also capture uncaught exceptions
		page.on("pageerror", (err) => {
			consoleErrors.push({
				text: err.message || String(err),
				location: { url: "uncaught-error", lineNumber: 0 },
			})
		})

		await use(page)

		// Filter out benign errors
		const unexpectedErrors = consoleErrors.filter(
			(error) =>
				!BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(error.text))
		)

		// Fail test if any unexpected errors were found
		if (unexpectedErrors.length > 0) {
			const errorList = unexpectedErrors
				.map(
					(error) =>
						`  - ${error.text}\n    at ${error.location.url}:${error.location.lineNumber}`
				)
				.join("\n")

			throw new Error(
				`Browser console.error() detected (${unexpectedErrors.length} unexpected error${unexpectedErrors.length === 1 ? "" : "s"}):\n${errorList}`
			)
		}
	},
})

export * from "@playwright/test"
export { expect }
