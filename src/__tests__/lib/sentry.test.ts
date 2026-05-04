/**
 * Unit tests for `src/lib/sentry.ts`.
 *
 * Strategy:
 *   - `@sentry/nextjs` is fully mocked. `withScope` is intercepted so the
 *     scope callback is invoked synchronously with a mock scope object,
 *     letting us assert on every `scope.*` call without touching the real SDK.
 *   - Each `describe` block covers one exported symbol.
 *   - Tests are grouped by concern: happy path → edge cases → boundary values.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.mock is hoisted to the top of the file by Vitest, so any variables it
// references must also be hoisted via vi.hoisted(). Otherwise the factory
// runs before `const` declarations are initialised.
// ---------------------------------------------------------------------------

const { mockScope, mockCaptureException, mockWithScope, mockAddBreadcrumb } =
	vi.hoisted(() => {
		const scope = {
			setLevel: vi.fn(),
			setTag: vi.fn(),
			setUser: vi.fn(),
			setExtras: vi.fn(),
			setFingerprint: vi.fn(),
		}

		type Scope = typeof scope
		const captureException = vi.fn()
		const addBreadcrumb = vi.fn()
		const withScope = vi.fn((callback: (s: Scope) => void) => {
			callback(scope)
		})

		return {
			mockScope: scope,
			mockCaptureException: captureException,
			mockWithScope: withScope,
			mockAddBreadcrumb: addBreadcrumb,
		}
	})

vi.mock("@sentry/nextjs", () => ({
	withScope: mockWithScope,
	captureException: mockCaptureException,
	addBreadcrumb: mockAddBreadcrumb,
}))

// ---------------------------------------------------------------------------
// Import after mocks are established.
// ---------------------------------------------------------------------------

import {
	shouldIgnore,
	reportError,
	addBreadcrumb,
	ErrorCategory,
} from "@/lib/sentry"
import type { ReportErrorOptions } from "@/lib/sentry"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the fingerprint array passed to `scope.setFingerprint` during
 * the most recent `reportError` call.
 */
const capturedFingerprint = (): string[] => {
	const calls = mockScope.setFingerprint.mock.calls
	const lastCall = calls[calls.length - 1]
	return lastCall?.[0] ?? []
}

/**
 * Returns all `[tagName, tagValue]` pairs passed to `scope.setTag`
 * during the most recent `reportError` call.
 */
const capturedTags = (): Array<[string, string]> =>
	mockScope.setTag.mock.calls as Array<[string, string]>

// ---------------------------------------------------------------------------
// Reset mocks between every test so call counts do not leak.
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks()
})

// ===========================================================================
// shouldIgnore
// ===========================================================================

