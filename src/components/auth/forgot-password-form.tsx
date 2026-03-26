"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
	InputOTPSeparator,
} from "@/components/ui/input-otp"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import Image from "next/image"
import { Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import {
	requestPasswordReset,
	verifyResetCode,
	resetPassword,
} from "@/app/actions/password-recovery"

type FormStep = "email" | "code" | "password"

const RESEND_COOLDOWN_SECONDS = 60

export const ForgotPasswordForm = () => {
	const t = useTranslations("forgotPassword")
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [step, setStep] = useState<FormStep>("email")
	const [email, setEmail] = useState("")
	const [code, setCode] = useState("")
	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [resendCooldown, setResendCooldown] = useState(0)

	// Countdown timer for resend cooldown
	useEffect(() => {
		if (resendCooldown <= 0) return
		const timer = setInterval(() => {
			setResendCooldown((prev) => prev - 1)
		}, 1000)
		return () => clearInterval(timer)
	}, [resendCooldown])

	// Step 1: Request OTP code
	const handleEmailSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)

		startTransition(async () => {
			const result = await requestPasswordReset({ email })
			if (result.success) {
				setStep("code")
				setResendCooldown(RESEND_COOLDOWN_SECONDS)
			}
		})
	}

	// Step 2: Verify OTP code
	const handleCodeVerify = useCallback(
		(currentCode: string) => {
			if (currentCode.length !== 6) return

			setError(null)
			startTransition(async () => {
				const result = await verifyResetCode({ email, code: currentCode })
				if (result.valid) {
					setStep("password")
				} else {
					setError(result.error ?? t("invalidCode"))
					setCode("")
				}
			})
		},
		[email, t]
	)

	// Auto-submit when OTP is complete
	const handleCodeChange = (value: string) => {
		setCode(value)
		if (value.length === 6) {
			handleCodeVerify(value)
		}
	}

	// Resend code
	const handleResend = () => {
		if (resendCooldown > 0) return
		setError(null)

		startTransition(async () => {
			await requestPasswordReset({ email })
			setResendCooldown(RESEND_COOLDOWN_SECONDS)
			setCode("")
		})
	}

	// Step 3: Set new password
	const handlePasswordSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)

		if (newPassword !== confirmPassword) {
			setError(t("passwordMismatch"))
			return
		}

		startTransition(async () => {
			const result = await resetPassword({ email, code, newPassword })
			if (result.success) {
				router.push("/login?reset=success")
			} else {
				setError(result.error ?? t("resetFailed"))
			}
		})
	}

	// Step 1: Email input
	if (step === "email") {
		return (
			<div className="w-full max-w-sm space-y-m-600">
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

				<form onSubmit={handleEmailSubmit} className="space-y-m-400">
					{error && (
						<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
							{error}
						</div>
					)}

					<div className="space-y-s-200">
						<Label id="label-reset-email" htmlFor="reset-email" required filled={!!email.trim()}>{t("emailLabel")}</Label>
						<Input
							id="reset-email"
							type="email"
							placeholder="email@example.com"
							value={email}
							onChange={(e) => {
								setEmail(e.target.value)
								setError(null)
							}}
							required
							autoComplete="email"
							disabled={isPending}
						/>
					</div>

					<Button id="forgot-send-code" type="submit" className="w-full" disabled={isPending}>
						{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{t("sendCode")}
					</Button>
				</form>

				<p className="text-center text-small text-txt-300">
					<Link
						href="/login"
						className="inline-flex items-center gap-1 font-medium text-brand-500 hover:text-brand-400"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						{t("backToLogin")}
					</Link>
				</p>
			</div>
		)
	}

	// Step 2: OTP verification
	if (step === "code") {
		return (
			<div className="w-full max-w-sm space-y-m-600">
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
					<h1 className="text-h2 font-bold text-txt-100">{t("codeTitle")}</h1>
					<p className="mt-s-200 text-small text-txt-300">
						{t("codeSentTo", { email })}
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
						{error}
					</div>
				)}

				<div className="flex justify-center">
					<InputOTP
						maxLength={6}
						pattern={REGEXP_ONLY_DIGITS}
						value={code}
						onChange={handleCodeChange}
						disabled={isPending}
						aria-label={t("codeLabel")}
					>
						<InputOTPGroup>
							<InputOTPSlot index={0} />
							<InputOTPSlot index={1} />
							<InputOTPSlot index={2} />
						</InputOTPGroup>
						<InputOTPSeparator />
						<InputOTPGroup>
							<InputOTPSlot index={3} />
							<InputOTPSlot index={4} />
							<InputOTPSlot index={5} />
						</InputOTPGroup>
					</InputOTP>
				</div>

				{isPending && (
					<div className="flex justify-center">
						<Loader2 className="h-5 w-5 animate-spin text-txt-300" />
					</div>
				)}

				<div className="text-center">
					<Button
						id="resend-code"
						variant="link"
						type="button"
						onClick={handleResend}
						disabled={resendCooldown > 0 || isPending}
						className="text-small text-brand-500 hover:text-brand-400"
					>
						{resendCooldown > 0
							? t("resendIn", { seconds: resendCooldown })
							: t("resend")}
					</Button>
				</div>

				<p className="text-center text-small text-txt-300">
					<Button
						id="back-to-email"
						variant="link"
						type="button"
						onClick={() => {
							setStep("email")
							setCode("")
							setError(null)
						}}
						className="inline-flex items-center gap-1 font-medium text-brand-500 hover:text-brand-400"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						{t("backToEmail")}
					</Button>
				</p>
			</div>
		)
	}

	// Step 3: New password
	return (
		<div className="w-full max-w-sm space-y-m-600">
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
				<CheckCircle2 className="mx-auto mb-s-300 h-10 w-10 text-fb-success" />
				<h1 className="text-h2 font-bold text-txt-100">{t("newPasswordTitle")}</h1>
				<p className="mt-s-200 text-small text-txt-300">{t("newPasswordSubtitle")}</p>
			</div>

			<form onSubmit={handlePasswordSubmit} className="space-y-m-400">
				{error && (
					<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
						{error}
					</div>
				)}

				<div className="space-y-s-200">
					<Label id="label-new-password" htmlFor="new-password" required filled={!!newPassword}>{t("newPassword")}</Label>
					<div className="relative">
						<Input
							id="new-password"
							type={showPassword ? "text" : "password"}
							value={newPassword}
							onChange={(e) => {
								setNewPassword(e.target.value)
								setError(null)
							}}
							required
							autoComplete="new-password"
							disabled={isPending}
							className="pr-10"
						/>
						<Button
							id="forgot-password-toggle"
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
				</div>

				<div className="space-y-s-200">
					<Label id="label-confirm-password" htmlFor="confirm-password" required filled={!!confirmPassword}>{t("confirmPassword")}</Label>
					<Input
						id="confirm-password"
						type={showPassword ? "text" : "password"}
						value={confirmPassword}
						onChange={(e) => {
							setConfirmPassword(e.target.value)
							setError(null)
						}}
						required
						autoComplete="new-password"
						disabled={isPending}
					/>
				</div>

				<Button id="forgot-reset-password" type="submit" className="w-full" disabled={isPending}>
					{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{t("resetButton")}
				</Button>
			</form>
		</div>
	)
}
