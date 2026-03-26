"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
	InputOTPSeparator,
} from "@/components/ui/input-otp"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import Image from "next/image"
import { Loader2, ArrowLeft, CheckCircle2, Mail } from "lucide-react"
import {
	requestEmailVerification,
	verifyEmail,
} from "@/app/actions/email-verification"

const RESEND_COOLDOWN_SECONDS = 60

const VerifyEmailForm = () => {
	const t = useTranslations("auth.verifyEmail")
	const router = useRouter()
	const searchParams = useSearchParams()
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [code, setCode] = useState("")
	const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS)
	const [verified, setVerified] = useState(false)

	const email = searchParams.get("email") ?? ""

	// Countdown timer for resend cooldown
	useEffect(() => {
		if (resendCooldown <= 0) return
		const timer = setInterval(() => {
			setResendCooldown((prev) => prev - 1)
		}, 1000)
		return () => clearInterval(timer)
	}, [resendCooldown])

	const handleVerify = (otpValue: string) => {
		if (otpValue.length !== 6 || !email) return

		setError(null)
		startTransition(async () => {
			const result = await verifyEmail({ email, code: otpValue })

			if (!result.success) {
				if (result.error === "INVALID_OR_EXPIRED") {
					setError(t("invalidCode"))
				} else {
					setError(result.error ?? t("invalidCode"))
				}
				setCode("")
				return
			}

			setVerified(true)
			// Redirect to login after 2 seconds
			setTimeout(() => {
				router.push("/login?verified=true")
			}, 2000)
		})
	}

	const handleResend = () => {
		if (resendCooldown > 0 || !email) return

		startTransition(async () => {
			const result = await requestEmailVerification({ email })

			if (!result.success && result.error) {
				setError(result.error)
				return
			}

			setResendCooldown(RESEND_COOLDOWN_SECONDS)
			setCode("")
			setError(null)
		})
	}

	// Success state
	if (verified) {
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

				<div className="flex flex-col items-center space-y-m-400 text-center">
					<CheckCircle2 className="h-12 w-12 text-fb-success" />
					<h1 className="text-h2 font-bold text-txt-100">{t("success")}</h1>
					<p className="text-small text-txt-300">{t("successMessage")}</p>
				</div>
			</div>
		)
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
				{email && (
					<p className="mt-s-200 text-small text-txt-200">
						{t("codeSentTo")} <span className="font-medium text-brand-500">{email}</span>
					</p>
				)}
			</div>

			<div className="space-y-m-400">
				{error && (
					<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
						{error}
					</div>
				)}

				{/* OTP Input */}
				<div className="flex justify-center">
					<InputOTP
						maxLength={6}
						pattern={REGEXP_ONLY_DIGITS}
						value={code}
						onChange={(value) => setCode(value)}
						onComplete={handleVerify}
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

				<Button
					id="verify-email-submit"
					onClick={() => handleVerify(code)}
					className="w-full"
					disabled={isPending || code.length !== 6}
				>
					{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{t("verify")}
				</Button>

				{/* Resend */}
				<div className="text-center">
					{resendCooldown > 0 ? (
						<p className="text-tiny text-txt-300">
							{t("resendIn", { seconds: resendCooldown })}
						</p>
					) : (
						<Button
							id="resend-verification"
							variant="link"
							size="sm"
							type="button"
							onClick={handleResend}
							disabled={isPending}
							className="text-tiny font-medium text-brand-500 hover:text-brand-400"
						>
							{t("resend")}
						</Button>
					)}
				</div>

				<Link
					href="/login"
					className="flex items-center justify-center gap-2 text-small text-txt-300 hover:text-txt-200"
				>
					<ArrowLeft className="h-4 w-4" />
					{t("backToLogin")}
				</Link>
			</div>
		</div>
	)
}

export { VerifyEmailForm }