describe("shouldIgnore", () => {
	describe("ignored patterns — Next.js navigation errors", () => {
		it("should ignore errors containing NEXT_REDIRECT", () => {
			expect(shouldIgnore(new Error("NEXT_REDIRECT"))).toBe(true)
		})

		it("should ignore errors containing NEXT_NOT_FOUND", () => {
			expect(shouldIgnore(new Error("NEXT_NOT_FOUND"))).toBe(true)
		})

		it("should ignore errors containing NEXT_HTTP_ERROR (NextAuth redirect)", () => {
			expect(shouldIgnore(new Error("NEXT_HTTP_ERROR"))).toBe(true)
		})
	})

	describe("ignored patterns — browser extension / chunk noise", () => {
		it("should ignore ResizeObserver loop errors", () => {
			expect(shouldIgnore(new Error("ResizeObserver loop limit exceeded"))).toBe(true)
		})

		it("should ignore ResizeObserver errors with different trailing text", () => {
			expect(shouldIgnore(new Error("ResizeObserver loop completed with undelivered notifications"))).toBe(true)
		})

		it("should ignore Loading chunk errors", () => {
			expect(shouldIgnore(new Error("Loading chunk 42 failed"))).toBe(true)
		})

		it("should ignore ChunkLoadError", () => {
			expect(shouldIgnore(new Error("ChunkLoadError: Loading chunk 7 failed."))).toBe(true)
		})
	})

	describe("ignored patterns — network flakes", () => {
		it("should ignore Failed to fetch errors", () => {
			expect(shouldIgnore(new Error("Failed to fetch"))).toBe(true)
		})

		it("should ignore NetworkError errors", () => {
			expect(shouldIgnore(new Error("NetworkError when attempting to fetch resource"))).toBe(true)
		})

		it("should ignore AbortError errors", () => {
			expect(shouldIgnore(new Error("AbortError: The operation was aborted"))).toBe(true)
		})

		it("should ignore Load failed errors", () => {
			expect(shouldIgnore(new Error("Load failed"))).toBe(true)
		})
	})

	describe("partial message matching", () => {
		it("should ignore an error whose message contains an ignored pattern mid-string", () => {
			// The pattern check uses String.includes(), not an exact match.
			expect(shouldIgnore(new Error("Unhandled: NEXT_REDIRECT to /dashboard"))).toBe(true)
		})
	})

	describe("non-Error inputs", () => {
		it("should ignore a plain string that matches an ignored pattern", () => {
			expect(shouldIgnore("NEXT_REDIRECT")).toBe(true)
		})

		it("should ignore a plain string containing NetworkError", () => {
			expect(shouldIgnore("NetworkError: something happened")).toBe(true)
		})

		it("should not ignore a plain number (converts to string via String())", () => {
			// String(404) = "404" — no ignored pattern matches
			expect(shouldIgnore(404)).toBe(false)
		})

		it("should not ignore null (converts to 'null')", () => {
			expect(shouldIgnore(null)).toBe(false)
		})

		it("should not ignore undefined (converts to 'undefined')", () => {
			expect(shouldIgnore(undefined)).toBe(false)
		})

		it("should not ignore an object (converts to '[object Object]')", () => {
			expect(shouldIgnore({ code: "DB_ERROR" })).toBe(false)
		})
	})

	describe("legitimate errors that must pass through", () => {
		it("should not ignore a generic database error", () => {
			expect(shouldIgnore(new Error("duplicate key value violates unique constraint"))).toBe(false)
		})

		it("should not ignore an encryption error", () => {
			expect(shouldIgnore(new Error("Decryption failed: invalid tag"))).toBe(false)
		})

		it("should not ignore an auth error", () => {
			expect(shouldIgnore(new Error("Invalid credentials provided"))).toBe(false)
		})

		it("should not ignore an empty string (no patterns match empty)", () => {
			expect(shouldIgnore(new Error(""))).toBe(false)
		})

		it("should not ignore an error that only resembles an ignored pattern (case-sensitive)", () => {
			// All patterns are lowercase-sensitive; "next_redirect" (lower) should not match "NEXT_REDIRECT"
			// This verifies the check is case-sensitive, as String.includes is.
			expect(shouldIgnore(new Error("next_redirect"))).toBe(false)
		})
	})
})

// ===========================================================================
// reportError
// ===========================================================================

