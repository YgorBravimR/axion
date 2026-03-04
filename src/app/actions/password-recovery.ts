"use server"

import { eq, and, gt } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/db/drizzle"
import { users, verificationTokens } from "@/db/schema"
import { sendEmail } from "@/lib/email"
import { passwordResetTemplate } from "@/lib/email-templates"
import { generateOTP, hashOTP, OTP_EXPIRY_MINUTES } from "@/lib/otp"
import {
	requestResetSchema,
	verifyCodeSchema,
	resetPasswordSchema,
	type RequestResetInput,
	type VerifyCodeInput,
	type ResetPasswordInput,
} from "@/lib/validations/password-recovery"

// ==========================================
// RATE LIMITING (in-memory, MVP)
// ==========================================

const verifyAttempts = new Map<string, { count: number; resetAt: number }>()
const VERIFY_MAX_ATTEMPTS = 5
const VERIFY_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

const isRateLimited = (email: string): boolean => {
	const key = email.toLowerCase()
	const entry = verifyAttempts.get(key)
	if (!entry) return false
	if (Date.now() > entry.resetAt) {
		verifyAttempts.delete(key)
		return false
	}
	return entry.count >= VERIFY_MAX_ATTEMPTS
}

const recordAttempt = (email: string): void => {
	const key = email.toLowerCase()
	const entry = verifyAttempts.get(key)
	if (!entry || Date.now() > entry.resetAt) {
		verifyAttempts.set(key, { count: 1, resetAt: Date.now() + VERIFY_WINDOW_MS })
		return
	}
	entry.count += 1
}

const clearAttempts = (email: string): void => {
	verifyAttempts.delete(email.toLowerCase())
}

// ==========================================
// HELPERS
// ==========================================

const TOKEN_PREFIX = "password-reset:"

const buildIdentifier = (email: string): string =>
	`${TOKEN_PREFIX}${email.toLowerCase()}`

// ==========================================
// SERVER ACTIONS
// ==========================================

/**
 * Step 1: Request a password reset code.
 * Always returns success to prevent email enumeration.
 */
const requestPasswordReset = async (
	input: RequestResetInput
): Promise<{ success: boolean }> => {
	const parsed = requestResetSchema.safeParse(input)
	if (!parsed.success) return { success: true } // anti-enumeration

	const email = parsed.data.email.toLowerCase()
	const identifier = buildIdentifier(email)

	// Look up user — if not found, return success anyway
	const user = await db.query.users.findFirst({
		where: eq(users.email, email),
		columns: { id: true },
	})

	if (!user) return { success: true }

	// Delete any existing tokens for this identifier
	await db
		.delete(verificationTokens)
		.where(eq(verificationTokens.identifier, identifier))

	// Generate OTP and store hashed version
	const code = generateOTP()
	const hashedCode = hashOTP(code)
	const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

	await db.insert(verificationTokens).values({
		identifier,
		token: hashedCode,
		expires,
	})

	// Send email
	await sendEmail({
		to: email,
		subject: "Password Reset Code",
		html: passwordResetTemplate({ code, expiresInMinutes: OTP_EXPIRY_MINUTES }),
	})

	return { success: true }
}

/**
 * Step 2: Verify the OTP code.
 * Rate-limited to 5 attempts per email per 15 minutes.
 */
const verifyResetCode = async (
	input: VerifyCodeInput
): Promise<{ valid: boolean; error?: string }> => {
	const parsed = verifyCodeSchema.safeParse(input)
	if (!parsed.success) {
		return { valid: false, error: "Invalid input" }
	}

	const { email, code } = parsed.data
	const lowerEmail = email.toLowerCase()

	// Rate limiting
	if (isRateLimited(lowerEmail)) {
		return { valid: false, error: "Too many attempts. Try again later." }
	}

	recordAttempt(lowerEmail)

	const identifier = buildIdentifier(lowerEmail)
	const hashedCode = hashOTP(code)

	// Look up the token
	const tokenRow = await db.query.verificationTokens.findFirst({
		where: and(
			eq(verificationTokens.identifier, identifier),
			eq(verificationTokens.token, hashedCode),
			gt(verificationTokens.expires, new Date())
		),
	})

	if (!tokenRow) {
		return { valid: false, error: "Invalid or expired code" }
	}

	return { valid: true }
}

/**
 * Step 3: Reset the password using a verified OTP code.
 * Re-verifies the OTP to prevent replay without verification step.
 */
const resetPassword = async (
	input: ResetPasswordInput
): Promise<{ success: boolean; error?: string }> => {
	const parsed = resetPasswordSchema.safeParse(input)
	if (!parsed.success) {
		const firstError = parsed.error.issues[0]?.message ?? "Invalid input"
		return { success: false, error: firstError }
	}

	const { email, code, newPassword } = parsed.data
	const lowerEmail = email.toLowerCase()
	const identifier = buildIdentifier(lowerEmail)
	const hashedCode = hashOTP(code)

	// Re-verify the OTP
	const tokenRow = await db.query.verificationTokens.findFirst({
		where: and(
			eq(verificationTokens.identifier, identifier),
			eq(verificationTokens.token, hashedCode),
			gt(verificationTokens.expires, new Date())
		),
	})

	if (!tokenRow) {
		return { success: false, error: "Invalid or expired code" }
	}

	// Hash new password
	const passwordHash = await bcrypt.hash(newPassword, 12)

	// Update user password
	const result = await db
		.update(users)
		.set({ passwordHash, updatedAt: new Date() })
		.where(eq(users.email, lowerEmail))
		.returning({ id: users.id })

	if (result.length === 0) {
		return { success: false, error: "User not found" }
	}

	// Clean up: delete token and clear rate limit attempts
	await db
		.delete(verificationTokens)
		.where(eq(verificationTokens.identifier, identifier))

	clearAttempts(lowerEmail)

	return { success: true }
}

export { requestPasswordReset, verifyResetCode, resetPassword }
