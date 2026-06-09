"use client"

import type { FormEvent } from "react"
import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { signIn } from "next-auth/react"
import { Link, useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { Eye, EyeOff, Building2, User, ArrowLeft, Mail } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { loginUser } from "@/app/actions/auth"
import { requestEmailVerification } from "@/app/actions/email-verification"
import { cn } from "@/lib/utils"
interface AccountPickerItem {
	id: string
	name: string
	accountType: string
	isDefault: boolean
	todayPnl: number | null
	sparkline: number[] | null
}

const PICKER_SPARK_WIDTH = 80
const PICKER_SPARK_HEIGHT = 24

interface PickerSparklineProps {
	points: number[]
}

/**
 * Tiny pre-session sparkline rendered inside each account-picker row.
 * Tone follows the slope of the last vs first sample so the user reads
 * "trending up" / "trending down" without needing numeric annotations.
 */
const PickerSparkline = ({ points }: PickerSparklineProps) => {
	if (points.length < 2) {
		return null
	}
	const min = Math.min(...points)
	const max = Math.max(...points)
	const range = max - min || 1
	const innerW = PICKER_SPARK_WIDTH - 2
	const innerH = PICKER_SPARK_HEIGHT - 2
	const xy = points.map((v, i) => {
		const x = 1 + (i / (points.length - 1)) * innerW
		const y = 1 + innerH - ((v - min) / range) * innerH
		return { x, y }
	})
	const path = xy
		.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
		.join(" ")
	const lastPoint = points[points.length - 1] ?? 0
	const firstPoint = points[0] ?? 0
	const toneClass =
		lastPoint > firstPoint
			? "text-trade-buy"
			: lastPoint < firstPoint
				? "text-trade-sell"
				: "text-txt-300"
	return (
		<svg
			viewBox={`0 0 ${PICKER_SPARK_WIDTH} ${PICKER_SPARK_HEIGHT}`}
			width={PICKER_SPARK_WIDTH}
			height={PICKER_SPARK_HEIGHT}
			className={cn("shrink-0", toneClass)}
			aria-hidden="true"
			preserveAspectRatio="none"
		>
			<path
				d={path}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	)
}

const formatCompactBrlSigned = (value: number): string => {
	const abs = Math.abs(value)
	const fmt =
		abs >= 1000 ? `R$ ${(abs / 1000).toFixed(1)}K` : `R$ ${abs.toFixed(0)}`
	if (value > 0) {
		return `+${fmt}`
	}
	if (value < 0) {
		return `-${fmt}`
	}
	return fmt
}

interface LoginFormProps {
	callbackUrl?: string
}

type FormStep = "credentials" | "account-selection"

const LoginForm = ({ callbackUrl = "/" }: LoginFormProps) => {
	const t = useTranslations("auth.login")
	const tSelect = useTranslations("auth.selectAccount")
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [showPassword, setShowPassword] = useState(false)

	// Multi-step form state
	const [step, setStep] = useState<FormStep>("credentials")
	const [accounts, setAccounts] = useState<AccountPickerItem[]>([])
	const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
		null
	)

	const [emailNotVerified, setEmailNotVerified] = useState(false)
	const [resendingVerification, setResendingVerification] = useState(false)

	const [formData, setFormData] = useState({
		email: "",
		password: "",
	})

	const handleChange = (field: "email" | "password", value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
		setError(null)
		setEmailNotVerified(false)
	}

	const handleResendVerification = async () => {
		setResendingVerification(true)
		await requestEmailVerification({ email: formData.email })
		setResendingVerification(false)
		router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`)
	}

	const handleCredentialsSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)
		setEmailNotVerified(false)

		startTransition(async () => {
			try {
				const result = await loginUser({
					email: formData.email,
					password: formData.password,
				})

				if (result.status === "error") {
					if (result.error === "EMAIL_NOT_VERIFIED") {
						setEmailNotVerified(true)
						return
					}
					setError(result.error ?? t("invalidCredentials"))
					return
				}

				// If user has multiple accounts, show account picker
				if (result.needsAccountSelection && result.accounts) {
					setAccounts(result.accounts)
					const defaultAccount = result.accounts.find((a) => a.isDefault)
					setSelectedAccountId(
						defaultAccount?.id || result.accounts[0]?.id || null
					)
					setStep("account-selection")
					return
				}

				// Single account - already signed in by loginUser
				router.push(callbackUrl)
				router.refresh()
			} catch {
				setError(t("invalidCredentials"))
			}
		})
	}

	const handleAccountSelect = () => {
		if (!selectedAccountId) {
			return
		}

		startTransition(async () => {
			try {
				const result = await signIn("credentials", {
					email: formData.email,
					password: formData.password,
					accountId: selectedAccountId,
					redirect: false,
				})

				if (result?.error) {
					setError(t("invalidCredentials"))
					return
				}

				router.push(callbackUrl)
				router.refresh()
			} catch {
				setError(t("invalidCredentials"))
			}
		})
	}

	const handleBackToCredentials = () => {
		setStep("credentials")
		setAccounts([])
		setSelectedAccountId(null)
		setError(null)
	}

	// Account selection step
	if (step === "account-selection") {
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
						data-axion-logo="invertable"
						priority
					/>
				</div>

				<div className="text-center">
					<h1 className="text-h2 text-txt-100 font-bold">{tSelect("title")}</h1>
					<p className="mt-s-200 text-small text-txt-300">
						{tSelect("subtitle")}
					</p>
				</div>

				{error && (
					<div
						role="alert"
						aria-live="assertive"
						className="bg-fb-error/10 p-s-300 text-small text-fb-error rounded-md"
					>
						{error}
					</div>
				)}

				<div className="space-y-s-300">
					{accounts.map((account) => {
						// "Personal personal" is visually redundant — when the row's
						// display name already includes the accountType label
						// (case-insensitive), suppress the type chip so the row reads
						// as a single noun instead of a duplicated pair.
						const typeLabel = account.accountType
						const nameContainsType = account.name
							.toLowerCase()
							.includes(typeLabel.toLowerCase())
						return (
							<button
								key={account.id}
								type="button"
								onClick={() => setSelectedAccountId(account.id)}
								disabled={isPending}
								className={cn(
									"gap-m-400 p-m-400 flex w-full items-center rounded-lg border text-left transition-colors",
									selectedAccountId === account.id
										? "border-acc-100 bg-acc-100/10"
										: "border-bg-300 bg-bg-200 hover:border-bg-400",
									isPending && "cursor-not-allowed opacity-50"
								)}
							>
								<div
									className={cn(
										"flex h-10 w-10 items-center justify-center rounded-lg",
										account.accountType === "prop"
											? "bg-acc-100/20 text-acc-100"
											: "bg-txt-300/20 text-txt-200"
									)}
								>
									{account.accountType === "prop" ? (
										<Building2 className="h-5 w-5" aria-hidden="true" />
									) : (
										<User className="h-5 w-5" aria-hidden="true" />
									)}
								</div>

								<div className="min-w-0 flex-1">
									<div className="gap-s-200 flex items-center">
										<p className="text-txt-100 truncate font-medium">
											{account.name}
										</p>
										{account.isDefault && (
											<span className="bg-acc-100/15 text-acc-100 text-micro px-s-200 shrink-0 rounded-full py-0.5 font-medium">
												{tSelect("defaultBadge")}
											</span>
										)}
									</div>
									<div className="gap-s-200 mt-s-100 flex items-center">
										{!nameContainsType && (
											<span className="text-tiny text-txt-300 shrink-0 capitalize">
												{typeLabel}
											</span>
										)}
										{account.todayPnl !== null && (
											<>
												{!nameContainsType && (
													<span aria-hidden="true" className="text-txt-300">
														·
													</span>
												)}
												<span
													className={cn(
														"text-tiny shrink-0 font-medium tabular-nums",
														account.todayPnl > 0 && "text-trade-buy",
														account.todayPnl < 0 && "text-trade-sell",
														account.todayPnl === 0 && "text-txt-300"
													)}
												>
													{tSelect("todayLabel")}{" "}
													{formatCompactBrlSigned(account.todayPnl)}
												</span>
											</>
										)}
									</div>
								</div>

								{account.sparkline && account.sparkline.length >= 2 && (
									<div className="hidden shrink-0 sm:block">
										<PickerSparkline points={account.sparkline} />
									</div>
								)}

								<div
									className={cn(
										"h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
										selectedAccountId === account.id
											? "border-acc-100 bg-acc-100"
											: "border-bg-400"
									)}
								>
									{selectedAccountId === account.id && (
										<div className="flex h-full w-full items-center justify-center">
											<div className="bg-bg-100 h-2 w-2 rounded-full" />
										</div>
									)}
								</div>
							</button>
						)
					})}
				</div>

				<div className="space-y-s-300">
					<Button
						id="login-account-select-continue"
						onClick={handleAccountSelect}
						className="w-full"
						disabled={!selectedAccountId || isPending}
					>
						{isPending && <Spinner className="mr-s-200" size="md" />}
						{tSelect("continue")}
					</Button>

					<Button
						id="back-to-login"
						variant="link"
						type="button"
						onClick={handleBackToCredentials}
						disabled={isPending}
						aria-label={tSelect("backToLogin")}
						className="text-small text-txt-300 hover:text-txt-200 gap-s-200 flex w-full items-center justify-center"
					>
						<ArrowLeft className="h-4 w-4" aria-hidden="true" />
						{tSelect("backToLogin")}
					</Button>
				</div>
			</div>
		)
	}

	// Credentials step
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
					data-axion-logo="invertable"
					priority
				/>
			</div>

			<div className="text-center">
				<h1 className="text-h2 text-txt-100 font-bold">{t("title")}</h1>
				<p className="mt-s-200 text-small text-txt-300">{t("subtitle")}</p>
			</div>

			<form onSubmit={handleCredentialsSubmit} className="space-y-m-400">
				{error && (
					<div
						role="alert"
						aria-live="assertive"
						className="bg-fb-error/10 p-s-300 text-small text-fb-error rounded-md"
					>
						{error}
					</div>
				)}

				{emailNotVerified && (
					<div className="border-acc-100/30 bg-acc-100/10 p-m-400 space-y-s-300 rounded-md border">
						<div className="gap-s-200 flex items-center">
							<Mail className="text-acc-100 h-4 w-4" aria-hidden="true" />
							<p className="text-small text-txt-100 font-medium">
								{t("notVerifiedError")}
							</p>
						</div>
						<p className="text-tiny text-txt-300">{t("notVerifiedMessage")}</p>
						<Button
							id="login-resend-verification"
							type="button"
							variant="outline"
							size="sm"
							onClick={handleResendVerification}
							disabled={resendingVerification}
							className="w-full"
						>
							{resendingVerification && (
								<Spinner className="mr-s-200" size="sm" />
							)}
							{t("resendVerification")}
						</Button>
					</div>
				)}

				<div className="space-y-s-200">
					<Label
						id="label-email"
						htmlFor="email"
						required
						filled={!!formData.email.trim()}
					>
						{t("email")}
					</Label>
					<Input
						id="email"
						type="email"
						placeholder="email@example.com"
						value={formData.email}
						onChange={(e) => handleChange("email", e.target.value)}
						required
						autoComplete="email"
						autoFocus
						disabled={isPending}
					/>
				</div>

				<div className="space-y-s-200">
					<Label
						id="label-password"
						htmlFor="password"
						required
						filled={!!formData.password}
					>
						{t("password")}
					</Label>
					<div className="relative">
						<Input
							id="password"
							type={showPassword ? "text" : "password"}
							value={formData.password}
							onChange={(e) => handleChange("password", e.target.value)}
							required
							autoComplete="current-password"
							disabled={isPending}
							className="pr-10"
						/>
						<Button
							id="login-password-toggle"
							variant="ghost"
							size="icon"
							type="button"
							onClick={() => setShowPassword(!showPassword)}
							className="text-txt-300 hover:text-txt-200 absolute top-1/2 right-1 h-11 min-h-11 w-11 min-w-11 -translate-y-1/2"
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

				<div className="flex justify-end">
					<Link
						href="/forgot-password"
						className="text-tiny text-acc-100 hover:text-acc-100 font-medium"
					>
						{t("forgotPassword")}
					</Link>
				</div>

				<Button
					id="login-submit"
					type="submit"
					className="h-11 w-full"
					disabled={isPending}
				>
					{isPending && <Spinner className="mr-s-200" size="md" />}
					{t("submit")}
				</Button>
			</form>

			<p className="text-small text-txt-300 text-center">
				{t("noAccount")}{" "}
				<Link
					href="/register"
					className="text-acc-100 hover:text-acc-100 font-medium"
				>
					{t("register")}
				</Link>
			</p>
		</div>
	)
}

export { LoginForm }
