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

interface RiskSettingsState {
	defaultRiskPercent: number
	accountBalance: number
}

export const GeneralSettings = () => {
	const t = useTranslations("settings.general")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [isEditing, setIsEditing] = useState(false)
	const [settings, setSettings] = useState<RiskSettingsState>({
		defaultRiskPercent: 1.0,
		accountBalance: 10000,
	})
	const [editValues, setEditValues] = useState<RiskSettingsState>({
		defaultRiskPercent: 1.0,
		accountBalance: 10000,
	})

	useEffect(() => {
		const loadSettings = async () => {
			const result = await getRiskSettings()
			if (result.status === "success" && result.data) {
				setSettings(result.data)
				setEditValues(result.data)
			}
		}
		loadSettings()
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

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}).format(value)
	}

	return (
		<div className="mx-auto max-w-2xl space-y-m-600">
			{/* Appearance */}
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="text-body font-semibold text-txt-100">{t("title")}</h2>
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
							<p className="text-tiny text-txt-300">
								{t("languageDesc")}
							</p>
						</div>
						<LanguageSwitcher />
					</div>
				</div>
			</div>

			{/* Risk Settings */}
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<div className="flex items-center justify-between">
					<h2 className="text-body font-semibold text-txt-100">{t("riskSettings")}</h2>
					{!isEditing && (
						<Button id="general-edit-risk" variant="ghost" size="sm" onClick={handleEdit}>
							{tCommon("edit")}
						</Button>
					)}
				</div>
				<div className="mt-m-400 space-y-m-400">
					<div className="flex items-center justify-between gap-m-400">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("defaultRisk")}</p>
							<p className="text-tiny text-txt-300">
								{t("defaultRiskDesc")}
							</p>
						</div>
						{isEditing ? (
							<div className="flex items-center gap-s-200">
								<Input
									id="general-defaultRisk"
									type="number"
									step="0.1"
									min="0.1"
									max="100"
									value={editValues.defaultRiskPercent}
									onChange={(e) =>
										setEditValues((prev) => ({
											...prev,
											defaultRiskPercent: Number(e.target.value),
										}))
									}
									className="w-24 text-right"
								/>
								<span className="text-small text-txt-300">%</span>
							</div>
						) : (
							<span className="text-small text-txt-200">
								{settings.defaultRiskPercent}%
							</span>
						)}
					</div>
					<div className="flex items-center justify-between gap-m-400">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("accountBalance")}</p>
							<p className="text-tiny text-txt-300">
								{t("accountBalanceDesc")}
							</p>
						</div>
						{isEditing ? (
							<div className="flex items-center gap-s-200">
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
									className="w-32 text-right"
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
					<div className="mt-m-500 flex justify-end gap-s-300">
						<Button id="general-cancel-risk" variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
							{tCommon("cancel")}
						</Button>
						<Button id="general-save-risk" size="sm" onClick={handleSave} disabled={isPending}>
							{isPending ? tCommon("saving") : tCommon("save")}
						</Button>
					</div>
				)}
			</div>

			{/* Trading Account (Prop Trading & Tax) */}
			<TradingAccountSettings />

			{/* Data Maintenance */}
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="text-body font-semibold text-txt-100">
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
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="text-body font-semibold text-txt-100">{t("dataImport")}</h2>
				<div className="mt-m-400">
					<p className="text-small text-txt-200">
						{t("dataImportDesc")}
					</p>
					<p className="mt-m-400 text-tiny text-txt-300">
						{t("goTo")}{" "}
						<Link
							href="/journal/new"
							className="text-acc-100 hover:underline"
						>
							{t("importNavLink")}
						</Link>{" "}
						{t("toImport")}
					</p>
				</div>
			</div>

			{/* Data Export */}
			<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<h2 className="text-body font-semibold text-txt-100">{t("dataExport")}</h2>
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
