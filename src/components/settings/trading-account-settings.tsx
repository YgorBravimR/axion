"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
	getUserSettings,
	updateUserSettings,
	type UserSettingsData,
} from "@/app/actions/settings"
import { useToast } from "@/components/ui/toast"
import { Loader2, Building2, Percent, Calculator } from "lucide-react"
import { cn } from "@/lib/utils"

const PROP_FIRMS = [
	{ value: "atom", label: "Atom" },
	{ value: "raise", label: "Raise" },
	{ value: "solotrader", label: "SoloTrader" },
	{ value: "apex", label: "Apex Trader Funding" },
	{ value: "topstep", label: "Topstep" },
	{ value: "ftmo", label: "FTMO" },
	{ value: "other", label: "Other" },
]

export const TradingAccountSettings = () => {
	const t = useTranslations("settings.tradingAccount")
	const tCommon = useTranslations("common")
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [isLoading, setIsLoading] = useState(true)
	const [isEditing, setIsEditing] = useState(false)

	const [settings, setSettings] = useState<UserSettingsData | null>(null)
	const [editValues, setEditValues] = useState<UserSettingsData | null>(null)

	useEffect(() => {
		const loadSettings = async () => {
			const result = await getUserSettings()
			if (result.status === "success" && result.data) {
				setSettings(result.data)
				setEditValues(result.data)
			}
			setIsLoading(false)
		}
		loadSettings()
	}, [])

	const handleEdit = () => {
		if (settings) {
			setEditValues({ ...settings })
			setIsEditing(true)
		}
	}

	const handleCancel = () => {
		if (settings) {
			setEditValues({ ...settings })
		}
		setIsEditing(false)
	}

	const handleSave = () => {
		if (!editValues) return

		startTransition(async () => {
			const result = await updateUserSettings(editValues)
			if (result.status === "success" && result.data) {
				setSettings(result.data)
				setIsEditing(false)
				showToast("success", t("settingsUpdated"))
			} else {
				showToast("error", result.message || t("settingsUpdateFailed"))
			}
		})
	}

	const handleFieldChange = <K extends keyof UserSettingsData>(
		field: K,
		value: UserSettingsData[K]
	) => {
		setEditValues((prev) => (prev ? { ...prev, [field]: value } : null))
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
				<Loader2 className="h-6 w-6 animate-spin text-txt-300" />
			</div>
		)
	}

	if (!editValues) {
		return null
	}

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-s-200">
					<Building2 className="h-5 w-5 text-acc-100" />
					<h2 className="text-small sm:text-body font-semibold text-txt-100">{t("title")}</h2>
				</div>
				{!isEditing && (
					<Button id="trading-edit" variant="ghost" size="sm" onClick={handleEdit}>
						{tCommon("edit")}
					</Button>
				)}
			</div>

			<div className="mt-m-500 space-y-m-500">
				{/* Account Type Toggle */}
				<div className="flex items-center justify-between">
					<div className="flex-1">
						<p className="text-small text-txt-100">{t("accountType")}</p>
						<p className="text-tiny text-txt-300">
							{editValues.isPropAccount ? t("prop") : t("personal")}
						</p>
					</div>
					<Switch
						id="is-prop-account"
						checked={editValues.isPropAccount}
						onCheckedChange={(checked) =>
							handleFieldChange("isPropAccount", checked)
						}
						disabled={!isEditing}
					/>
				</div>

				{/* Prop Trading Settings - only show when isPropAccount is true */}
				{editValues.isPropAccount && (
					<div
						className={cn(
							"space-y-m-400 rounded-md border border-acc-100/20 bg-acc-100/5 p-m-400",
							"transition-opacity duration-200"
						)}
					>
						<h3 className="flex items-center gap-s-200 text-small font-medium text-txt-100">
							<Percent className="h-4 w-4 text-acc-100" />
							{t("propSettings")}
						</h3>

						{/* Prop Firm Name */}
						<div className="space-y-s-200">
							<Label id="label-trading-firm-name" htmlFor="propFirm" className="text-small text-txt-200">
								{t("firmName")}
							</Label>
							{isEditing ? (
								<Select
									value={editValues.propFirmName || "other"}
									onValueChange={(value) =>
										handleFieldChange("propFirmName", value)
									}
								>
									<SelectTrigger id="propFirm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PROP_FIRMS.map((firm) => (
											<SelectItem key={firm.value} value={firm.value}>
												{firm.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<p className="text-small text-txt-100">
									{PROP_FIRMS.find((f) => f.value === editValues.propFirmName)
										?.label || editValues.propFirmName || "-"}
								</p>
							)}
						</div>

						{/* Profit Share Percentage */}
						<div className="space-y-s-200">
							<Label id="label-trading-profit-share" htmlFor="profitShare" className="text-small text-txt-200">
								{t("profitShare")}
							</Label>
							<p className="text-tiny text-txt-300">{t("profitShareHelp")}</p>
							{isEditing ? (
								<div className="flex items-center gap-s-200">
									<Input
										id="profitShare"
										type="number"
										step="1"
										min="0"
										max="100"
										value={editValues.profitSharePercentage}
										onChange={(e) =>
											handleFieldChange(
												"profitSharePercentage",
												Number(e.target.value)
											)
										}
										className="w-24 text-right"
									/>
									<span className="text-small text-txt-300">%</span>
								</div>
							) : (
								<p className="text-small text-txt-100">
									{editValues.profitSharePercentage}%
								</p>
							)}
						</div>
					</div>
				)}

				{/* Tax Settings */}
				<div className="space-y-m-400">
					<h3 className="flex items-center gap-s-200 text-small font-medium text-txt-100">
						<Calculator className="h-4 w-4 text-acc-100" />
						{t("taxSettings")}
					</h3>

					{/* Day Trade Tax Rate */}
					<div className="flex items-center justify-between gap-m-400">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("dayTradeTax")}</p>
						</div>
						{isEditing ? (
							<div className="flex items-center gap-s-200">
								<Input
									id="trading-dayTradeTax"
									type="number"
									step="0.1"
									min="0"
									max="100"
									value={editValues.dayTradeTaxRate}
									onChange={(e) =>
										handleFieldChange("dayTradeTaxRate", Number(e.target.value))
									}
									className="w-20 text-right"
								/>
								<span className="text-small text-txt-300">%</span>
							</div>
						) : (
							<span className="text-small text-txt-200">
								{editValues.dayTradeTaxRate}%
							</span>
						)}
					</div>

					{/* Swing Trade Tax Rate */}
					<div className="flex items-center justify-between gap-m-400">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("swingTradeTax")}</p>
						</div>
						{isEditing ? (
							<div className="flex items-center gap-s-200">
								<Input
									id="trading-swingTradeTax"
									type="number"
									step="0.1"
									min="0"
									max="100"
									value={editValues.swingTradeTaxRate}
									onChange={(e) =>
										handleFieldChange(
											"swingTradeTaxRate",
											Number(e.target.value)
										)
									}
									className="w-20 text-right"
								/>
								<span className="text-small text-txt-300">%</span>
							</div>
						) : (
							<span className="text-small text-txt-200">
								{editValues.swingTradeTaxRate}%
							</span>
						)}
					</div>
				</div>

				{/* Display Preferences */}
				<div className="space-y-m-400 border-t border-bg-300 pt-m-400">
					<div className="flex items-center justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">{t("showTaxEstimates")}</p>
						</div>
						<Switch
							id="show-tax-estimates"
							checked={editValues.showTaxEstimates}
							onCheckedChange={(checked) =>
								handleFieldChange("showTaxEstimates", checked)
							}
							disabled={!isEditing}
						/>
					</div>

					<div className="flex items-center justify-between">
						<div className="flex-1">
							<p className="text-small text-txt-100">
								{t("showPropCalculations")}
							</p>
						</div>
						<Switch
							id="show-prop-calculations"
							checked={editValues.showPropCalculations}
							onCheckedChange={(checked) =>
								handleFieldChange("showPropCalculations", checked)
							}
							disabled={!isEditing}
						/>
					</div>
				</div>
			</div>

			{/* Action Buttons */}
			{isEditing && (
				<div className="mt-m-500 flex justify-end gap-s-300">
					<Button
						id="trading-cancel"
						variant="ghost"
						size="sm"
						onClick={handleCancel}
						disabled={isPending}
					>
						{tCommon("cancel")}
					</Button>
					<Button id="trading-save" size="sm" onClick={handleSave} disabled={isPending}>
						{isPending ? tCommon("saving") : tCommon("save")}
					</Button>
				</div>
			)}
		</div>
	)
}
