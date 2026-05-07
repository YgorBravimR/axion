/**
 * Unit tests for src/app/actions/email-verification.ts.
 *
 * Tests both exported server actions:
 *   - requestEmailVerification({ email })
 *   - verifyEmail({ email, code })
 *
 * All external dependencies are mocked:
 *   - DB queries (db.query.*, db.insert, db.delete, db.update)
 *   - createDbRateLimiter (rate limiters)
 *   - generateOTP / hashOTP
 *   - sendEmail
 *
 * Scenarios covered:
 *   requestEmailVerification:
 *     - Happy path: user found, unverified → OTP stored, email sent
 *     - Rate limited → returns error with retry time
 *     - Invalid input → returns success (anti-enumeration)
 *     - User not found → returns success silently (anti-enumeration)
 *     - Already verified → returns success silently (no email sent)
 *
 *   verifyEmail:
 *     - Happy path: valid code → user marked verified, token deleted
 *     - Invalid input → returns error
 *     - Rate limited → returns error with retry time
 *     - Token not found / expired → returns INVALID_OR_EXPIRED
 *     - Rate limit is cleared after successful verification
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.hoisted: must be declared before vi.mock factories are hoisted
// ---------------------------------------------------------------------------

const {
	dbQueryMock,
	dbMock,
	requestLimiterCheckMock,
	verifyLimiterCheckMock,
	verifyLimiterResetMock,
	generateOTPMock,
	hashOTPMock,
	sendEmailMock,
} = vi.hoisted(() => {
	const dbQueryMock = {
		users: { findFirst: vi.fn() },
		verificationTokens: { findFirst: vi.fn() },
	}

	const dbMock = {
		query: dbQueryMock,
		insert: vi.fn(),
		delete: vi.fn(),
		update: vi.fn(),
	}

	const requestLimiterCheckMock = vi.fn()
	const verifyLimiterCheckMock = vi.fn()
	const verifyLimiterResetMock = vi.fn()
	const generateOTPMock = vi.fn()
	const hashOTPMock = vi.fn()
	const sendEmailMock = vi.fn()

	return {
		dbQueryMock,
		dbMock,
		requestLimiterCheckMock,
		verifyLimiterCheckMock,
		verifyLimiterResetMock,
		generateOTPMock,
		hashOTPMock,
		sendEmailMock,
	}
})

// ---------------------------------------------------------------------------
// Module-level mock registrations
// ---------------------------------------------------------------------------

vi.mock("@/db/drizzle", () => ({ db: dbMock }))

vi.mock("@/db/schema", () => ({
	users: { email: "col_email" },
	verificationTokens: {
		identifier: "col_identifier",
		token: "col_token",
		expires: "col_expires",
	},
}))

vi.mock("drizzle-orm", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Vitest importOriginal generic requires inline typeof import() for module-level type capture
	const original = await importOriginal<typeof import("drizzle-orm")>()
	return {
		...original,
		eq: vi.fn((_a, _b) => "__eq__"),
		and: vi.fn((..._args) => "__and__"),
		gt: vi.fn((_a, _b) => "__gt__"),
	}
})

// The module creates two limiters in module scope. We distinguish them by
// config: requestLimiter uses maxAttempts=3, verifyLimiter uses maxAttempts=5.
// The source creates two limiters in module scope:
//   requestLimiter → maxAttempts: 2, windowMs: 30 * 60 * 1000
//   verifyLimiter  → maxAttempts: 5, windowMs: 15 * 60 * 1000
// We distinguish them by maxAttempts value so each mock fn is wired correctly.
vi.mock("@/lib/db-rate-limiter", () => ({
	createDbRateLimiter: vi.fn(
		(config: { maxAttempts: number; windowMs: number }) => {
			if (config.maxAttempts === 2) {
				return {
					check: requestLimiterCheckMock,
					reset: vi.fn().mockResolvedValue(undefined),
					countAttempts: vi.fn().mockResolvedValue(0),
					record: vi.fn().mockResolvedValue(undefined),
					getLatest: vi.fn().mockResolvedValue(null),
				}
			}
			return {
				check: verifyLimiterCheckMock,
				reset: verifyLimiterResetMock,
				countAttempts: vi.fn().mockResolvedValue(0),
				record: vi.fn().mockResolvedValue(undefined),
				getLatest: vi.fn().mockResolvedValue(null),
			}
		}
	),
}))

vi.mock("@/lib/otp", () => ({
	generateOTP: generateOTPMock,
	hashOTP: hashOTPMock,
	OTP_EXPIRY_MINUTES: 10,
}))

vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }))

vi.mock("@/lib/email-templates", () => ({
	emailVerificationTemplate: vi.fn(() => "<html>OTP</html>"),
}))

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import {
	requestEmailVerification,
	verifyEmail,
} from "@/app/actions/email-verification"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const allowRequestRateLimit = () => {
	requestLimiterCheckMock.mockResolvedValue({
		allowed: true,
		remaining: 2,
		retryAfterMs: 0,
	})
}

const denyRequestRateLimit = (retryAfterMs = 180_000) => {
	requestLimiterCheckMock.mockResolvedValue({
		allowed: false,
		remaining: 0,
		retryAfterMs,
	})
}

const allowVerifyRateLimit = () => {
	verifyLimiterCheckMock.mockResolvedValue({
		allowed: true,
		remaining: 4,
		retryAfterMs: 0,
	})
}

const denyVerifyRateLimit = (retryAfterMs = 600_000) => {
	verifyLimiterCheckMock.mockResolvedValue({
		allowed: false,
		remaining: 0,
		retryAfterMs,
	})
}

const setupInsertToken = () => {
	dbMock.insert.mockReturnValue({
		values: vi.fn().mockResolvedValue(undefined),
	})
}

const setupDeleteToken = () => {
	dbMock.delete.mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	})
}

const setupUpdateUser = () => {
	dbMock.update.mockReturnValue({
		set: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(undefined),
		}),
	})
}

// ---------------------------------------------------------------------------
// Tests: requestEmailVerification
// ---------------------------------------------------------------------------

describe("requestEmailVerification()", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		generateOTPMock.mockReturnValue("123456")
		hashOTPMock.mockReturnValue("hashed_123456")
		sendEmailMock.mockResolvedValue({ success: true })
		setupInsertToken()
		setupDeleteToken()
		verifyLimiterResetMock.mockResolvedValue(undefined)
	})

	describe("happy path", () => {
		it("should generate an OTP, store the hash, and send the email for an unverified user", async () => {
			allowRequestRateLimit()

			dbQueryMock.users.findFirst.mockResolvedValue({
				id: "user-id-1",
				emailVerified: null,
			})

			const result = await requestEmailVerification({
				email: "trader@example.com",
			})

			expect(result.success).toBe(true)
			expect(generateOTPMock).toHaveBeenCalledOnce()
			expect(hashOTPMock).toHaveBeenCalledWith("123456")
			expect(dbMock.insert).toHaveBeenCalled()
			expect(sendEmailMock).toHaveBeenCalledOnce()
			expect(sendEmailMock).toHaveBeenCalledWith(
				expect.objectContaining({ to: "trader@example.com" })
			)
		})

		it("should use the lowercased email as the rate-limiter key", async () => {
			allowRequestRateLimit()

			dbQueryMock.users.findFirst.mockResolvedValue({
				id: "uid",
				emailVerified: null,
			})

			await requestEmailVerification({ email: "Trader@Example.COM" })

			expect(requestLimiterCheckMock).toHaveBeenCalledWith(
				"email-verify-req:trader@example.com"
			)
		})

		it("should delete any existing token for the email before inserting a new one", async () => {
			allowRequestRateLimit()

			dbQueryMock.users.findFirst.mockResolvedValue({
				id: "uid",
				emailVerified: null,
			})

			await requestEmailVerification({ email: "trader@example.com" })

			expect(dbMock.delete).toHaveBeenCalled()
			expect(dbMock.insert).toHaveBeenCalled()
		})
	})

	describe("anti-enumeration behavior", () => {
		it("should return success=true even when the email is not registered", async () => {
			allowRequestRateLimit()
			dbQueryMock.users.findFirst.mockResolvedValue(null)

			const result = await requestEmailVerification({
				email: "nobody@example.com",
			})

			expect(result.success).toBe(true)
			// Must NOT send an email — that would reveal the user does not exist
			expect(sendEmailMock).not.toHaveBeenCalled()
		})

		it("should return success=true when the user is already verified", async () => {
			allowRequestRateLimit()
			dbQueryMock.users.findFirst.mockResolvedValue({
				id: "uid",
				emailVerified: new Date(),
			})

			const result = await requestEmailVerification({
				email: "verified@example.com",
			})

			expect(result.success).toBe(true)
			expect(sendEmailMock).not.toHaveBeenCalled()
			expect(dbMock.insert).not.toHaveBeenCalled()
		})

		it("should return success=true for invalid email input (does not leak schema info)", async () => {
			// Invalid email format short-circuits before hitting the rate limiter
			const result = await requestEmailVerification({ email: "not-valid" })

			expect(result.success).toBe(true)
			expect(requestLimiterCheckMock).not.toHaveBeenCalled()
		})
	})

	describe("rate limiting", () => {
		it("should return an error when the request rate limit is exceeded", async () => {
			denyRequestRateLimit(3 * 60 * 1000) // 3 minutes remaining

			const result = await requestEmailVerification({
				email: "trader@example.com",
			})

			expect(result.success).toBe(false)
			expect(result.error).toMatch(/too many requests/i)
			expect(result.error).toMatch(/3 minute/i)
		})

		it("should not send an email when rate limited", async () => {
			denyRequestRateLimit()

			const result = await requestEmailVerification({
				email: "trader@example.com",
			})

			expect(result.success).toBe(false)
			expect(sendEmailMock).not.toHaveBeenCalled()
		})
	})
})

// ---------------------------------------------------------------------------
// Tests: verifyEmail
// ---------------------------------------------------------------------------

describe("verifyEmail()", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		hashOTPMock.mockReturnValue("hashed_input_code")
		setupDeleteToken()
		setupUpdateUser()
		verifyLimiterResetMock.mockResolvedValue(undefined)
	})

	describe("happy path", () => {
		it("should return success=true and update the user as verified when the code is correct", async () => {
			allowVerifyRateLimit()

			dbQueryMock.verificationTokens.findFirst.mockResolvedValue({
				identifier: "email-verification:trader@example.com",
				token: "hashed_input_code",
				expires: new Date(Date.now() + 60_000),
			})

			const result = await verifyEmail({
				email: "trader@example.com",
				code: "123456",
			})

			expect(result.success).toBe(true)
			expect(dbMock.update).toHaveBeenCalled()
		})

		it("should delete the verification token after successful verification", async () => {
			allowVerifyRateLimit()

			dbQueryMock.verificationTokens.findFirst.mockResolvedValue({
				identifier: "email-verification:trader@example.com",
				token: "hashed_input_code",
				expires: new Date(Date.now() + 60_000),
			})

			await verifyEmail({ email: "trader@example.com", code: "123456" })

			expect(dbMock.delete).toHaveBeenCalled()
		})

		it("should reset the verify rate limiter after successful verification", async () => {
			allowVerifyRateLimit()

			dbQueryMock.verificationTokens.findFirst.mockResolvedValue({
				identifier: "email-verification:trader@example.com",
				token: "hashed_input_code",
				expires: new Date(Date.now() + 60_000),
			})

			await verifyEmail({ email: "trader@example.com", code: "123456" })

			expect(verifyLimiterResetMock).toHaveBeenCalledWith(
				"email-verify:trader@example.com"
			)
		})

		it("should hash the provided code before looking it up in the database", async () => {
			allowVerifyRateLimit()

			dbQueryMock.verificationTokens.findFirst.mockResolvedValue({
				identifier: "email-verification:trader@example.com",
				token: "hashed_input_code",
				expires: new Date(Date.now() + 60_000),
			})

			await verifyEmail({ email: "trader@example.com", code: "654321" })

			expect(hashOTPMock).toHaveBeenCalledWith("654321")
		})

		it("should normalize email to lowercase before processing", async () => {
			allowVerifyRateLimit()

			dbQueryMock.verificationTokens.findFirst.mockResolvedValue({
				identifier: "email-verification:trader@example.com",
				token: "hashed_input_code",
				expires: new Date(Date.now() + 60_000),
			})

			await verifyEmail({ email: "TRADER@EXAMPLE.COM", code: "123456" })

			expect(verifyLimiterCheckMock).toHaveBeenCalledWith(
				"email-verify:trader@example.com"
			)
		})
	})

	describe("invalid input", () => {
		it("should return an error for an invalid email format", async () => {
			const result = await verifyEmail({ email: "bad-email", code: "123456" })

			expect(result.success).toBe(false)
			expect(result.error).toMatch(/invalid input/i)
		})

		it("should return an error when code is not 6 digits", async () => {
			const result = await verifyEmail({
				email: "user@example.com",
				code: "12345",
			})

			expect(result.success).toBe(false)
		})

		it("should return an error when code contains letters", async () => {
			const result = await verifyEmail({
				email: "user@example.com",
				code: "12345a",
			})

			expect(result.success).toBe(false)
		})
	})

	describe("rate limiting", () => {
		it("should return an error when the verify rate limit is exceeded", async () => {
			denyVerifyRateLimit(10 * 60 * 1000) // 10 minutes remaining

			const result = await verifyEmail({
				email: "trader@example.com",
				code: "123456",
			})

			expect(result.success).toBe(false)
			expect(result.error).toMatch(/too many requests/i)
			expect(result.error).toMatch(/10 minute/i)
		})

		it("should not touch the database when rate limited", async () => {
			denyVerifyRateLimit()

			await verifyEmail({ email: "trader@example.com", code: "123456" })

			expect(dbQueryMock.verificationTokens.findFirst).not.toHaveBeenCalled()
		})
	})

	describe("invalid or expired token", () => {
		it("should return INVALID_OR_EXPIRED when no matching token is found", async () => {
			allowVerifyRateLimit()
			dbQueryMock.verificationTokens.findFirst.mockResolvedValue(null)

			const result = await verifyEmail({
				email: "trader@example.com",
				code: "999999",
			})

			expect(result.success).toBe(false)
			expect(result.error).toBe("INVALID_OR_EXPIRED")
		})

		it("should not update the user when the token lookup fails", async () => {
			allowVerifyRateLimit()
			dbQueryMock.verificationTokens.findFirst.mockResolvedValue(null)

			await verifyEmail({ email: "trader@example.com", code: "000000" })

			expect(dbMock.update).not.toHaveBeenCalled()
		})

		it("should not reset the rate limiter when the code is invalid", async () => {
			allowVerifyRateLimit()
			dbQueryMock.verificationTokens.findFirst.mockResolvedValue(null)

			await verifyEmail({ email: "trader@example.com", code: "000000" })

			expect(verifyLimiterResetMock).not.toHaveBeenCalled()
		})
	})
})
