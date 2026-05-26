"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import type { ChangeEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	listFeeRates,
	upsertFeeRates,
	deleteFeeRates,
} from "@/app/actions/tax-engine"
import { getActiveAssets } from "@/app/actions/assets"
import type { FeeRatesEntry } from "@/lib/tax/types"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"
import { useRegisterSettingsSection } from "@/components/settings/settings-save-bar"

interface DisplayValues {
	txCorretagem: string
	txRegistro: string
	emolumentos: string
	issRate: string
	irrfRate: string
	irRate: string
	subjectToPersonalIr: boolean
}

const DEFAULT_DISPLAY: DisplayValues = {
	txCorretagem: "0.0500",
	txRegistro: "0.7400",
	emolumentos: "0.4000",
	issRate: "5.00",
	irrfRate: "1.00",
	irRate: "20.00",
	subjectToPersonalIr: true,
}

const entryToDisplay = (entry: FeeRatesEntry): DisplayValues => ({
	txCorretagem: (entry.txCorretagemCents / 100).toFixed(4),
	txRegistro: (entry.txRegistroCents / 100).toFixed(4),
	emolumentos: (entry.emolumentosCents / 100).toFixed(4),
	issRate: entry.issRatePercent,
	irrfRate: (entry.irrfRateBps / 100).toFixed(2),
	irRate: (entry.irRateBps / 100).toFixed(2),
	subjectToPersonalIr: entry.subjectToPersonalIr,
})

const displayToPersist = (display: DisplayValues) => ({
	txCorretagemCents: Math.round(parseFloat(display.txCorretagem) * 100),
	txRegistroCents: Math.round(parseFloat(display.txRegistro) * 100),
	emolumentosCents: Math.round(parseFloat(display.emolumentos) * 100),
	issRatePercent: display.issRate,
	irrfRateBps: Math.round(parseFloat(display.irrfRate) * 100),
	irRateBps: Math.round(parseFloat(display.irRate) * 100),
	subjectToPersonalIr: display.subjectToPersonalIr,
})

const displaysEqual = (a: DisplayValues, b: DisplayValues) =>
	a.txCorretagem === b.txCorretagem &&
	a.txRegistro === b.txRegistro &&
	a.emolumentos === b.emolumentos &&
	a.issRate === b.issRate &&
	a.irrfRate === b.irrfRate &&
	a.irRate === b.irRate &&
	a.subjectToPersonalIr === b.subjectToPersonalIr

interface PaneFields {
	key: keyof Omit<DisplayValues, "subjectToPersonalIr">
	label: string
	hint: string
	step: string
}

const formatBRL = (value: number) =>
	value.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 4,
		maximumFractionDigits: 4,
	})

const computePerContractTotal = (values: DisplayValues) => {
	const corretagem = parseFloat(values.txCorretagem)
	const registro = parseFloat(values.txRegistro)
	const emolumentos = parseFloat(values.emolumentos)
	const issRate = parseFloat(values.issRate)

	const safeCorretagem = Number.isFinite(corretagem) ? corretagem : 0
	const safeRegistro = Number.isFinite(registro) ? registro : 0
	const safeEmolumentos = Number.isFinite(emolumentos) ? emolumentos : 0
	const safeIssRate = Number.isFinite(issRate) ? issRate : 0

	const iss = safeCorretagem * (safeIssRate / 100)
	const total = safeCorretagem + safeRegistro + safeEmolumentos + iss

	return { iss, total }
}

const PerContractTotal = ({ values }: { values: DisplayValues }) => {
	const t = useTranslations("tax.feeRateForm.perContractTotal")
	const { iss, total } = useMemo(
		() => computePerContractTotal(values),
		[values]
	)

	return (
		<div className="border-txt-300/15 bg-bg-200/40 px-s-300 py-s-300 rounded-lg border">
			<div className="gap-s-200 flex items-center justify-between">
				<span className="text-small text-txt-200">{t("label")}</span>
				<span className="text-body text-txt-100 font-mono">
					{formatBRL(total)}
				</span>
			</div>
			<p className="mt-s-100 text-tiny text-txt-300">
				{t("note", { iss: formatBRL(iss) })}
			</p>
		</div>
	)
}

interface PaneProps {
	assetSymbol: string | null
	initial: DisplayValues
	allowReset: boolean
	onSaved: (_values: DisplayValues) => void
	onReset: () => void
}

