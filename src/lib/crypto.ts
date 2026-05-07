/**
 * AES-256-GCM envelope encryption utilities.
 *
 * Architecture:
 *   ENCRYPTION_MASTER_KEY (env var) → KEK (Key Encryption Key)
 *       → encrypts per-user DEK (Data Encryption Key) stored in users.encrypted_dek
 *       → DEK encrypts/decrypts individual fields at runtime
 *
 * Format: base64(iv):base64(ciphertext):base64(authTag)
 *
 * Uses Node.js built-in `crypto` — no external dependencies.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96 bits recommended for GCM
const KEY_LENGTH = 32 // 256 bits
const AUTH_TAG_LENGTH = 16 // 128 bits

// ==========================================
// LOW-LEVEL ENCRYPT / DECRYPT
// ==========================================

/**
 * Encrypt plaintext with a 256-bit hex key.
 * Returns format: base64(iv):base64(ciphertext):base64(authTag)
 */
const encrypt = (plaintext: string, keyHex: string): string => {
	const key = Buffer.from(keyHex, "hex")
	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv(ALGORITHM, key, iv, {
		authTagLength: AUTH_TAG_LENGTH,
	})

	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	])
	const authTag = cipher.getAuthTag()

	return `${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`
}

/**
 * Decrypt ciphertext with a 256-bit hex key.
 * Expects format: base64(iv):base64(ciphertext):base64(authTag)
 * Returns null if decryption fails (tampered data, wrong key, etc.)
 */
const decrypt = (ciphertext: string, keyHex: string): string | null => {
	try {
		const parts = ciphertext.split(":")
		if (parts.length !== 3) {
			return null
		}

		const iv = Buffer.from(parts[0], "base64")
		const encrypted = Buffer.from(parts[1], "base64")
		const authTag = Buffer.from(parts[2], "base64")
		const key = Buffer.from(keyHex, "hex")

		const decipher = createDecipheriv(ALGORITHM, key, iv, {
			authTagLength: AUTH_TAG_LENGTH,
		})
		decipher.setAuthTag(authTag)

		const decrypted = Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		])
		return decrypted.toString("utf8")
	} catch (error) {
		console.error(
			"[crypto.decrypt] Decryption failed:",
			error instanceof Error ? error.message : error
		)
		return null
	}
}

// ==========================================
// KEY MANAGEMENT
// ==========================================

/**
 * Generate a random 256-bit key as hex string (for new user DEKs).
 */
const generateKey = (): string => {
	return randomBytes(KEY_LENGTH).toString("hex")
}

/**
 * Get the master key from environment. Validates length.
 */
const getMasterKey = (): string => {
	const masterKey = process.env.ENCRYPTION_MASTER_KEY
	if (!masterKey || masterKey.length !== 64) {
		throw new Error(
			"ENCRYPTION_MASTER_KEY must be set as a 64-character hex string. " +
				"Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
		)
	}
	return masterKey
}

/**
 * Encrypt a DEK with the master key (for storage in users.encrypted_dek).
 */
const encryptDek = (dek: string): string => {
	return encrypt(dek, getMasterKey())
}

/**
 * Decrypt a DEK with the master key (for runtime use).
 */
const decryptDek = (encryptedDek: string): string | null => {
	return decrypt(encryptedDek, getMasterKey())
}

// ==========================================
// FIELD-LEVEL HELPERS
// ==========================================

/**
 * Encrypt a field value with a DEK. Returns null if value is null/undefined.
 */
const encryptField = (
	value: string | number | null | undefined,
	dek: string
): string | null => {
	if (value === null || value === undefined) {
		return null
	}
	return encrypt(String(value), dek)
}

/**
 * Decrypt a field value with a DEK. Returns null if value is null/undefined or decryption fails.
 */
const decryptField = (
	value: string | null | undefined,
	dek: string
): string | null => {
	if (!value) {
		return null
	}
	return decrypt(value, dek)
}

/**
 * Decrypt a field and parse as number. Returns null if value is null or decryption fails.
 */
const decryptNumericField = (
	value: string | null | undefined,
	dek: string
): number | null => {
	const decrypted = decryptField(value, dek)
	if (decrypted === null) {
		return null
	}
	const parsed = Number(decrypted)
	return Number.isNaN(parsed) ? null : parsed
}

/**
 * Check if a value looks like it's already encrypted (matches iv:ciphertext:authTag format).
 * Used for idempotency in migration scripts.
 */
const isEncrypted = (value: string | null | undefined): boolean => {
	if (!value) {
		return false
	}
	const parts = value.split(":")
	if (parts.length !== 3) {
		return false
	}
	// Check that each part looks like valid base64
	const base64Regex = /^[A-Za-z0-9+/]+=*$/
	return parts.every((part) => part.length > 0 && base64Regex.test(part))
}

export {
	encrypt,
	decrypt,
	generateKey,
	getMasterKey,
	encryptDek,
	decryptDek,
	encryptField,
	decryptField,
	decryptNumericField,
	isEncrypted,
}