describe("reportError", () => {
	describe("early exits — errors that must never reach Sentry", () => {
		it("should not call withScope when the error matches an ignored pattern", () => {
			reportError(new Error("NEXT_REDIRECT"), { category: ErrorCategory.API })

			expect(mockWithScope).not.toHaveBeenCalled()
			expect(mockCaptureException).not.toHaveBeenCalled()
		})

		it("should not call withScope for VALIDATION category errors", () => {
			reportError(new Error("Field is required"), { category: ErrorCategory.VALIDATION })

			expect(mockWithScope).not.toHaveBeenCalled()
			expect(mockCaptureException).not.toHaveBeenCalled()
		})

		it("should skip VALIDATION even when context and extra are provided", () => {
			reportError(
				new Error("Invalid email format"),
				{
					category: ErrorCategory.VALIDATION,
					context: "auth.register",
					extra: { field: "email" },
				}
			)

			expect(mockWithScope).not.toHaveBeenCalled()
		})
	})

	describe("Sentry is called for reportable errors", () => {
		it("should call withScope and captureException for a database error", () => {
			reportError(new Error("connection timeout"), { category: ErrorCategory.DATABASE })

			expect(mockWithScope).toHaveBeenCalledOnce()
			expect(mockCaptureException).toHaveBeenCalledOnce()
		})
	})

	describe("severity levels — default mapping per category", () => {
		const severityCases: Array<[string, ReportErrorOptions["category"], string]> = [
			["auth → warning", ErrorCategory.AUTH, "warning"],
			["database → error", ErrorCategory.DATABASE, "error"],
			["api → error", ErrorCategory.API, "error"],
			["import → warning", ErrorCategory.IMPORT, "warning"],
			["encryption → fatal", ErrorCategory.ENCRYPTION, "fatal"],
			["market_data → warning", ErrorCategory.MARKET_DATA, "warning"],
			["ui → error", ErrorCategory.UI, "error"],
			["network → warning", ErrorCategory.NETWORK, "warning"],
			["unknown → error", ErrorCategory.UNKNOWN, "error"],
		]

		for (const [label, category, expectedLevel] of severityCases) {
			it(`should set severity '${expectedLevel}' for category ${label}`, () => {
				reportError(new Error("test"), { category })

				expect(mockScope.setLevel).toHaveBeenCalledWith(expectedLevel)
			})
		}
	})

	describe("severity level override", () => {
		it("should use the provided level override instead of the category default", () => {
			reportError(
				new Error("custom severity"),
				{ category: ErrorCategory.DATABASE, level: "info" }
			)

			// database default is "error", but override is "info"
			expect(mockScope.setLevel).toHaveBeenCalledWith("info")
		})

		it("should use fatal level override even when category default is warning", () => {
			reportError(
				new Error("escalated network error"),
				{ category: ErrorCategory.NETWORK, level: "fatal" }
			)

			expect(mockScope.setLevel).toHaveBeenCalledWith("fatal")
		})
	})

	describe("category tag", () => {
		it("should always set the error.category tag", () => {
			reportError(new Error("test"), { category: ErrorCategory.DATABASE })

			expect(mockScope.setTag).toHaveBeenCalledWith("error.category", "database")
		})

		it("should set error.category to the encryption value", () => {
			reportError(new Error("test"), { category: ErrorCategory.ENCRYPTION })

			expect(mockScope.setTag).toHaveBeenCalledWith("error.category", "encryption")
		})
	})

	describe("context tag", () => {
		it("should set the error.context tag when context is provided", () => {
			reportError(
				new Error("test"),
				{ category: ErrorCategory.DATABASE, context: "trades.create" }
			)

			expect(mockScope.setTag).toHaveBeenCalledWith("error.context", "trades.create")
		})

		it("should not set error.context tag when context is omitted", () => {
			reportError(new Error("test"), { category: ErrorCategory.DATABASE })

			const contextTagCall = capturedTags().find(([name]) => name === "error.context")
			expect(contextTagCall).toBeUndefined()
		})

		it("should not set error.context tag when context is undefined", () => {
			reportError(
				new Error("test"),
				{ category: ErrorCategory.DATABASE, context: undefined }
			)

			const contextTagCall = capturedTags().find(([name]) => name === "error.context")
			expect(contextTagCall).toBeUndefined()
		})
	})

	describe("fingerprinting", () => {
		it("should fingerprint with [category, message] when no context is given", () => {
			reportError(new Error("connection refused"), { category: ErrorCategory.DATABASE })

			expect(capturedFingerprint()).toEqual(["database", "connection refused"])
		})

		it("should fingerprint with [category, context, message] when context is given", () => {
			reportError(
				new Error("constraint violation"),
				{ category: ErrorCategory.DATABASE, context: "trades.create" }
			)

			expect(capturedFingerprint()).toEqual([
				"database",
				"trades.create",
				"constraint violation",
			])
		})

		it("should use the stringified message when a non-Error is passed", () => {
			// Passing a plain string: should be wrapped in new Error(String(...))
			reportError("raw string error", { category: ErrorCategory.API })

			expect(capturedFingerprint()).toEqual(["api", "raw string error"])
		})

		it("should use context in fingerprint for an api error", () => {
			reportError(
				new Error("timeout"),
				{ category: ErrorCategory.API, context: "market.quotes" }
			)

			expect(capturedFingerprint()).toEqual(["api", "market.quotes", "timeout"])
		})
	})

	describe("userId", () => {
		it("should call scope.setUser with the provided userId", () => {
			reportError(
				new Error("test"),
				{ category: ErrorCategory.DATABASE, userId: "user-abc-123" }
			)

			expect(mockScope.setUser).toHaveBeenCalledWith({ id: "user-abc-123" })
		})

		it("should not call scope.setUser when userId is omitted", () => {
			reportError(new Error("test"), { category: ErrorCategory.DATABASE })

			expect(mockScope.setUser).not.toHaveBeenCalled()
		})

		it("should not call scope.setUser when userId is undefined", () => {
			reportError(
				new Error("test"),
				{ category: ErrorCategory.DATABASE, userId: undefined }
			)

			expect(mockScope.setUser).not.toHaveBeenCalled()
		})
	})

	describe("extra data", () => {
		it("should call scope.setExtras when extra is provided", () => {
			const extraData = { tradeId: "trade-999", operation: "insert" }

			reportError(
				new Error("test"),
				{ category: ErrorCategory.DATABASE, extra: extraData }
			)

			expect(mockScope.setExtras).toHaveBeenCalledWith(extraData)
		})

		it("should not call scope.setExtras when extra is omitted", () => {
			reportError(new Error("test"), { category: ErrorCategory.DATABASE })

			expect(mockScope.setExtras).not.toHaveBeenCalled()
		})

		it("should not call scope.setExtras when extra is undefined", () => {
			reportError(
				new Error("test"),
				{ category: ErrorCategory.DATABASE, extra: undefined }
			)

			expect(mockScope.setExtras).not.toHaveBeenCalled()
		})

		it("should attach nested extra data as-is", () => {
			const extraData = { meta: { userId: "u1", payload: [1, 2, 3] } }

			reportError(
				new Error("test"),
				{ category: ErrorCategory.IMPORT, extra: extraData }
			)

			expect(mockScope.setExtras).toHaveBeenCalledWith(extraData)
		})
	})

	describe("non-Error inputs are coerced to Error objects", () => {
		it("should wrap a string into an Error before calling captureException", () => {
			reportError("something blew up", { category: ErrorCategory.API })

			const capturedArg = mockCaptureException.mock.calls[0]?.[0] as Error
			expect(capturedArg).toBeInstanceOf(Error)
			expect(capturedArg.message).toBe("something blew up")
		})

		it("should wrap an object via String() coercion into an Error", () => {
			reportError({ code: 500 }, { category: ErrorCategory.API })

			const capturedArg = mockCaptureException.mock.calls[0]?.[0] as Error
			expect(capturedArg).toBeInstanceOf(Error)
			expect(capturedArg.message).toBe("[object Object]")
		})

		it("should pass an existing Error directly without wrapping", () => {
			const originalError = new Error("original error message")

			reportError(originalError, { category: ErrorCategory.DATABASE })

			const capturedArg = mockCaptureException.mock.calls[0]?.[0] as Error
			expect(capturedArg).toBe(originalError)
		})
	})

	describe("combined options — all fields at once", () => {
		it("should set level, all tags, user, extras and fingerprint in a single call", () => {
			const extraData = { queryTime: 42 }

			reportError(
				new Error("deadlock detected"),
				{
					category: ErrorCategory.DATABASE,
					context: "trades.bulkInsert",
					extra: extraData,
					userId: "user-xyz",
					level: "fatal",
				}
			)

			expect(mockScope.setLevel).toHaveBeenCalledWith("fatal")
			expect(mockScope.setTag).toHaveBeenCalledWith("error.category", "database")
			expect(mockScope.setTag).toHaveBeenCalledWith("error.context", "trades.bulkInsert")
			expect(mockScope.setUser).toHaveBeenCalledWith({ id: "user-xyz" })
			expect(mockScope.setExtras).toHaveBeenCalledWith(extraData)
			expect(capturedFingerprint()).toEqual([
				"database",
				"trades.bulkInsert",
				"deadlock detected",
			])
			expect(mockCaptureException).toHaveBeenCalledOnce()
		})
	})
})

