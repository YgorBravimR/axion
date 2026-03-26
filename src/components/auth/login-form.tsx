"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { signIn } from "next-auth/react"
import { Link, useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { Loader2, Eye, EyeOff, Building2, User, ArrowLeft, Mail } from "lucide-react"
import { loginUser } from "@/app/actions/auth"
import { requestEmailVerification } from "@/app/actions/email-verification"
import { cn } from "@/lib/utils"
interface AccountPickerItem {
	id: string
	name: string
	accountType: string
	isDefault: boolean
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
	const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

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

	const handleCredentialsSubmit = (e: React.FormEvent) => {
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
					setSelectedAccountId(defaultAccount?.id || result.accounts[0]?.id || null)
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
		if (!selectedAccountId) return

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
					<h1 className="text-h2 font-bold text-txt-100">{tSelect("title")}</h1>
					<p className="mt-s-200 text-small text-txt-300">{tSelect("subtitle")}</p>
				</div>

				{error && (
					<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
						{error}
					</div>
				)}

				<div className="space-y-s-300">
					{accounts.map((account) => (
						<button
							key={account.id}
							type="button"
							onClick={() => setSelectedAccountId(account.id)}
							disabled={isPending}
							className={cn(
								"flex w-full items-center gap-m-400 rounded-lg border p-m-400 text-left transition-colors",
								selectedAccountId === account.id
									? "border-brand-500 bg-brand-500/10"
									: "border-bg-300 bg-bg-200 hover:border-bg-400",
								isPending && "opacity-50 cursor-not-allowed"
							)}
						>
							<div
								className={cn(
									"flex h-10 w-10 items-center justify-center rounded-lg",
									account.accountType === "prop"
										? "bg-brand-500/20 text-brand-500"
										: "bg-txt-300/20 text-txt-200"
								)}
							>
								{account.accountType === "prop" ? (
									<Building2 className="h-5 w-5" aria-hidden="true" />
								) : (
									<User className="h-5 w-5" aria-hidden="true" />
								)}
							</div>

							<div className="flex-1">
								<p className="font-medium text-txt-100">{account.name}</p>
								<p className="text-tiny capitalize text-txt-300">
									{account.accountType}
								</p>
							</div>

							<div
								className={cn(
									"h-5 w-5 rounded-full border-2 transition-colors",
									selectedAccountId === account.id
										? "border-brand-500 bg-brand-500"
										: "border-bg-400"
								)}
							>
								{selectedAccountId === account.id && (
									<div className="flex h-full w-full items-center justify-center">
										<div className="h-2 w-2 rounded-full bg-white" />
									</div>
								)}
							</div>
						</button>
					))}
				</div>

				<div className="space-y-s-300">
					<Button
				id="login-account-select-continue"
						onClick={handleAccountSelect}
						className="w-full"
						disabled={!selectedAccountId || isPending}
					>
						{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{tSelect("continue")}
					</Button>

					<Button
						id="back-to-login"
						variant="link"
						type="button"
						onClick={handleBackToCredentials}
						disabled={isPending}
						aria-label={tSelect("backToLogin")}
						className="flex w-full items-center justify-center gap-2 text-small text-txt-300 hover:text-txt-200"
					>
						<ArrowLeft className="h-4 w-4" />
						{tSelect("backToLogin")}
					</Button>
				</div>
			</div>
		)
	}

	// Credentials step
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

			<form onSubmit={handleCredentialsSubmit} className="space-y-m-400">
				{error && (
					<div className="rounded-md bg-fb-error/10 p-s-300 text-small text-fb-error">
						{error}
					</div>
				)}

				{emailNotVerified && (
					<div className="rounded-md border border-brand-500/30 bg-brand-500/10 p-m-400 space-y-s-300">
						<div className="flex items-center gap-s-200">
							<Mail className="h-4 w-4 text-brand-500" />
							<p className="text-small font-medium text-txt-100">
								{t("notVerifiedError")}
							</p>
						</div>
						<p className="text-tiny text-txt-300">
							{t("notVerifiedMessage")}
						</p>
						<Button
							id="login-resend-verification"
							type="button"
							variant="outline"
							size="sm"
							onClick={handleResendVerification}
							disabled={resendingVerification}
							className="w-full"
						>
							{resendingVerification && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
							{t("resendVerification")}
						</Button>
					</div>
				)}

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

				<div className="flex justify-end">
						<Link
							href="/forgot-password"
							className="text-tiny font-medium text-brand-500 hover:text-brand-400"
						>
							{t("forgotPassword")}
						</Link>
					</div>

				<Button id="login-submit" type="submit" className="w-full" disabled={isPending}>
					{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{t("submit")}
				</Button>
			</form>

			<p className="text-center text-small text-txt-300">
				{t("noAccount")}{" "}
				<Link
					href="/register"
					className="font-medium text-brand-500 hover:text-brand-400"
				>
					{t("register")}
				</Link>
			</p>
		</div>
	)
}

export { LoginForm }
