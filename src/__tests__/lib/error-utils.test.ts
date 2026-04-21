/**
 * Unit tests for `src/lib/error-utils.ts`.
 *
 * Strategy:
 *   - `@/lib/sentry` is fully mocked so this suite tests the delegation
 *     contract between `toSafeErrorMessage` and `reportError` without
 *     exercising any real Sentry SDK code.
 *   - `console.error` is spied on and muted for the duration of each test
 *     so output does not pollute the test runner.
 *   - Tests are grouped by observable behavior: return value, console output,
 *     and `reportError` invocation arguments.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.mock is hoisted by Vitest, so mockReportError must be created via
// vi.hoisted() to be available when the factory executes.
// ---------------------------------------------------------------------------

const { mockReportError } = vi.hoisted(() => ({
	mockReportError: vi.fn(),
}))

vi.mock("@/lib/sentry", () => ({
	reportError: mockReportError,
	ErrorCategory: {
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
	},
}))

// ---------------------------------------------------------------------------
// Import after mocks so module resolution picks up the mock.
// ---------------------------------------------------------------------------

import { toSafeErrorMessage } from "@/lib/error-utils"

// ---------------------------------------------------------------------------
// Silence console.error for all tests in this suite; each test verifies
// the call independently via the spy.
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks()
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

// ===========================================================================
// Return value
// ===========================================================================

describe("toSafeErrorMessage — return value", () => {
	it("should always return the generic message for an Error object", () => {
		const result = toSafeErrorMessage(new Error("DB connection failed"))

		expect(result).toBe("common.unexpectedError")
	})

	it("should always return the generic message for a plain string error", () => {
		const result = toSafeErrorMessage("something went wrong")

		expect(result).toBe("common.unexpectedError")
	})

	it("should always return the generic message for null", () => {
		const result = toSafeErrorMessage(null)

		expect(result).toBe("common.unexpectedError")
	})

	it("should always return the generic message for undefined", () => {
		const result = toSafeErrorMessage(undefined)

		expect(result).toBe("common.unexpectedError")
	})

	it("should always return the generic message regardless of context", () => {
		const result = toSafeErrorMessage(new Error("any error"), "trades.create")

		expect(result).toBe("common.unexpectedError")
	})

	it("should always return the generic message regardless of category", () => {
		const result = toSafeErrorMessage(
			new Error("any error"),
			"trades.create",
			"database",
		)

		expect(result).toBe("common.unexpectedError")
	})
})

// ===========================================================================
// console.error behaviour
// ===========================================================================

describe("toSafeErrorMessage — console.error output", () => {
	it("should call console.error with just the error when no context is provided", () => {
		const error = new Error("raw error")

		toSafeErrorMessage(error)

		expect(console.error).toHaveBeenCalledOnce()
		expect(console.error).toHaveBeenCalledWith(error)
	})

	it("should call console.error with context prefix when context is provided", () => {
		const error = new Error("constraint violation")

		toSafeErrorMessage(error, "trades.create")

		expect(console.error).toHaveBeenCalledOnce()
		expect(console.error).toHaveBeenCalledWith("[trades.create]", error)
	})

	it("should format the context prefix with square brackets", () => {
		toSafeErrorMessage(new Error("test"), "csv.parse")

		const firstArg = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
		expect(firstArg).toBe("[csv.parse]")
	})

	it("should call console.error with just the error when context is undefined", () => {
		const error = new Error("test")

		toSafeErrorMessage(error, undefined)

		expect(console.error).toHaveBeenCalledWith(error)
	})

	it("should log plain string errors to console.error without context", () => {
		toSafeErrorMessage("string error")

		expect(console.error).toHaveBeenCalledWith("string error")
	})

	it("should log plain string errors to console.error with context prefix", () => {
		toSafeErrorMessage("string error", "auth.login")

		expect(console.error).toHaveBeenCalledWith("[auth.login]", "string error")
	})
})

// ===========================================================================
// reportError delegation
// ===========================================================================

describe("toSafeErrorMessage — reportError delegation", () => {
	it("should call reportError with the original error object", () => {
		const error = new Error("db error")

		toSafeErrorMessage(error)

		expect(mockReportError).toHaveBeenCalledOnce()
		const [passedError] = mockReportError.mock.calls[0] as [unknown, unknown]
		expect(passedError).toBe(error)
	})

	it("should default to UNKNOWN category when no category argument is provided", () => {
		toSafeErrorMessage(new Error("unknown failure"))

		const [, options] = mockReportError.mock.calls[0] as [unknown, { category: string }]
		expect(options.category).toBe("unknown")
	})

	it("should default to UNKNOWN category when only error and context are provided", () => {
		toSafeErrorMessage(new Error("failure"), "trades.list")

		const [, options] = mockReportError.mock.calls[0] as [unknown, { category: string }]
		expect(options.category).toBe("unknown")
	})

	it("should forward the provided category to reportError", () => {
		toSafeErrorMessage(new Error("constraint"), "trades.create", "database")

		const [, options] = mockReportError.mock.calls[0] as [unknown, { category: string }]
		expect(options.category).toBe("database")
	})

	it("should forward auth category to reportError", () => {
		toSafeErrorMessage(new Error("invalid token"), "auth.verify", "auth")

		const [, options] = mockReportError.mock.calls[0] as [unknown, { category: string }]
		expect(options.category).toBe("auth")
	})

	it("should forward encryption category to reportError", () => {
		toSafeErrorMessage(new Error("decryption failed"), "encryption.decrypt", "encryption")

		const [, options] = mockReportError.mock.calls[0] as [unknown, { category: string }]
		expect(options.category).toBe("encryption")
	})

	it("should forward context to reportError when provided", () => {
		toSafeErrorMessage(new Error("import error"), "csv.parse", "import")

		const [, options] = mockReportError.mock.calls[0] as [
			unknown,
			{ category: string; context: string | undefined },
		]
		expect(options.context).toBe("csv.parse")
	})

	it("should forward undefined context when no context argument is given", () => {
		toSafeErrorMessage(new Error("error"))

		const [, options] = mockReportError.mock.calls[0] as [
			unknown,
			{ category: string; context: string | undefined },
		]
		expect(options.context).toBeUndefined()
	})

	it("should call reportError exactly once per invocation", () => {
		toSafeErrorMessage(new Error("test"), "some.context", "api")

		expect(mockReportError).toHaveBeenCalledOnce()
	})
})

// ===========================================================================
// Backward compatibility — existing call sites pass (error) or (error, context)
// ===========================================================================

describe("toSafeErrorMessage — backward compatibility", () => {
	it("should work correctly when called with only an error (1-arg form)", () => {
		const result = toSafeErrorMessage(new Error("standalone error"))

		expect(result).toBe("common.unexpectedError")
		expect(mockReportError).toHaveBeenCalledOnce()
	})

	it("should work correctly when called with error and context (2-arg form)", () => {
		const result = toSafeErrorMessage(new Error("contextual error"), "module.action")

		expect(result).toBe("common.unexpectedError")
		expect(mockReportError).toHaveBeenCalledOnce()

		const [, options] = mockReportError.mock.calls[0] as [
			unknown,
			{ category: string; context: string | undefined },
		]
		expect(options.context).toBe("module.action")
		expect(options.category).toBe("unknown")
	})

	it("should work correctly when called with all three args (3-arg form)", () => {
		const result = toSafeErrorMessage(new Error("full error"), "module.action", "api")

		expect(result).toBe("common.unexpectedError")
		expect(mockReportError).toHaveBeenCalledOnce()
	})
})