// ===========================================================================
// addBreadcrumb
// ===========================================================================

describe("addBreadcrumb", () => {
	it("should call Sentry.addBreadcrumb with message, data, category and info level", () => {
		const data = { accountId: "acc-123" }

		addBreadcrumb("User switched trading account", data, "accounts")

		expect(mockAddBreadcrumb).toHaveBeenCalledOnce()
		expect(mockAddBreadcrumb).toHaveBeenCalledWith({
			message: "User switched trading account",
			data,
			category: "accounts",
			level: "info",
		})
	})

	it("should default category to 'app' when no category is given", () => {
		addBreadcrumb("Trade submitted")

		expect(mockAddBreadcrumb).toHaveBeenCalledWith({
			message: "Trade submitted",
			data: undefined,
			category: "app",
			level: "info",
		})
	})

	it("should default category to 'app' when category is explicitly undefined", () => {
		addBreadcrumb("Page viewed", { page: "/dashboard" }, undefined)

		expect(mockAddBreadcrumb).toHaveBeenCalledWith({
			message: "Page viewed",
			data: { page: "/dashboard" },
			category: "app",
			level: "info",
		})
	})

	it("should pass data as undefined when no data argument is provided", () => {
		addBreadcrumb("CSV import started")

		const callArg = mockAddBreadcrumb.mock.calls[0]?.[0]
		expect(callArg.data).toBeUndefined()
	})

	it("should pass through complex data objects verbatim", () => {
		const data = { tradeCount: 42, broker: "Clear", symbols: ["WIN", "DOLFUT"] }

		addBreadcrumb("Import preview generated", data, "import")

		expect(mockAddBreadcrumb).toHaveBeenCalledWith({
			message: "Import preview generated",
			data,
			category: "import",
			level: "info",
		})
	})

	it("should always use info as the breadcrumb level", () => {
		addBreadcrumb("Some event")

		const callArg = mockAddBreadcrumb.mock.calls[0]?.[0]
		expect(callArg.level).toBe("info")
	})
})

// ===========================================================================
// ErrorCategory constant shape
// ===========================================================================

describe("ErrorCategory", () => {
	it("should expose all expected category keys", () => {
		expect(ErrorCategory).toMatchObject({
			AUTH: "auth",
			DATABASE: "database",
			VALIDATION: "validation",
			API: "api",
			IMPORT: "import",
			ENCRYPTION: "encryption",
			MARKET_DATA: "market_data",
			UI: "ui",
			NETWORK: "network",
			UNKNOWN: "unknown",
		})
	})

	it("should have exactly 10 categories", () => {
		expect(Object.keys(ErrorCategory)).toHaveLength(10)
	})

	it("should have no duplicate values", () => {
		const values = Object.values(ErrorCategory)
		const uniqueValues = new Set(values)
		expect(uniqueValues.size).toBe(values.length)
	})
})
