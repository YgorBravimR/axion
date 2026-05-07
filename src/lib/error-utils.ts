/**
 * Error sanitization utility.
 * Prevents leaking internal details (DB schema, constraint names, stack traces) to the client.
 *
 * Server-side: always log the full error for debugging + report to Sentry.
 * Client-side: return a generic message so users never see raw DB errors.
 */
import { reportError, ErrorCategory } from "@/lib/sentry"
import type { ErrorCategoryValue } from "@/lib/sentry"

const GENERIC_MESSAGE = "common.unexpectedError"

// Next.js framework error digests that are control-flow signals, not real errors
const FRAMEWORK_DIGESTS = new Set([
	"NEXT_REDIRECT",
	"NEXT_NOT_FOUND",
	"HANGING_PROMISE_REJECTION",
])

/** Check if the error is a Next.js internal signal (redirect, prerender bailout, etc.) */
const isFrameworkSignal = (error: unknown): boolean => {
	if (error && typeof error === "object" && "digest" in error) {
		const digest = (error as { digest: string }).digest
		return FRAMEWORK_DIGESTS.has(digest)
	}
	return false
}

/**
 * Converts any caught error into a safe string for client-facing responses.
 * Logs the full error server-side for debugging and reports to Sentry.
 * Silently ignores Next.js framework signals (redirects, prerender bailouts).
 *
 * @param error - The caught error
 * @param context - Dot-separated context path, e.g. "trades.create"
 * @param category - Optional Sentry category for dashboard filtering (defaults to UNKNOWN)
 */
const toSafeErrorMessage = (
	error: unknown,
	context?: string,
	category?: ErrorCategoryValue
): string => {
	// Skip logging for Next.js framework signals (prerender bailouts, redirects)
	if (isFrameworkSignal(error)) {
		return GENERIC_MESSAGE
	}

	if (context) {
		console.error(`[${context}]`, error)
	} else {
		console.error(error)
	}

	reportError(error, {
		category: category ?? ErrorCategory.UNKNOWN,
		context,
	})

	return GENERIC_MESSAGE
}

export { isFrameworkSignal, toSafeErrorMessage }
