"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Loader2, Building2, User } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TradingAccount } from "@/db/schema"

interface AccountPickerProps {
	accounts: TradingAccount[]
	email: string
	password: string
}

export const AccountPicker = ({ accounts, email, password }: AccountPickerProps) => {
	const t = useTranslations("auth.selectAccount")
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [selectedId, setSelectedId] = useState<string | null>(
		accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || null
	)

	const handleContinue = () => {
		if (!selectedId) return

		startTransition(async () => {
			const result = await signIn("credentials", {
				email,
				password,
				accountId: selectedId,
				redirect: false,
			})

			if (!result?.error) {
				router.push("/")
				router.refresh()
			}
		})
	}

	return (
		<div className="w-full max-w-sm space-y-m-600">
			<div className="text-center">
				<h1 className="text-h2 font-bold text-txt-100">{t("title")}</h1>
				<p className="mt-s-200 text-small text-txt-300">{t("subtitle")}</p>
			</div>

			<div className="space-y-s-300">
				{accounts.map((account) => (
					<button
						key={account.id}
						type="button"
						onClick={() => setSelectedId(account.id)}
						className={cn(
							"flex w-full items-center gap-m-400 rounded-lg border p-m-400 text-left transition-colors",
							selectedId === account.id
								? "border-brand-500 bg-brand-500/10"
								: "border-bg-300 bg-bg-200 hover:border-bg-400"
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
								<Building2 className="h-5 w-5" />
							) : (
								<User className="h-5 w-5" />
							)}
						</div>

						<div className="flex-1">
							<p className="font-medium text-txt-100">{account.name}</p>
							{account.accountType === "prop" && account.propFirmName && (
								<p className="text-tiny text-txt-300">
									{account.propFirmName}
								</p>
							)}
							<p className="text-tiny text-txt-300">
								{t("profitShare", {
									percentage: account.profitSharePercentage,
								})}
							</p>
						</div>

						<div
							className={cn(
								"h-5 w-5 rounded-full border-2 transition-colors",
								selectedId === account.id
									? "border-brand-500 bg-brand-500"
									: "border-bg-400"
							)}
						>
							{selectedId === account.id && (
								<div className="flex h-full w-full items-center justify-center">
									<div className="h-2 w-2 rounded-full bg-bg-100" />
								</div>
							)}
						</div>
					</button>
				))}
			</div>

			<Button
			id="auth-account-picker-continue"
				onClick={handleContinue}
				className="w-full"
				disabled={!selectedId || isPending}
			>
				{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
				{t("continue")}
			</Button>
		</div>
	)
}
