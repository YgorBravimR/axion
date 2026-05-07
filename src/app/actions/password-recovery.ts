"use server"

import { eq, and, gt } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db } from "@/db/drizzle"
import { users, verificationTokens } from "@/db/schema"
import { getTranslations } from "next-intl/server"
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
// RATE LIMITING (DB-backed, survives cold starts)
// ==========================================

import { createDbRateLimiter } from "@/lib/db-rate-limiter"

const verifyLimiter = createDbRateLimiter({
	maxAttempts: 5,
	windowMs: 15 * 60 * 1000, // 15 minutes
})

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
	if (!parsed.success) {
		return { success: true }
	} // anti-enumeration

	const email = parsed.data.email.toLowerCase()
	const identifier = buildIdentifier(email)

	// Look up user — if not found, return success anyway
	const user = await db.query.users.findFirst({
		where: eq(users.email, email),
		columns: { id: true },
	})

	if (!user) {
		return { success: true }
	}

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

	// Send email with locale-aware translations
	const tEmail = await getTranslations("email")
	await sendEmail({
		to: email,
		subject: tEmail("passwordReset.subject"),
		html: passwordResetTemplate({
			code,
			expiresInMinutes: OTP_EXPIRY_MINUTES,
			translations: {
				brandName: tEmail("brandName"),
				footer: tEmail("footer"),
				heading: tEmail("passwordReset.heading"),
				body: tEmail("passwordReset.body"),
				disclaimer: tEmail("passwordReset.disclaimer"),
				title: tEmail("passwordReset.title"),
			},
		}),
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
	const t = await getTranslations("forgotPassword")
	const parsed = verifyCodeSchema.safeParse(input)
	if (!parsed.success) {
		return { valid: false, error: t("errors.invalidInput") }
	}

	const { email, code } = parsed.data
	const lowerEmail = email.toLowerCase()

	// Rate limiting (DB-backed)
	const rateLimitResult = await verifyLimiter.check(`pw-verify:${lowerEmail}`)
	if (!rateLimitResult.allowed) {
		const retryMinutes = Math.ceil(rateLimitResult.retryAfterMs / 60_000)
		return {
			valid: false,
			error: t("errors.rateLimited", { minutes: retryMinutes }),
		}
	}

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
		return { valid: false, error: t("errors.invalidCode") }
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
	const t = await getTranslations("forgotPassword")
	const tAuth = await getTranslations("auth")
	const parsed = resetPasswordSchema.safeParse(input)
	if (!parsed.success) {
		const firstError =
			parsed.error.issues[0]?.message ?? t("errors.invalidInput")
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
		return { success: false, error: t("errors.invalidCode") }
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
		return { success: false, error: tAuth("errors.userNotFound") }
	}

	// Clean up: delete token and clear rate limit attempts
	await db
		.delete(verificationTokens)
		.where(eq(verificationTokens.identifier, identifier))

	await verifyLimiter.reset(`pw-verify:${lowerEmail}`)

	return { success: true }
}

export { requestPasswordReset, verifyResetCode, resetPassword }