const FeeRatePane = ({
	assetSymbol,
	initial,
	allowReset,
	onSaved,
	onReset,
}: PaneProps) => {
	const t = useTranslations("tax.feeRateForm")
	const { showToast } = useToast()
	const [isResetting, startResetTransition] = useTransition()
	const [values, setValues] = useState<DisplayValues>(initial)

	const fields: PaneFields[] = [
		{
			key: "txCorretagem",
			label: t("fields.txCorretagem.label"),
			hint: t("fields.txCorretagem.hint"),
			step: "0.0001",
		},
		{
			key: "txRegistro",
			label: t("fields.txRegistro.label"),
			hint: t("fields.txRegistro.hint"),
			step: "0.0001",
		},
		{
			key: "emolumentos",
			label: t("fields.emolumentos.label"),
			hint: t("fields.emolumentos.hint"),
			step: "0.0001",
		},
		{
			key: "issRate",
			label: t("fields.issRate.label"),
			hint: t("fields.issRate.hint"),
			step: "0.01",
		},
		{
			key: "irrfRate",
			label: t("fields.irrfRate.label"),
			hint: t("fields.irrfRate.hint"),
			step: "0.01",
		},
		{
			key: "irRate",
			label: t("fields.irRate.label"),
			hint: t("fields.irRate.hint"),
			step: "0.01",
		},
	]

	useEffect(() => {
		setValues(initial)
	}, [initial])

	const handleTextChange =
		(field: keyof Omit<DisplayValues, "subjectToPersonalIr">) =>
		(e: ChangeEvent<HTMLInputElement>) => {
			setValues((prev) => ({ ...prev, [field]: e.target.value }))
		}

	const handleCheckedChange = (checked: boolean | "indeterminate") => {
		setValues((prev) => ({ ...prev, subjectToPersonalIr: checked === true }))
	}

	const isDirty = !displaysEqual(values, initial)

	const handleSave = useCallback(async () => {
		const result = await upsertFeeRates({
			assetSymbol,
			...displayToPersist(values),
		})
		if (result.status === "success") {
			onSaved(values)
			return
		}
		throw new Error(result.message ?? t("toasts.saveError"))
	}, [assetSymbol, onSaved, t, values])

	const handleResetField = useCallback(() => {
		setValues(initial)
	}, [initial])

	useRegisterSettingsSection({
		id: `fee-rate-${assetSymbol ?? "default"}`,
		label: assetSymbol ?? t("defaultAssetLabel"),
		isDirty,
		onSave: handleSave,
		onReset: handleResetField,
	})

	const handleDeleteOverride = () => {
		if (!assetSymbol) {
			return
		}
		startResetTransition(async () => {
			const result = await deleteFeeRates(assetSymbol)
			if (result.status === "success") {
				showToast("success", t("toasts.resetSuccess"))
				onReset()
				return
			}
			showToast("error", result.message ?? t("toasts.resetError"))
		})
	}

	return (
		<div
			className="space-y-m-400"
			aria-label={t("formAriaLabel", {
				asset: assetSymbol ?? t("defaultAssetLabel"),
			})}
		>
			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
				{fields.map(({ key, label, hint, step }) => (
					<div key={key} className="space-y-s-100">
						<Label
							id={`fee-${assetSymbol ?? "default"}-${key}-label`}
							htmlFor={`fee-${assetSymbol ?? "default"}-${key}`}
							className="text-small text-txt-200"
						>
							{label}
						</Label>
						<Input
							id={`fee-${assetSymbol ?? "default"}-${key}`}
							type="number"
							step={step}
							min="0"
							value={values[key]}
							onChange={handleTextChange(key)}
							aria-describedby={`fee-${assetSymbol ?? "default"}-${key}-hint`}
							className="font-mono"
						/>
						<p
							id={`fee-${assetSymbol ?? "default"}-${key}-hint`}
							className="text-tiny text-txt-300"
						>
							{hint}
						</p>
					</div>
				))}
			</div>

			<label
				htmlFor={`fee-${assetSymbol ?? "default"}-subjectToPersonalIr`}
				className="gap-s-200 text-small text-txt-200 flex cursor-pointer items-center"
			>
				<Checkbox
					id={`fee-${assetSymbol ?? "default"}-subjectToPersonalIr`}
					checked={values.subjectToPersonalIr}
					onCheckedChange={handleCheckedChange}
					aria-label={t("subjectToPersonalIr.ariaLabel")}
				/>
				{t("subjectToPersonalIr.label")}
			</label>

			<PerContractTotal values={values} />

			{allowReset && (
				<div className="flex justify-end">
					<Button
						id={`fee-rate-form-reset-${assetSymbol ?? "default"}`}
						type="button"
						variant="outline"
						size="sm"
						disabled={isResetting}
						onClick={handleDeleteOverride}
						aria-label={t("resetButton.ariaLabel")}
					>
						{t("resetButton.label")}
					</Button>
				</div>
			)}
		</div>
	)
}

interface AssetTab {
	symbol: string
	display: DisplayValues
	hasOverride: boolean
}

