"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
	InputOTPSeparator,
} from "@/components/ui/input-otp"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import Image from "next/image"
import { CheckCircle2 } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { BackLink } from "@/components/ui/back-link"
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
	// Incremented each time a new cooldown period starts; used as the effect trigger.
	const [cooldownEpoch, setCooldownEpoch] = useState(0)
	const [verified, setVerified] = useState(false)

	const email = searchParams.get("email") ?? ""
	const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Countdown timer for resend cooldown — the interval is created once per cooldown
	// period (keyed on cooldownEpoch) and uses a functional state update so it doesn't
	// restart every second as resendCooldown decrements.
	useEffect(() => {
		if (resendCooldown <= 0) {
			return
		}
		const timer = setInterval(() => {
			setResendCooldown((prev) => {
				if (prev <= 1) {
					clearInterval(timer)
					return 0
				}
				return prev - 1
			})
		}, 1000)
		return () => clearInterval(timer)
	}, [cooldownEpoch])

	// Cleanup redirect timeout on unmount
	useEffect(() => {
		return () => {
			if (redirectTimeoutRef.current !== null) {
				clearTimeout(redirectTimeoutRef.current)
			}
		}
	}, [])

	const handleVerify = (otpValue: string) => {
		if (otpValue.length !== 6 || !email) {
			return
		}

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
			// Redirect to login after 2 seconds — stored in ref so it can be cleared on unmount
			redirectTimeoutRef.current = setTimeout(() => {
				router.push("/login?verified=true")
			}, 2000)
		})
	}

	const handleResend = () => {
		if (resendCooldown > 0 || !email) {
			return
		}

		startTransition(async () => {
			const result = await requestEmailVerification({ email })

			if (!result.success && result.error) {
				setError(result.error)
				return
			}

			setResendCooldown(RESEND_COOLDOWN_SECONDS)
			setCooldownEpoch((prev) => prev + 1)
			setCode("")
			setError(null)
		})
	}

	// Success state
	if (verified) {
		return (
			<div className="space-y-m-600 w-full max-w-sm md:max-w-md">
				<div className="flex justify-center">
					<Image
						src="/axion-wordmark-white.png"
						alt="Axion"
						width={200}
						height={57}
						className="h-14 w-auto object-contain"
						style={{ height: "auto" }}
						data-axion-logo="invertable"
						priority
					/>
				</div>

				<div className="space-y-m-400 flex flex-col items-center text-center">
					<CheckCircle2
						className="text-fb-success h-12 w-12"
						aria-hidden="true"
					/>
					<h1 className="text-h2 text-txt-100 font-bold">{t("success")}</h1>
					<p className="text-small text-txt-300">{t("successMessage")}</p>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-m-600 w-full max-w-sm md:max-w-md">
			{/* Logo */}
			<div className="flex justify-center">
				<Image
					src="/axion-wordmark-white.png"
					alt="Axion"
					width={200}
					height={57}
					className="h-14 w-auto object-contain"
					style={{ height: "auto" }}
					priority
				/>
			</div>

			<div className="text-center">
				<h1 className="text-h2 text-txt-100 font-bold">{t("title")}</h1>
				<p className="mt-s-200 text-small text-txt-300">{t("subtitle")}</p>
				{email && (
					<p className="mt-s-200 text-small text-txt-200">
						{t("codeSentTo")}{" "}
						<span className="text-acc-100 font-medium">{email}</span>
					</p>
				)}
			</div>

			<div className="space-y-m-400">
				{error && (
					<div
						role="alert"
						aria-live="polite"
						className="bg-fb-error/10 p-s-300 text-small text-fb-error rounded-md"
					>
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
					{isPending && <Spinner className="mr-s-200" size="md" />}
					{t("verify")}
				</Button>

				{/* Resend — always rendered so focus is never lost */}
				<div className="text-center">
					<Button
						id="resend-verification"
						variant="link"
						size="sm"
						type="button"
						onClick={handleResend}
						disabled={resendCooldown > 0 || isPending}
						className="text-tiny text-acc-100 hover:text-acc-100 font-medium"
					>
						{resendCooldown > 0
							? t("resendIn", { seconds: resendCooldown })
							: t("resend")}
					</Button>
				</div>

				<BackLink href="/login" className="text-small justify-center">
					{t("backToLogin")}
				</BackLink>
			</div>
		</div>
	)
}

export { VerifyEmailForm }
