"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useTranslations, useLocale } from "next-intl"
import { CurrencyInput } from "@/components/ui/currency-input"
import {
	getAccountLifecycle,
	updateAccountLifecycle,
} from "@/app/actions/settings"
import { useRegisterSettingsSection } from "./settings-save-bar"

interface AnnualForm {
	startMonth: number | null
	startYear: number | null
	startingBalanceCents: number | null
	withdrawalTarget: number | null
}

const EMPTY: AnnualForm = {
	startMonth: null,
	startYear: null,
	startingBalanceCents: null,
	withdrawalTarget: null,
}

const equal = (a: AnnualForm, b: AnnualForm) =>
	a.startMonth === b.startMonth &&
	a.startYear === b.startYear &&
	a.startingBalanceCents === b.startingBalanceCents &&
	a.withdrawalTarget === b.withdrawalTarget

const AnnualReportingSettings = () => {
	const t = useTranslations("settings.profile")
	const locale = useLocale()
	const [isLoading, setIsLoading] = useState(true)
	const [saved, setSaved] = useState<AnnualForm>(EMPTY)
	const [draft, setDraft] = useState<AnnualForm>(EMPTY)

	const monthNames = useMemo(() => {
		const formatter = new Intl.DateTimeFormat(locale, { month: "long" })
		return Array.from({ length: 12 }, (_, i) => {
			const name = formatter.format(new Date(2000, i, 1))
			return name.charAt(0).toUpperCase() + name.slice(1)
		})
	}, [locale])

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const result = await getAccountLifecycle()
			if (!mounted) {
				return
			}
			if (result.status === "success" && result.data) {
				const next: AnnualForm = {
					startMonth: result.data.accountStartMonth,
					startYear: result.data.accountStartYear,
					startingBalanceCents: result.data.startingBalanceCents,
					withdrawalTarget: result.data.withdrawalTargetPercent,
				}
				setSaved(next)
				setDraft(next)
			}
			setIsLoading(false)
		}
		void load()
		return () => {
			mounted = false
		}
	}, [])

	const isDirty = !equal(draft, saved)

	const handleSave = useCallback(async () => {
		const cents =
			draft.startingBalanceCents !== null
				? Math.round(draft.startingBalanceCents)
				: null
		const result = await updateAccountLifecycle({
			accountStartMonth: draft.startMonth,
			accountStartYear: draft.startYear,
			startingBalanceCents: cents,
			withdrawalTargetPercent: draft.withdrawalTarget,
		})
		if (result.status === "success") {
			setSaved(draft)
			return
		}
		throw new Error(result.message ?? t("annualSettingsSaveError"))
	}, [draft, t])

	const handleReset = useCallback(() => {
		setDraft(saved)
	}, [saved])

	useRegisterSettingsSection({
		id: "annual-reporting",
		label: t("annualReporting"),
		isDirty,
		onSave: handleSave,
		onReset: handleReset,
	})

	if (isLoading) {
		return null
	}

	const currentYear = new Date().getFullYear()

	return (
		<fieldset className="space-y-m-400 border-bg-300 p-m-400 rounded-md border">
			<legend className="text-txt-300 px-s-200 text-tiny font-medium tracking-wider uppercase">
				{t("annualReporting")}
			</legend>

			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
				<div>
					<label
						htmlFor="account-start-month"
						className="mb-s-100 text-txt-300 text-tiny block"
					>
						{t("accountStartMonth")}
					</label>
					<select
						id="account-start-month"
						value={draft.startMonth ?? ""}
						onChange={(e) =>
							setDraft((prev) => ({
								...prev,
								startMonth: e.target.value ? parseInt(e.target.value) : null,
							}))
						}
						className="border-bg-300 bg-bg-200 px-s-300 py-s-200 text-txt-100 focus:ring-acc-100 text-small w-full rounded-md border focus:ring-1 focus:outline-none"
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
						className="mb-s-100 text-txt-300 text-tiny block"
					>
						{t("accountStartYear")}
					</label>
					<input
						id="account-start-year"
						type="number"
						min={2000}
						max={currentYear}
						value={draft.startYear ?? ""}
						onChange={(e) =>
							setDraft((prev) => ({
								...prev,
								startYear: e.target.value ? parseInt(e.target.value) : null,
							}))
						}
						className="border-bg-300 bg-bg-200 px-s-300 py-s-200 text-txt-100 focus:ring-acc-100 text-small w-full rounded-md border font-mono focus:ring-1 focus:outline-none"
						aria-label={t("accountStartYear")}
						placeholder={t("yearPlaceholder")}
					/>
				</div>

				<div>
					<label
						htmlFor="starting-balance"
						className="mb-s-100 text-txt-300 text-tiny block"
					>
						{t("openingBalance")}
					</label>
					<CurrencyInput
						id="starting-balance"
						value={draft.startingBalanceCents}
						onValueChange={(v) =>
							setDraft((prev) => ({ ...prev, startingBalanceCents: v }))
						}
						decimals={2}
						unit="cents"
						aria-label={t("openingBalance")}
						placeholder={t("openingBalancePlaceholder")}
					/>
				</div>

				<div>
					<label
						htmlFor="withdrawal-target"
						className="mb-s-100 text-txt-300 text-tiny block"
					>
						{t("monthlyWithdrawalTarget")}
					</label>
					<input
						id="withdrawal-target"
						type="number"
						min={0}
						max={100}
						step={0.01}
						value={draft.withdrawalTarget ?? ""}
						onChange={(e) =>
							setDraft((prev) => ({
								...prev,
								withdrawalTarget: e.target.value
									? parseFloat(e.target.value)
									: null,
							}))
						}
						className="border-bg-300 bg-bg-200 px-s-300 py-s-200 text-txt-100 focus:ring-acc-100 text-small w-full rounded-md border font-mono focus:ring-1 focus:outline-none"
						aria-label={t("monthlyWithdrawalTarget")}
						placeholder={t("monthlyWithdrawalTargetPlaceholder")}
					/>
				</div>
			</div>
		</fieldset>
	)
}

export { AnnualReportingSettings }
