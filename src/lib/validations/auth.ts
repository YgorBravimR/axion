import { z } from "zod"

export const registerSchema = z
	.object({
		name: z
			.string()
			.min(2, "validation.auth.nameMin")
			.max(255, "validation.auth.nameMax"),
		email: z.string().email("validation.auth.invalidEmail"),
		password: z
			.string()
			.min(8, "validation.auth.passwordMin")
			.regex(/[A-Z]/, "validation.auth.passwordUppercase")
			.regex(/[a-z]/, "validation.auth.passwordLowercase")
			.regex(/[0-9]/, "validation.auth.passwordNumber"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "validation.auth.passwordsDoNotMatch",
		path: ["confirmPassword"],
	})

export const loginSchema = z.object({
	email: z.string().email("validation.auth.invalidEmail"),
	password: z.string().min(1, "validation.auth.passwordRequired"),
	accountId: z.string().uuid().optional(),
})

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "validation.auth.currentPasswordRequired"),
		newPassword: z
			.string()
			.min(8, "validation.auth.passwordMin")
			.regex(/[A-Z]/, "validation.auth.passwordUppercase")
			.regex(/[a-z]/, "validation.auth.passwordLowercase")
			.regex(/[0-9]/, "validation.auth.passwordNumber"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: "validation.auth.passwordsDoNotMatch",
		path: ["confirmPassword"],
	})

export const updateProfileSchema = z.object({
	name: z
		.string()
		.min(2, "validation.auth.nameMin")
		.max(255, "validation.auth.nameMax"),
	preferredLocale: z.enum(["en", "pt-BR"]).optional(),
	theme: z.enum(["dark", "light"]).optional(),
	dateFormat: z.string().optional(),
})

export const verifyEmailSchema = z.object({
	email: z.string().email("validation.auth.invalidEmail"),
	code: z.string().length(6, "validation.auth.codeLength").regex(/^\d+$/, "validation.auth.codeNumeric"),
})

export const requestVerificationSchema = z.object({
	email: z.string().email("validation.auth.invalidEmail"),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type RequestVerificationInput = z.infer<typeof requestVerificationSchema>
