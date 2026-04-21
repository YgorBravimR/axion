/**
 * Unit tests for all Zod schemas in src/lib/validations/auth.ts.
 *
 * Covers the two schemas added as part of the email-verification feature:
 *   - verifyEmailSchema
 *   - requestVerificationSchema
 *
 * Also covers the pre-existing schemas to ensure no regressions:
 *   - registerSchema
 *   - loginSchema
 *   - changePasswordSchema
 *   - updateProfileSchema
 *
 * Each schema is tested for:
 *   - Happy-path acceptance of valid input
 *   - Rejection of each individual invalid field
 *   - Edge cases (boundary values, format requirements)
 */

import { describe, it, expect } from "vitest"
import {
	verifyEmailSchema,
	requestVerificationSchema,
	registerSchema,
	loginSchema,
	changePasswordSchema,
	updateProfileSchema,
} from "@/lib/validations/auth"

// ---------------------------------------------------------------------------
// verifyEmailSchema  (Fix 3 — email verification)
// ---------------------------------------------------------------------------

describe("verifyEmailSchema", () => {
	const validInput = { email: "user@example.com", code: "123456" }

	it("should accept a valid email and a 6-digit numeric code", () => {
		const result = verifyEmailSchema.safeParse(validInput)
		expect(result.success).toBe(true)
	})

	it("should accept a code that is exactly 6 zeros", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, code: "000000" })
		expect(result.success).toBe(true)
	})

	it("should accept a code that is exactly 6 nines", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, code: "999999" })
		expect(result.success).toBe(true)
	})

	it("should reject a code shorter than 6 digits", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, code: "12345" })
		expect(result.success).toBe(false)
		if (!result.success) {
			const messages = result.error.issues.map((i) => i.message)
			expect(messages.some((m) => /codelength/i.test(m))).toBe(true)
		}
	})

	it("should reject a code longer than 6 digits", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, code: "1234567" })
		expect(result.success).toBe(false)
	})

	it("should reject a code that contains non-numeric characters", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, code: "12345a" })
		expect(result.success).toBe(false)
		if (!result.success) {
			const messages = result.error.issues.map((i) => i.message)
			expect(messages.some((m) => /numeric/i.test(m))).toBe(true)
		}
	})

	it("should reject a code that contains spaces", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, code: "123 56" })
		expect(result.success).toBe(false)
	})

	it("should reject an invalid email address", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, email: "not-an-email" })
		expect(result.success).toBe(false)
		if (!result.success) {
			const messages = result.error.issues.map((i) => i.message)
			expect(messages.some((m) => /email/i.test(m))).toBe(true)
		}
	})

	it("should reject an empty email", () => {
		const result = verifyEmailSchema.safeParse({ ...validInput, email: "" })
		expect(result.success).toBe(false)
	})

	it("should reject when email is missing entirely", () => {
		const result = verifyEmailSchema.safeParse({ code: "123456" })
		expect(result.success).toBe(false)
	})

	it("should reject when code is missing entirely", () => {
		const result = verifyEmailSchema.safeParse({ email: "user@example.com" })
		expect(result.success).toBe(false)
	})

	it("should reject an empty object", () => {
		const result = verifyEmailSchema.safeParse({})
		expect(result.success).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// requestVerificationSchema  (Fix 3 — email verification)
// ---------------------------------------------------------------------------

describe("requestVerificationSchema", () => {
	it("should accept a valid email address", () => {
		const result = requestVerificationSchema.safeParse({ email: "trader@example.com" })
		expect(result.success).toBe(true)
	})

	it("should accept email addresses with subdomains", () => {
		const result = requestVerificationSchema.safeParse({ email: "user@mail.example.co.uk" })
		expect(result.success).toBe(true)
	})

	it("should accept email addresses with plus addressing", () => {
		const result = requestVerificationSchema.safeParse({ email: "user+tag@example.com" })
		expect(result.success).toBe(true)
	})

	it("should reject an invalid email address", () => {
		const result = requestVerificationSchema.safeParse({ email: "plaintext" })
		expect(result.success).toBe(false)
	})

	it("should reject an email missing the domain part", () => {
		const result = requestVerificationSchema.safeParse({ email: "user@" })
		expect(result.success).toBe(false)
	})

	it("should reject an empty email string", () => {
		const result = requestVerificationSchema.safeParse({ email: "" })
		expect(result.success).toBe(false)
	})

	it("should reject when email field is missing entirely", () => {
		const result = requestVerificationSchema.safeParse({})
		expect(result.success).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------

describe("registerSchema", () => {
	const validInput = {
		name: "Test User",
		email: "test@example.com",
		password: "Password1",
		confirmPassword: "Password1",
	}

	it("should accept a fully valid registration payload", () => {
		const result = registerSchema.safeParse(validInput)
		expect(result.success).toBe(true)
	})

	it("should reject a name shorter than 2 characters", () => {
		const result = registerSchema.safeParse({ ...validInput, name: "A" })
		expect(result.success).toBe(false)
	})

	it("should reject a name longer than 255 characters", () => {
		const result = registerSchema.safeParse({ ...validInput, name: "A".repeat(256) })
		expect(result.success).toBe(false)
	})

	it("should accept a name that is exactly 2 characters long (boundary)", () => {
		const result = registerSchema.safeParse({ ...validInput, name: "AB" })
		expect(result.success).toBe(true)
	})

	it("should reject an invalid email address", () => {
		const result = registerSchema.safeParse({ ...validInput, email: "bad-email" })
		expect(result.success).toBe(false)
	})

	it("should reject a password shorter than 8 characters", () => {
		const result = registerSchema.safeParse({
			...validInput,
			password: "Pas1",
			confirmPassword: "Pas1",
		})
		expect(result.success).toBe(false)
	})

	it("should reject a password without an uppercase letter", () => {
		const result = registerSchema.safeParse({
			...validInput,
			password: "password1",
			confirmPassword: "password1",
		})
		expect(result.success).toBe(false)
	})

	it("should reject a password without a lowercase letter", () => {
		const result = registerSchema.safeParse({
			...validInput,
			password: "PASSWORD1",
			confirmPassword: "PASSWORD1",
		})
		expect(result.success).toBe(false)
	})

	it("should reject a password without a digit", () => {
		const result = registerSchema.safeParse({
			...validInput,
			password: "PasswordOnly",
			confirmPassword: "PasswordOnly",
		})
		expect(result.success).toBe(false)
	})

	it("should reject when password and confirmPassword do not match", () => {
		const result = registerSchema.safeParse({
			...validInput,
			password: "Password1",
			confirmPassword: "Password2",
		})
		expect(result.success).toBe(false)
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join("."))
			expect(paths).toContain("confirmPassword")
		}
	})
})

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------

describe("loginSchema", () => {
	const validInput = {
		email: "user@example.com",
		password: "anypassword",
	}

	it("should accept a valid email and password", () => {
		const result = loginSchema.safeParse(validInput)
		expect(result.success).toBe(true)
	})

	it("should accept an optional accountId when it is a valid UUID", () => {
		const result = loginSchema.safeParse({
			...validInput,
			accountId: "550e8400-e29b-41d4-a716-446655440000",
		})
		expect(result.success).toBe(true)
	})

	it("should accept when accountId is omitted (optional field)", () => {
		const result = loginSchema.safeParse(validInput)
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.accountId).toBeUndefined()
		}
	})

	it("should reject an invalid accountId that is not a UUID", () => {
		const result = loginSchema.safeParse({ ...validInput, accountId: "not-a-uuid" })
		expect(result.success).toBe(false)
	})

	it("should reject an empty password", () => {
		const result = loginSchema.safeParse({ ...validInput, password: "" })
		expect(result.success).toBe(false)
	})

	it("should reject an invalid email", () => {
		const result = loginSchema.safeParse({ ...validInput, email: "not-email" })
		expect(result.success).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// changePasswordSchema
// ---------------------------------------------------------------------------

describe("changePasswordSchema", () => {
	const validInput = {
		currentPassword: "OldPassword1",
		newPassword: "NewPassword1",
		confirmPassword: "NewPassword1",
	}

	it("should accept a valid change-password payload", () => {
		const result = changePasswordSchema.safeParse(validInput)
		expect(result.success).toBe(true)
	})

	it("should reject an empty currentPassword", () => {
		const result = changePasswordSchema.safeParse({ ...validInput, currentPassword: "" })
		expect(result.success).toBe(false)
	})

	it("should reject a newPassword that does not meet complexity requirements", () => {
		const result = changePasswordSchema.safeParse({
			...validInput,
			newPassword: "weakpassword",
			confirmPassword: "weakpassword",
		})
		expect(result.success).toBe(false)
	})

	it("should reject when newPassword and confirmPassword do not match", () => {
		const result = changePasswordSchema.safeParse({
			...validInput,
			newPassword: "NewPassword1",
			confirmPassword: "DifferentPassword1",
		})
		expect(result.success).toBe(false)
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join("."))
			expect(paths).toContain("confirmPassword")
		}
	})
})

// ---------------------------------------------------------------------------
// updateProfileSchema
// ---------------------------------------------------------------------------

describe("updateProfileSchema", () => {
	it("should accept a valid profile update with all fields", () => {
		const result = updateProfileSchema.safeParse({
			name: "Updated Name",
			preferredLocale: "pt-BR",
			theme: "dark",
			dateFormat: "dd/MM/yyyy",
		})
		expect(result.success).toBe(true)
	})

	it("should accept a profile update with only the required name field", () => {
		const result = updateProfileSchema.safeParse({ name: "Just A Name" })
		expect(result.success).toBe(true)
	})

	it("should reject a name shorter than 2 characters", () => {
		const result = updateProfileSchema.safeParse({ name: "X" })
		expect(result.success).toBe(false)
	})

	it("should reject an invalid preferredLocale value", () => {
		const result = updateProfileSchema.safeParse({ name: "Valid Name", preferredLocale: "fr-FR" })
		expect(result.success).toBe(false)
	})

	it("should reject an invalid theme value", () => {
		const result = updateProfileSchema.safeParse({ name: "Valid Name", theme: "blue" })
		expect(result.success).toBe(false)
	})

	it("should accept 'en' as a valid preferredLocale", () => {
		const result = updateProfileSchema.safeParse({ name: "Valid Name", preferredLocale: "en" })
		expect(result.success).toBe(true)
	})

	it("should accept 'light' as a valid theme", () => {
		const result = updateProfileSchema.safeParse({ name: "Valid Name", theme: "light" })
		expect(result.success).toBe(true)
	})
})
