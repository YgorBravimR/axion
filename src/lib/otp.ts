import { randomInt, createHash } from "crypto"

const OTP_EXPIRY_MINUTES = 10
const OTP_LENGTH = 6

/**
 * Generates a cryptographically random 6-digit OTP code.
 * Uses crypto.randomInt for uniform distribution (no modulo bias).
 */
const generateOTP = (): string => {
	const min = Math.pow(10, OTP_LENGTH - 1)
	const max = Math.pow(10, OTP_LENGTH)
	return randomInt(min, max).toString()
}

/**
 * SHA-256 hash of an OTP code for storage.
 * Fast hashing is acceptable since OTPs are short-lived and rate-limited.
 */
const hashOTP = (code: string): string =>
	createHash("sha256").update(code).digest("hex")

export { generateOTP, hashOTP, OTP_EXPIRY_MINUTES }
