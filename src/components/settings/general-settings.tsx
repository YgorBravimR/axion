"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { RecalculateButton } from "@/components/settings/recalculate-button"
import { LanguageSwitcher } from "@/components/settings/language-switcher"
import { TradingAccountSettings } from "@/components/settings/trading-account-settings"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/routing"
import { getRiskSettings, updateRiskSettings } from "@/app/actions/settings"
import { useToast } from "@/components/ui/toast"
import { useFormatting } from "@/hooks/use-formatting"

interface RiskSettingsState {
	accountBalance: number
}

export const GeneralSettings = () => {
	const t = useTranslations("settings.general")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const { formatCurrency } = useFormatting()
	const [isPending, startTransition] = useTransition()
	const [isEditing, setIsEditing] = useState(false)
	const [settings, setSettings] = useState<RiskSettingsState>({
		accountBalance: 10000,
	})
	const [editValues, setEditValues] = useState<RiskSettingsState>({
		accountBalance: 10000,
	})

	useEffect(() => {
		let mounted = true
		const loadSettings = async () => {
			const result = await getRiskSettings()
			if (!mounted) {
				return
			}
			if (result.status === "success" && result.data) {
				setSettings(result.data)
				setEditValues(result.data)
			}
		}
		void loadSettings()
		return () => {
			mounted = false
		}
	}, [])

	const handleEdit = () => {
		setEditValues(settings)
		setIsEditing(true)
	}

	const handleCancel = () => {
		setEditValues(settings)
		setIsEditing(false)
	}

	const handleSave = () => {
		startTransition(async () => {
			const result = await updateRiskSettings(editValues)
			if (result.status === "success" && result.data) {
				setSettings(result.data)
				setIsEditing(false)
				showToast("success", t("settingsUpdated"))
			} else {
				showToast("error", result.message || t("settingsUpdateFailed"))
			}
		})
	}

	return (
		<div className="space-y-m-600 mx-auto max-w-2xl">
			{/* Appearance */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">{t("title")}</h2>
				<div className="mt-m-400 space-y-m-500">
					{/* Theme */}
					<div className="flex items-center justify-between">
						<div>
							<p className="text-small text-txt-100">{t("theme")}</p>
							<p className="text-tiny text-txt-300">
								{t("themeLight")} / {t("themeDark")}
							</p>
						</div>
						<ThemeToggle />
					</div>
					{/* Language */}
					<div className="flex items-center justify-between">
						<div>
							<p className="text-small text-txt-100">{t("language")}</p>
							<p className="text-tiny text-txt-300">{t("languageDesc")}</p>
						</div>
						<LanguageSwitcher />
					</div>
				</div>
			</div>

			{/* Risk Settings */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="flex items-center justify-between">
					<h2 className="text-body text-txt-100 font-semibold">
						{t("riskSettings")}
					</h2>
					{!isEditing && (
						<Button
							id="general-edit-risk"
							variant="ghost"
							size="default"
							className="min-h-11"
							onClick={handleEdit}
						>
							{tCommon("edit")}
						</Button>
					)}
				</div>
				<div className="mt-m-400 space-y-m-400">
					<p className="text-tiny text-txt-300">
						{t("riskInPlanHint")}{" "}
						<Link href="/" className="text-acc-100 hover:underline">
							{t("openPlans")}
						</Link>
					</p>
					<div className="gap-m-400 flex items-center justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("accountBalance")}</p>
							<p className="text-tiny text-txt-300">
								{t("accountBalanceDesc")}
							</p>
						</div>
						{isEditing ? (
							<div className="gap-s-200 flex items-center">
								<span className="text-small text-txt-300">$</span>
								<Input
									id="general-accountBalance"
									type="number"
									step="100"
									min="0"
									value={editValues.accountBalance}
									onChange={(e) =>
										setEditValues((prev) => ({
											...prev,
											accountBalance: Number(e.target.value),
										}))
									}
									className="max-w-[128px] min-w-[80px] shrink text-right"
								/>
							</div>
						) : (
							<span className="text-small text-txt-200">
								{formatCurrency(settings.accountBalance)}
							</span>
						)}
					</div>
				</div>
				{isEditing && (
					<div className="mt-m-500 gap-s-300 flex justify-end">
						<Button
							id="general-cancel-risk"
							variant="ghost"
							size="default"
							className="min-h-11"
							onClick={handleCancel}
							disabled={isPending}
						>
							{tCommon("cancel")}
						</Button>
						<Button
							id="general-save-risk"
							size="default"
							className="min-h-11"
							onClick={handleSave}
							disabled={isPending}
						>
							{isPending ? tCommon("saving") : tCommon("save")}
						</Button>
					</div>
				)}
			</div>

			{/* Trading Account (Prop Trading & Tax) */}
			<TradingAccountSettings />

			{/* Data Maintenance */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">
					{t("dataMaintenance")}
				</h2>
				<div className="mt-m-400 space-y-m-400">
					<div>
						<p className="text-small text-txt-100">{t("recalculateR")}</p>
						<p className="mb-m-400 text-tiny text-txt-300">
							{t("recalculateRDescription")}
						</p>
						<RecalculateButton />
					</div>
				</div>
			</div>

			{/* Data Import */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">
					{t("dataImport")}
				</h2>
				<div className="mt-m-400">
					<p className="text-small text-txt-200">{t("dataImportDesc")}</p>
					<p className="mt-m-400 text-tiny text-txt-300">
						{t("goTo")}{" "}
						<Link href="/journal/new" className="text-acc-100 hover:underline">
							{t("importNavLink")}
						</Link>{" "}
						{t("toImport")}
					</p>
				</div>
			</div>

			{/* Data Export */}
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-body text-txt-100 font-semibold">
					{t("dataExport")}
				</h2>
				<p className="mt-m-400 text-small text-txt-200">
					{t("dataExportDesc")}
				</p>
				<p className="mt-m-400 text-tiny text-txt-300">
					{t("exportComingSoon")}
				</p>
			</div>
		</div>
	)
}
