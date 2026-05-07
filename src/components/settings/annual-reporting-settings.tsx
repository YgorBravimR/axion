"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { CurrencyInput } from "@/components/ui/currency-input"
import { useToast } from "@/components/ui/toast"
import {
	getAccountLifecycle,
	updateAccountLifecycle,
} from "@/app/actions/settings"

const AnnualReportingSettings = () => {
	const t = useTranslations("settings.profile")
	const locale = useLocale()
	const { showToast } = useToast()
	const [isLoading, setIsLoading] = useState(true)
	const [isPending, startTransition] = useTransition()

	const monthNames = useMemo(() => {
		const formatter = new Intl.DateTimeFormat(locale, { month: "long" })
		return Array.from({ length: 12 }, (_, i) => {
			const name = formatter.format(new Date(2000, i, 1))
			return name.charAt(0).toUpperCase() + name.slice(1)
		})
	}, [locale])

	const [startMonth, setStartMonth] = useState<number | null>(null)
	const [startYear, setStartYear] = useState<number | null>(null)
	const [startingBalanceCents, setStartingBalanceCents] = useState<
		number | null
	>(null)
	const [withdrawalTarget, setWithdrawalTarget] = useState<number | null>(null)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await getAccountLifecycle()
			if (!mounted) {
				return
			}
			if (result.status === "success" && result.data) {
				setStartMonth(result.data.accountStartMonth)
				setStartYear(result.data.accountStartYear)
				setStartingBalanceCents(result.data.startingBalanceCents)
				setWithdrawalTarget(result.data.withdrawalTargetPercent)
			}
			setIsLoading(false)
		}
		void load()
		return () => {
			mounted = false
		}
	}, [])

	const handleSave = () => {
		const cents =
			startingBalanceCents !== null ? Math.round(startingBalanceCents) : null

		startTransition(async () => {
			const result = await updateAccountLifecycle({
				accountStartMonth: startMonth,
				accountStartYear: startYear,
				startingBalanceCents: cents,
				withdrawalTargetPercent: withdrawalTarget,
			})
			if (result.status === "success") {
				showToast("success", t("annualSettingsSaved"))
			} else {
				showToast("error", result.message ?? t("annualSettingsSaveError"))
			}
		})
	}

	if (isLoading) {
		return null
	}

	const currentYear = new Date().getFullYear()

	return (
		<fieldset className="space-y-m-400 border-bg-300 p-m-400 rounded-md border">
			<legend className="text-txt-300 px-s-200 text-xs font-medium tracking-wider uppercase">
				{t("annualReporting")}
			</legend>

			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
				<div>
					<label
						htmlFor="account-start-month"
						className="mb-s-100 text-txt-300 block text-xs"
					>
						{t("accountStartMonth")}
					</label>
					<select
						id="account-start-month"
						value={startMonth ?? ""}
						onChange={(e) =>
							setStartMonth(e.target.value ? parseInt(e.target.value) : null)
						}
						className="border-bg-300 bg-bg-200 px-s-300 py-s-200 text-txt-100 focus:ring-acc-100 w-full rounded-md border text-sm focus:ring-1 focus:outline-none"
						aria-label={t("accountStartMonth")}
					>
						<option value="">{t("notSet")}</option>
						{monthNames.map((name, i) => (
							<option key={i + 1} value={i + 1}>
								{name}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="account-start-year"
						className="mb-s-100 text-txt-300 block text-xs"
					>
						{t("accountStartYear")}
					</label>
					<input
						id="account-start-year"
						type="number"
						min={2000}
						max={currentYear}
						value={startYear ?? ""}
						onChange={(e) =>
							setStartYear(e.target.value ? parseInt(e.target.value) : null)
						}
						className="border-bg-300 bg-bg-200 px-s-300 py-s-200 text-txt-100 focus:ring-acc-100 w-full rounded-md border font-mono text-sm focus:ring-1 focus:outline-none"
						aria-label={t("accountStartYear")}
						placeholder={t("yearPlaceholder")}
					/>
				</div>

				<div>
					<label
						htmlFor="starting-balance"
						className="mb-s-100 text-txt-300 block text-xs"
					>
						{t("openingBalance")}
					</label>
					<CurrencyInput
						id="starting-balance"
						value={startingBalanceCents}
						onValueChange={setStartingBalanceCents}
						decimals={2}
						unit="cents"
						aria-label={t("openingBalance")}
						placeholder={t("openingBalancePlaceholder")}
					/>
				</div>

				<div>
					<label
						htmlFor="withdrawal-target"
						className="mb-s-100 text-txt-300 block text-xs"
					>
						{t("monthlyWithdrawalTarget")}
					</label>
					<input
						id="withdrawal-target"
						type="number"
						min={0}
						max={100}
						step={0.01}
						value={withdrawalTarget ?? ""}
						onChange={(e) =>
							setWithdrawalTarget(
								e.target.value ? parseFloat(e.target.value) : null
							)
						}
						className="border-bg-300 bg-bg-200 px-s-300 py-s-200 text-txt-100 focus:ring-acc-100 w-full rounded-md border font-mono text-sm focus:ring-1 focus:outline-none"
						aria-label={t("monthlyWithdrawalTarget")}
						placeholder={t("monthlyWithdrawalTargetPlaceholder")}
					/>
				</div>
			</div>

			<button
				type="button"
				onClick={handleSave}
				disabled={isPending}
				className="bg-acc-100 px-m-400 py-s-200 text-bg-100 rounded-md text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{isPending ? t("saving") : t("saveAnnualSettings")}
			</button>
		</fieldset>
	)
}

export { AnnualReportingSettings }