const FeeRateForm = () => {
	const t = useTranslations("tax.feeRateForm")
	const [isLoading, setIsLoading] = useState(true)
	const [defaultDisplay, setDefaultDisplay] =
		useState<DisplayValues>(DEFAULT_DISPLAY)
	const [assetTabs, setAssetTabs] = useState<AssetTab[]>([])
	const [availableSymbols, setAvailableSymbols] = useState<string[]>([])
	const [activeTab, setActiveTab] = useState<string>("__default__")
	const [reloadKey, setReloadKey] = useState(0)

	useEffect(() => {
		let mounted = true
		const load = async () => {
			const [feeRatesResult, allActiveAssets] = await Promise.all([
				listFeeRates(),
				getActiveAssets(),
			])
			if (!mounted) {
				return
			}

			const entries =
				feeRatesResult.status === "success" && feeRatesResult.data
					? feeRatesResult.data
					: []

			const defaultEntry = entries.find((e) => e.assetSymbol === null)
			setDefaultDisplay(
				defaultEntry ? entryToDisplay(defaultEntry) : DEFAULT_DISPLAY
			)

			const overrideSymbols = entries
				.map((e) => e.assetSymbol)
				.filter((s): s is string => typeof s === "string")

			const tabs: AssetTab[] = overrideSymbols.map((symbol) => {
				const override = entries.find((e) => e.assetSymbol === symbol)!
				return {
					symbol,
					display: entryToDisplay(override),
					hasOverride: true,
				}
			})

			setAssetTabs(tabs)
			setAvailableSymbols(
				allActiveAssets
					.map((a) => a.symbol)
					.filter((s) => !overrideSymbols.includes(s))
			)
			setIsLoading(false)
		}
		void load()
		return () => {
			mounted = false
		}
	}, [reloadKey])

	const triggerReload = () => setReloadKey((k) => k + 1)

	const handleAddOverride = (symbol: string) => {
		const preset = ASSET_FEE_DEFAULTS[symbol]
		const display = preset ? entryToDisplay(preset) : defaultDisplay
		setAssetTabs((prev) => [...prev, { symbol, display, hasOverride: false }])
		setAvailableSymbols((prev) => prev.filter((s) => s !== symbol))
		setActiveTab(symbol)
	}

	const handlePaneSavedDefault = useCallback((next: DisplayValues) => {
		setDefaultDisplay(next)
	}, [])

	const handlePaneSavedOverride = useCallback(
		(symbol: string) => (next: DisplayValues) => {
			setAssetTabs((prev) =>
				prev.map((tab) =>
					tab.symbol === symbol
						? { ...tab, display: next, hasOverride: true }
						: tab
				)
			)
		},
		[]
	)

	if (isLoading) {
		return <p className="text-small text-txt-300">{t("loadingRates")}</p>
	}

	return (
		<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
			<div className="gap-s-300 flex flex-wrap items-center justify-between">
				<TabsList className="overflow-x-auto">
					<TabsTrigger value="__default__">{t("defaultTab")}</TabsTrigger>
					{assetTabs.map((tab) => (
						<TabsTrigger key={tab.symbol} value={tab.symbol}>
							{tab.symbol}
							{tab.hasOverride ? " ●" : ""}
						</TabsTrigger>
					))}
				</TabsList>
				{availableSymbols.length > 0 && (
					<Select onValueChange={handleAddOverride} value="">
						<SelectTrigger
							id="fee-rate-add-override"
							className="w-auto min-w-[12rem]"
							aria-label={t("addOverrideAriaLabel")}
						>
							<SelectValue placeholder={t("addOverridePlaceholder")} />
						</SelectTrigger>
						<SelectContent>
							{availableSymbols.map((symbol) => (
								<SelectItem key={symbol} value={symbol}>
									{symbol}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
			<TabsContent
				value="__default__"
				className="pt-m-400 data-[state=inactive]:hidden"
				forceMount
			>
				<p className="text-tiny text-txt-300 mb-s-300">
					{t("defaultTabDescription")}
				</p>
				<FeeRatePane
					assetSymbol={null}
					initial={defaultDisplay}
					allowReset={false}
					onSaved={handlePaneSavedDefault}
					onReset={triggerReload}
				/>
			</TabsContent>
			{assetTabs.map((tab) => (
				<TabsContent
					key={tab.symbol}
					value={tab.symbol}
					className="pt-m-400 data-[state=inactive]:hidden"
					forceMount
				>
					<p className="text-tiny text-txt-300 mb-s-300">
						{tab.hasOverride
							? t("assetTabDescription", { symbol: tab.symbol })
							: t("assetTabNoOverrideDescription", { symbol: tab.symbol })}
					</p>
					<FeeRatePane
						assetSymbol={tab.symbol}
						initial={tab.display}
						allowReset={tab.hasOverride}
						onSaved={handlePaneSavedOverride(tab.symbol)}
						onReset={triggerReload}
					/>
				</TabsContent>
			))}
		</Tabs>
	)
}

export { FeeRateForm }
