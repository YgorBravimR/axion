import { z } from "zod"

const requestResetSchema = z.object({
	email: z.string().email("validation.passwordRecovery.invalidEmail"),
})

const verifyCodeSchema = z.object({
	email: z.string().email("validation.passwordRecovery.invalidEmail"),
	code: z
		.string()
		.length(6, "validation.passwordRecovery.codeLength")
		.regex(/^\d+$/, "validation.passwordRecovery.codeDigitsOnly"),
})

const resetPasswordSchema = z.object({
	email: z.string().email("validation.passwordRecovery.invalidEmail"),
	code: z
		.string()
		.length(6, "validation.passwordRecovery.codeLength")
		.regex(/^\d+$/, "validation.passwordRecovery.codeDigitsOnly"),
	newPassword: z
		.string()
		.min(8, "validation.passwordRecovery.passwordMin")
		.regex(/[A-Z]/, "validation.passwordRecovery.passwordUppercase")
		.regex(/[a-z]/, "validation.passwordRecovery.passwordLowercase")
		.regex(/[0-9]/, "validation.passwordRecovery.passwordNumber"),
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
