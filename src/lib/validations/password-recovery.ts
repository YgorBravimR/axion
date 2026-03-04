import { z } from "zod"

const requestResetSchema = z.object({
	email: z.string().email("Invalid email address"),
})

const verifyCodeSchema = z.object({
	email: z.string().email("Invalid email address"),
	code: z
		.string()
		.length(6, "Code must be exactly 6 digits")
		.regex(/^\d+$/, "Code must contain only digits"),
})

const resetPasswordSchema = z.object({
	email: z.string().email("Invalid email address"),
	code: z
		.string()
		.length(6, "Code must be exactly 6 digits")
		.regex(/^\d+$/, "Code must contain only digits"),
	newPassword: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
		.regex(/[a-z]/, "Password must contain at least one lowercase letter")
		.regex(/[0-9]/, "Password must contain at least one number"),
})

type RequestResetInput = z.infer<typeof requestResetSchema>
type VerifyCodeInput = z.infer<typeof verifyCodeSchema>
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export {
	requestResetSchema,
	verifyCodeSchema,
	resetPasswordSchema,
	type RequestResetInput,
	type VerifyCodeInput,
	type ResetPasswordInput,
}
