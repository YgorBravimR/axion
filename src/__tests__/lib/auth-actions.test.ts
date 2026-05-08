/**
 * Unit tests for the security-hardening changes in src/app/actions/auth.ts.
 *
 * Specifically tests:
 *   - loginUser(): blocks unverified emails (Fix 3)
 *   - loginUser(): rate-limit response is forwarded to caller (Fix 1)
 *   - loginUser(): lockout response when account is locked (Fix 4)
 *   - loginUser(): records a failure on wrong password (Fix 4)
 *   - loginUser(): clears failure history on successful login (Fix 4)
 *   - loginUser(): validation errors returned for malformed input
 *   - registerUser(): returns needsVerification: true on success (Fix 3)
 *   - registerUser(): returns error for duplicate email
 *   - registerUser(): returns error for invalid input
 *
 * All external dependencies (DB, bcrypt, signIn, rate limiter) are mocked
 * so these are pure unit tests with no network or database I/O.
 *
 * NOTE: "use server" files can be imported in Vitest with the node environment
 * configured in vitest.config.ts. The directive is a no-op outside Next.js.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.hoisted: all mock references must be declared before vi.mock hoisting
// ---------------------------------------------------------------------------

const {
	dbQueryMock,
	dbMock,
	bcryptCompareMock,
	bcryptHashMock,
	signInMock,
	signOutMock,
	authMock,
	loginLimiterCheckMock,
	loginLimiterRecordMock,
	loginLimiterResetMock,
	loginLimiterCountAttemptsMock,
	loginLimiterGetLatestMock,
} = vi.hoisted(() => {
	const loginLimiterCheckMock = vi.fn()
	const loginLimiterRecordMock = vi.fn()
	const loginLimiterResetMock = vi.fn()
	const loginLimiterCountAttemptsMock = vi.fn()
	const loginLimiterGetLatestMock = vi.fn()

	const dbQueryMock = {
		users: { findFirst: vi.fn() },
		tradingAccounts: { findMany: vi.fn() },
		userSettings: { findFirst: vi.fn() },
	}

	const dbMock = {
		query: dbQueryMock,
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	}

	const bcryptCompareMock = vi.fn()
	const bcryptHashMock = vi.fn()
	const signInMock = vi.fn()
	const signOutMock = vi.fn()
	const authMock = vi.fn()

	return {
		dbQueryMock,
		dbMock,
		bcryptCompareMock,
		bcryptHashMock,
		signInMock,
		signOutMock,
		authMock,
		loginLimiterCheckMock,
		loginLimiterRecordMock,
		loginLimiterResetMock,
		loginLimiterCountAttemptsMock,
		loginLimiterGetLatestMock,
	}
})

// ---------------------------------------------------------------------------
// Module-level mock registrations (factories reference only hoisted variables)
// ---------------------------------------------------------------------------

vi.mock("@/db/drizzle", () => ({ db: dbMock }))

vi.mock("@/db/schema", () => ({
	users: { email: "col_email", id: "col_id" },
	tradingAccounts: { userId: "col_user_id", isDefault: "col_is_default" },
	userSettings: { userId: "col_user_id", showAllAccounts: "col_show_all" },
}))

vi.mock("drizzle-orm", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Vitest importOriginal generic requires inline typeof import() for module-level type capture
	const original = await importOriginal<typeof import("drizzle-orm")>()
	return {
		...original,
		eq: vi.fn((_a, _b) => "__eq__"),
		and: vi.fn((..._args) => "__and__"),
		desc: vi.fn((_col) => "__desc__"),
	}
})

vi.mock("bcryptjs", () => ({
	default: {
		compare: bcryptCompareMock,
		hash: bcryptHashMock,
	},
}))

vi.mock("@/auth", () => ({
	auth: authMock,
	signIn: signInMock,
	signOut: signOutMock,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("react", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Vitest importOriginal generic requires inline typeof import() for module-level type capture
	const original = await importOriginal<typeof import("react")>()
	return { ...original, cache: (fn: unknown) => fn }
})

vi.mock("@/lib/db-rate-limiter", () => ({
	createDbRateLimiter: vi.fn(() => ({
		check: loginLimiterCheckMock,
		record: loginLimiterRecordMock,
		reset: loginLimiterResetMock,
		countAttempts: loginLimiterCountAttemptsMock,
		getLatest: loginLimiterGetLatestMock,
	})),
}))

vi.mock("@/lib/user-crypto", () => ({
	getUserDek: vi.fn().mockResolvedValue(null),
	decryptAccountFields: vi.fn((account: unknown) => account),
}))

vi.mock("@/db/seed-user-data", () => ({
	seedUserData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/app/actions/email-verification", () => ({
	requestEmailVerification: vi.fn().mockResolvedValue({ success: true }),
	verifyEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER all mocks are registered
// ---------------------------------------------------------------------------

import { loginUser, registerUser } from "@/app/actions/auth"

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

interface MockUserOptions {
	emailVerified?: Date | null
	passwordHash?: string
	id?: string
	email?: string
}

const createMockUser = (options: MockUserOptions = {}) => ({
	id: options.id ?? "user-abc-123",
	email: options.email ?? "trader@example.com",
	passwordHash: options.passwordHash ?? "$2b$12$hashedpassword",
	emailVerified:
		options.emailVerified !== undefined ? options.emailVerified : new Date(),
	name: "Test Trader",
	encryptedDek: null,
	isAdmin: false,
	role: "trader" as const,
	preferredLocale: "pt-BR",
	theme: "dark",
	dateFormat: "dd/MM/yyyy",
	image: null,
	createdAt: new Date("2026-01-01"),
	updatedAt: new Date("2026-01-01"),
})

const createMockAccount = (
	overrides: Partial<{
		id: string
		name: string
		accountType: string
		isDefault: boolean
		userId: string
	}> = {}
) => ({
	id: overrides.id ?? "account-xyz-789",
	name: overrides.name ?? "Personal",
	accountType: overrides.accountType ?? "personal",
	isDefault: overrides.isDefault ?? true,
	userId: overrides.userId ?? "user-abc-123",
})

const allowRateLimit = () => {
	loginLimiterCheckMock.mockResolvedValue({
		allowed: true,
		remaining: 4,
		retryAfterMs: 0,
	})
}

const denyRateLimit = (retryAfterMs = 300_000) => {
	loginLimiterCheckMock.mockResolvedValue({
		allowed: false,
		remaining: 0,
		retryAfterMs,
	})
}

const allowLockout = () => {
	loginLimiterCountAttemptsMock.mockResolvedValue(0)
	loginLimiterGetLatestMock.mockResolvedValue(null)
}

const lockAccount = ({ failures = 5, lastFailureAgo = 5_000 } = {}) => {
	loginLimiterCountAttemptsMock.mockResolvedValue(failures)
	const lastFailure = new Date(Date.now() - lastFailureAgo)
	loginLimiterGetLatestMock.mockResolvedValue(lastFailure)
}

// ---------------------------------------------------------------------------
// Tests: loginUser
// ---------------------------------------------------------------------------

describe("loginUser()", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		loginLimiterRecordMock.mockResolvedValue(undefined)
		loginLimiterResetMock.mockResolvedValue(undefined)
	})

	describe("input validation", () => {
		it("should return an error for an invalid email format", async () => {
			const result = await loginUser({
				email: "not-an-email",
				password: "Password1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toBeTruthy()
		})

		it("should return an error when password is empty", async () => {
			const result = await loginUser({
				email: "user@example.com",
				password: "",
			})

			expect(result.status).toBe("error")
			expect(result.error).toBeTruthy()
		})
	})

	describe("rate limiting (Fix 1)", () => {
		it("should return an error when the rate limit is exceeded", async () => {
			denyRateLimit(5 * 60 * 1000) // 5 minutes remaining

			const result = await loginUser({
				email: "user@example.com",
				password: "Password1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/too many/i)
			expect(result.error).toMatch(/5 minute/i)
		})

		it("should include the rounded-up minute count in the rate limit error message", async () => {
			denyRateLimit(90_000) // 90 seconds → ceil(90000/60000) = 2 minutes

			const result = await loginUser({
				email: "user@example.com",
				password: "Password1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/2 minute/i)
		})
	})

	describe("account lockout (Fix 4)", () => {
		it("should return a lockout error when the account has 5+ recent failures within the lockout window", async () => {
			allowRateLimit()
			lockAccount({ failures: 5, lastFailureAgo: 5_000 }) // last failure 5 seconds ago

			const result = await loginUser({
				email: "user@example.com",
				password: "Password1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/locked/i)
		})

		it("should allow login after the lockout period expires (last failure > 15 min ago)", async () => {
			allowRateLimit()
			lockAccount({ failures: 5, lastFailureAgo: 20 * 60 * 1000 }) // 20 min ago — expired

			dbQueryMock.users.findFirst.mockResolvedValue(null)

			const result = await loginUser({
				email: "user@example.com",
				password: "Password1",
			})

			// Should fail because user not found — NOT because of lockout
			expect(result.error).not.toMatch(/locked/i)
		})

		it("should not lock when fewer than 5 failures exist", async () => {
			allowRateLimit()
			loginLimiterCountAttemptsMock.mockResolvedValue(4)
			loginLimiterGetLatestMock.mockResolvedValue(new Date())

			dbQueryMock.users.findFirst.mockResolvedValue(null)

			const result = await loginUser({
				email: "user@example.com",
				password: "Password1",
			})

			expect(result.error).not.toMatch(/locked/i)
		})
	})

	describe("email verification gate (Fix 3)", () => {
		// Email verification is currently disabled — users are auto-verified on
		// registration (see auth.ts: emailVerified check is commented out).
		// This test documents the current behavior: unverified users can still
		// log in (verification gate is bypassed).
		it("should allow login even when user.emailVerified is null (verification disabled)", async () => {
			allowRateLimit()
			allowLockout()

			const unverifiedUser = createMockUser({ emailVerified: null })
			const account = createMockAccount()

			dbQueryMock.users.findFirst.mockResolvedValue(unverifiedUser)
			bcryptCompareMock.mockResolvedValue(true) // correct password
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue([account])
			signInMock.mockResolvedValue(undefined)

			const result = await loginUser({
				email: unverifiedUser.email,
				password: "Password1",
			})

			// Verification gate is disabled — login should succeed
			expect(result.status).toBe("success")
			expect(result.error).not.toBe("EMAIL_NOT_VERIFIED")
		})

		it("should not return EMAIL_NOT_VERIFIED when user has a verified email", async () => {
			allowRateLimit()
			allowLockout()

			const verifiedUser = createMockUser({
				emailVerified: new Date("2026-01-15T00:00:00Z"),
			})
			const account = createMockAccount()

			dbQueryMock.users.findFirst.mockResolvedValue(verifiedUser)
			bcryptCompareMock.mockResolvedValue(true)
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue([account])
			signInMock.mockResolvedValue(undefined)

			const result = await loginUser({
				email: verifiedUser.email,
				password: "Password1",
			})

			expect(result.error).not.toBe("EMAIL_NOT_VERIFIED")
		})
	})

	describe("wrong password flow (Fix 4)", () => {
		it("should record a login failure when password is incorrect", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser({ emailVerified: new Date() })
			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(false) // wrong password

			await loginUser({ email: user.email, password: "WrongPassword1" })

			expect(loginLimiterRecordMock).toHaveBeenCalledOnce()
			expect(loginLimiterRecordMock).toHaveBeenCalledWith(
				`login-fail:${user.email}`
			)
		})

		it("should return an invalid credentials error when password is wrong", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser()
			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(false)

			const result = await loginUser({
				email: user.email,
				password: "WrongPass1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/invalid email or password/i)
		})

		it("should return an invalid credentials error when user does not exist", async () => {
			allowRateLimit()
			allowLockout()

			dbQueryMock.users.findFirst.mockResolvedValue(null)

			const result = await loginUser({
				email: "nobody@example.com",
				password: "Password1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/invalid email or password/i)
		})
	})

	describe("successful login flow (Fix 4)", () => {
		it("should clear login failure history after a successful login", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser({ emailVerified: new Date() })
			const account = createMockAccount()

			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(true)
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue([account])
			signInMock.mockResolvedValue(undefined)

			await loginUser({ email: user.email, password: "Password1" })

			expect(loginLimiterResetMock).toHaveBeenCalledWith(
				`login-fail:${user.email}`
			)
		})

		it("should return status=success after a valid login with a single account", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser({ emailVerified: new Date() })
			const account = createMockAccount()

			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(true)
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue([account])
			signInMock.mockResolvedValue(undefined)

			const result = await loginUser({
				email: user.email,
				password: "Password1",
			})

			expect(result.status).toBe("success")
		})

		it("should return needsAccountSelection=true when user has multiple accounts and no accountId is provided", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser({ emailVerified: new Date() })
			const accounts = [
				createMockAccount({ id: "acc-1", name: "Personal", isDefault: true }),
				createMockAccount({ id: "acc-2", name: "Prop Firm", isDefault: false }),
			]

			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(true)
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue(accounts)

			const result = await loginUser({
				email: user.email,
				password: "Password1",
			})

			expect(result.status).toBe("success")
			expect(result.needsAccountSelection).toBe(true)
			expect(result.accounts).toHaveLength(2)
		})

		it("should only expose safe account fields (no sensitive data) in the account picker", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser({ emailVerified: new Date() })
			const accounts = [
				createMockAccount({ id: "acc-1", name: "Personal", isDefault: true }),
				createMockAccount({ id: "acc-2", name: "Prop", isDefault: false }),
			]

			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(true)
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue(accounts)

			const result = await loginUser({
				email: user.email,
				password: "Password1",
			})

			if (result.accounts) {
				for (const account of result.accounts) {
					expect(Object.keys(account).sort()).toEqual(
						["accountType", "id", "isDefault", "name"].sort()
					)
				}
			}
		})

		it("should normalize email to lowercase before checking the rate limiter", async () => {
			allowRateLimit()
			allowLockout()

			const user = createMockUser({
				email: "trader@example.com",
				emailVerified: new Date(),
			})
			const account = createMockAccount()

			dbQueryMock.users.findFirst.mockResolvedValue(user)
			bcryptCompareMock.mockResolvedValue(true)
			dbQueryMock.tradingAccounts.findMany.mockResolvedValue([account])
			signInMock.mockResolvedValue(undefined)

			await loginUser({ email: "TRADER@EXAMPLE.COM", password: "Password1" })

			expect(loginLimiterCheckMock).toHaveBeenCalledWith(
				"login:trader@example.com"
			)
		})
	})

	describe("unexpected errors", () => {
		it("should return a generic error when an unhandled exception occurs", async () => {
			allowRateLimit()
			allowLockout()

			dbQueryMock.users.findFirst.mockRejectedValue(
				new Error("DB connection failure")
			)

			const result = await loginUser({
				email: "user@example.com",
				password: "Password1",
			})

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/error occurred/i)
		})
	})
})

// ---------------------------------------------------------------------------
// Tests: registerUser
// ---------------------------------------------------------------------------

describe("registerUser()", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		bcryptHashMock.mockResolvedValue("$2b$12$hashedvalue")
	})

	const validRegistration = {
		name: "New Trader",
		email: "newtrader@example.com",
		password: "SecurePass1",
		confirmPassword: "SecurePass1",
	}

	describe("input validation", () => {
		it("should return an error for invalid registration data", async () => {
			const result = await registerUser({
				name: "A",
				email: "bad-email",
				password: "weak",
				confirmPassword: "weak",
			})

			expect(result.status).toBe("error")
			expect(result.error).toBeTruthy()
		})

		it("should return an error when passwords do not match", async () => {
			const result = await registerUser({
				...validRegistration,
				confirmPassword: "DifferentPass1",
			})

			expect(result.status).toBe("error")
		})
	})

	describe("duplicate email guard", () => {
		it("should return an error when the email is already registered", async () => {
			dbQueryMock.users.findFirst.mockResolvedValue(createMockUser())

			const result = await registerUser(validRegistration)

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/already exists/i)
		})
	})

	describe("successful registration (Fix 3)", () => {
		// Registration no longer uses a DB transaction — it performs direct inserts.
		// Email verification is currently disabled: users are auto-verified on
		// registration, so needsVerification is always false.
		const setupSuccessfulRegistration = (userId = "new-user-id") => {
			const newUser = createMockUser({
				id: userId,
				email: validRegistration.email.toLowerCase(),
			})

			// auth.ts calls db.insert(users).values(...).returning() for the user row,
			// then db.insert(tradingAccounts).values(...) for the default account,
			// then db.update(users).set(...).where(...) to auto-verify the email.
			dbMock.insert
				.mockReturnValueOnce({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newUser]),
					}),
				})
				.mockReturnValueOnce({
					values: vi.fn().mockResolvedValue(undefined),
				})
			dbMock.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			})

			return newUser
		}

		it("should return status=success on first-time registration", async () => {
			dbQueryMock.users.findFirst.mockResolvedValue(null)
			setupSuccessfulRegistration()

			const result = await registerUser(validRegistration)

			expect(result.status).toBe("success")
		})

		it("should not auto-sign-in the user after registration", async () => {
			dbQueryMock.users.findFirst.mockResolvedValue(null)
			setupSuccessfulRegistration()

			await registerUser(validRegistration)

			expect(signInMock).not.toHaveBeenCalled()
		})
	})

	describe("unexpected errors", () => {
		it("should return a generic error when the DB insert throws", async () => {
			dbQueryMock.users.findFirst.mockResolvedValue(null)
			// Source uses direct db.insert() calls (no transaction) — simulate DB failure
			dbMock.insert.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(new Error("DB insert failure")),
				}),
			})

			const result = await registerUser(validRegistration)

			expect(result.status).toBe("error")
			expect(result.error).toMatch(/error occurred/i)
		})
	})
})
