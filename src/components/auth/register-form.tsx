"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react"
import { registerUser } from "@/app/actions/auth"
import { cn } from "@/lib/utils"

const RegisterForm = () => {
	const t = useTranslations("auth.register")
	const tReq = useTranslations("auth.passwordRequirements")
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)

	const [formData, setFormData] = useState({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
	})

	const handleChange = (field: "name" | "email" | "password" | "confirmPassword", value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
		setError(null)
	}

	// Password requirements
	const passwordRequirements = [
		{ key: "length", test: formData.password.length >= 8, label: tReq("length") },
		{ key: "uppercase", test: /[A-Z]/.test(formData.password), label: tReq("uppercase") },
		{ key: "lowercase", test: /[a-z]/.test(formData.password), label: tReq("lowercase") },
		{ key: "number", test: /[0-9]/.test(formData.password), label: tReq("number") },
	]

	const allRequirementsMet = passwordRequirements.every((req) => req.test)
	const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)

		if (!allRequirementsMet) {
			setError(t("passwordNotMeetRequirements"))
			return
		}

		if (!passwordsMatch) {
			setError(t("passwordsDoNotMatch"))
			return
		}

		startTransition(async () => {
			const result = await registerUser(formData)

			if (result.status === "error") {
				setError(result.error ?? t("genericError"))
				return
			}

			// Redirect to email verification page
			if (result.needsVerification) {
				router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`)
				return
			}

			// Fallback: redirect to login
			router.push("/login?registered=true")
		})
	}

	return (
		<div className="w-full max-w-sm space-y-m-600">
			{/* Logo */}
			<div className="flex justify-center">
				<Image
					src="/axion-wordmark-white.png"
					alt="Axion"
					width={200}
					height={57}
					className="h-14 w-auto object-contain"
					priority
				/>
			</div>

			<div className="text-center">
				<h1 className="text-h2 font-bold text-txt-100">{t("title")}</h1>
				<p className="mt-s-200 text-small text-txt-300">{t("subtitle")}</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-m-400">
				{error && (
					<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
						{error}
					</div>
				)}

				<div className="space-y-s-200">
					<Label id="label-name" htmlFor="name" required filled={!!formData.name.trim()}>{t("name")}</Label>
					<Input
						id="name"
						type="text"
						placeholder={t("namePlaceholder")}
						value={formData.name}
						onChange={(e) => handleChange("name", e.target.value)}
						required
						autoComplete="name"
						disabled={isPending}
					/>
				</div>

				<div className="space-y-s-200">
					<Label id="label-email" htmlFor="email" required filled={!!formData.email.trim()}>{t("email")}</Label>
					<Input
						id="email"
						type="email"
						placeholder="email@example.com"
						value={formData.email}
						onChange={(e) => handleChange("email", e.target.value)}
						required
						autoComplete="email"
						disabled={isPending}
					/>
				</div>

				<div className="space-y-s-200">
					<Label id="label-password" htmlFor="password" required filled={!!formData.password}>{t("password")}</Label>
					<div className="relative">
						<Input
							id="password"
							type={showPassword ? "text" : "password"}
							value={formData.password}
							onChange={(e) => handleChange("password", e.target.value)}
							required
							autoComplete="new-password"
							disabled={isPending}
							className="pr-10"
						/>
						<Button
							id="register-password-toggle"
							variant="ghost"
							size="icon"
							type="button"
							onClick={() => setShowPassword(!showPassword)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-300 hover:text-txt-200"
							aria-label={showPassword ? t("hidePassword") : t("showPassword")}
						>
							{showPassword ? (
								<EyeOff className="h-4 w-4" aria-hidden="true" />
							) : (
								<Eye className="h-4 w-4" aria-hidden="true" />
							)}
						</Button>
					</div>

					{/* Password requirements */}
					{formData.password.length > 0 && (
						<div className="mt-s-200 space-y-s-100">
							{passwordRequirements.map((req) => (
								<div
									key={req.key}
									className={cn(
										"flex items-center gap-s-200 text-tiny",
										req.test ? "text-fb-success" : "text-txt-300"
									)}
								>
									{req.test ? (
										<Check className="h-3 w-3" aria-hidden="true" />
									) : (
										<X className="h-3 w-3" aria-hidden="true" />
									)}
									{req.label}
								</div>
							))}
						</div>
					)}
				</div>

				<div className="space-y-s-200">
					<Label id="label-confirm-password" htmlFor="confirmPassword" required filled={!!formData.confirmPassword}>{t("confirmPassword")}</Label>
					<div className="relative">
						<Input
							id="confirmPassword"
							type={showConfirmPassword ? "text" : "password"}
							value={formData.confirmPassword}
							onChange={(e) => handleChange("confirmPassword", e.target.value)}
							required
							autoComplete="new-password"
							disabled={isPending}
							className="pr-10"
						/>
						<Button
							id="register-confirm-password-toggle"
							variant="ghost"
							size="icon"
							type="button"
							onClick={() => setShowConfirmPassword(!showConfirmPassword)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-300 hover:text-txt-200"
							aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}
						>
							{showConfirmPassword ? (
								<EyeOff className="h-4 w-4" aria-hidden="true" />
							) : (
								<Eye className="h-4 w-4" aria-hidden="true" />
							)}
						</Button>
					</div>
					{formData.confirmPassword.length > 0 && !passwordsMatch && (
						<p className="text-tiny text-fb-error">{t("passwordsDoNotMatch")}</p>
					)}
				</div>

				<Button
				id="register-submit"
					type="submit"
					className="w-full"
					disabled={isPending || !allRequirementsMet || !passwordsMatch}
				>
					{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{t("submit")}
				</Button>
			</form>

			<p className="text-center text-small text-txt-300">
				{t("hasAccount")}{" "}
				<Link
					href="/login"
					className="font-medium text-brand-500 hover:text-brand-400"
				>
					{t("login")}
				</Link>
			</p>
		</div>
	)
}

export { RegisterForm }
