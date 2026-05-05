"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import type { ChangeEvent, FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listFeeRates, upsertFeeRates, deleteFeeRates } from "@/app/actions/tax-engine"
import { getActiveAssets } from "@/app/actions/assets"
import type { FeeRatesEntry } from "@/lib/tax/types"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"

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

interface PaneFields {
	key: keyof Omit<DisplayValues, "subjectToPersonalIr">
	label: string
	hint: string
	step: string
}

const FIELDS: PaneFields[] = [
	{ key: "txCorretagem", label: "Tx Corretagem (R$/contrato)", hint: "Ex: 0.0500 = R$0,05 por contrato", step: "0.0001" },
	{ key: "txRegistro", label: "Tx Registro (R$/contrato)", hint: "Ex: 0.7400 = R$0,74 por contrato", step: "0.0001" },
	{ key: "emolumentos", label: "Emolumentos (R$/contrato)", hint: "Ex: 0.4000 = R$0,40 por contrato", step: "0.0001" },
	{ key: "issRate", label: "ISS (% sobre Corretagem)", hint: "São Paulo: 5,00% (padrão)", step: "0.01" },
	{ key: "irrfRate", label: "IRRF (%)", hint: "Padrão: 1,00%", step: "0.01" },
	{ key: "irRate", label: "IR Day-trade (%)", hint: "Padrão: 20,00%", step: "0.01" },
]

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
	const { iss, total } = useMemo(() => computePerContractTotal(values), [values])

	return (
		<div className="rounded-lg border border-txt-300/15 bg-bg-200/40 px-s-300 py-s-300">
			<div className="flex items-center justify-between gap-s-200">
				<span className="text-small text-txt-200">Total por contrato (B3 + ISS)</span>
				<span className="font-mono text-body text-txt-100">{formatBRL(total)}</span>
			</div>
			<p className="mt-s-100 text-tiny text-txt-300">
				Tx Corretagem + Tx Registro + Emolumentos + ISS ({formatBRL(iss)}). IRRF e IR
				incidem sobre lucro, não por contrato.
			</p>
		</div>
	)
}

interface PaneProps {
	assetSymbol: string | null
	initial: DisplayValues
	allowReset: boolean
	onSave: () => void
	onReset: () => void
}

const FeeRatePane = ({ assetSymbol, initial, allowReset, onSave, onReset }: PaneProps) => {
	const { showToast } = useToast()
	const [isPending, startTransition] = useTransition()
	const [values, setValues] = useState<DisplayValues>(initial)

	useEffect(() => {
		setValues(initial)
	}, [initial])

	const handleTextChange =
		(field: keyof Omit<DisplayValues, "subjectToPersonalIr">) =>
		(e: ChangeEvent<HTMLInputElement>) => {
			setValues((prev) => ({ ...prev, [field]: e.target.value }))
		}

	const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
		setValues((prev) => ({ ...prev, subjectToPersonalIr: e.target.checked }))
	}

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		startTransition(async () => {
			const result = await upsertFeeRates({
				assetSymbol,
				...displayToPersist(values),
			})
			if (result.status === "success") {
				showToast("success", "Taxas salvas")
				onSave()
			} else {
				showToast("error", result.message ?? "Erro ao salvar taxas")
			}
		})
	}

	const handleReset = () => {
		if (!assetSymbol) return
		startTransition(async () => {
			const result = await deleteFeeRates(assetSymbol)
			if (result.status === "success") {
				showToast("success", "Override removido — usando padrão da conta")
				onReset()
			} else {
				showToast("error", result.message ?? "Erro ao remover override")
			}
		})
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-m-400"
			aria-label={`Configuração de taxas — ${assetSymbol ?? "padrão"}`}
		>
			<div className="grid grid-cols-1 gap-m-400 sm:grid-cols-2">
				{FIELDS.map(({ key, label, hint, step }) => (
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
						<p id={`fee-${assetSymbol ?? "default"}-${key}-hint`} className="text-tiny text-txt-300">
							{hint}
						</p>
					</div>
				))}
			</div>

			<label className="flex items-center gap-s-200 text-small text-txt-200 cursor-pointer">
				<input
					id={`fee-${assetSymbol ?? "default"}-subjectToPersonalIr`}
					type="checkbox"
					checked={values.subjectToPersonalIr}
					onChange={handleCheckboxChange}
					aria-label="Sujeito a IR pessoal (desmarcar para contas prop)"
					className="rounded"
				/>
				Sujeito a IR pessoal (desmarcar para contas prop)
			</label>

			<PerContractTotal values={values} />

			<div className="flex items-center gap-s-300">
				<Button
					id={`fee-rate-form-submit-${assetSymbol ?? "default"}`}
					type="submit"
					disabled={isPending}
					aria-label="Salvar taxas"
				>
					{isPending ? "Salvando..." : "Salvar Taxas"}
				</Button>
				{allowReset && (
					<Button
						id={`fee-rate-form-reset-${assetSymbol ?? "default"}`}
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={handleReset}
						aria-label="Reverter para taxas padrão da conta"
					>
						Reverter ao padrão
					</Button>
				)}
			</div>
		</form>
	)
}

interface AssetTab {
	symbol: string
	display: DisplayValues
	hasOverride: boolean
}

const FeeRateForm = () => {
	const [isLoading, setIsLoading] = useState(true)
	const [defaultDisplay, setDefaultDisplay] = useState<DisplayValues>(DEFAULT_DISPLAY)
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
			if (!mounted) return

			const entries = feeRatesResult.status === "success" && feeRatesResult.data
				? feeRatesResult.data
				: []

			const defaultEntry = entries.find((e) => e.assetSymbol === null)
			setDefaultDisplay(defaultEntry ? entryToDisplay(defaultEntry) : DEFAULT_DISPLAY)

			const overrideSymbols = entries
				.map((e) => e.assetSymbol)
				.filter((s): s is string => typeof s === "string")

			// Tabs surface every asset that already has an override row.
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
					.filter((s) => !overrideSymbols.includes(s)),
			)
			setIsLoading(false)
		}
		load()
		return () => {
			mounted = false
		}
	}, [reloadKey])

	const triggerReload = () => setReloadKey((k) => k + 1)

	const handleAddOverride = (symbol: string) => {
		const preset = ASSET_FEE_DEFAULTS[symbol]
		const display = preset ? entryToDisplay(preset) : defaultDisplay
		setAssetTabs((prev) => [
			...prev,
			{ symbol, display, hasOverride: false },
		])
		setAvailableSymbols((prev) => prev.filter((s) => s !== symbol))
		setActiveTab(symbol)
	}

	if (isLoading) {
		return <p className="text-small text-txt-300">Carregando taxas...</p>
	}

	return (
		<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
			<div className="flex items-center justify-between gap-s-300 flex-wrap">
				<TabsList className="overflow-x-auto">
					<TabsTrigger value="__default__">Padrão</TabsTrigger>
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
							className="w-auto min-w-[12rem]"
							aria-label="Adicionar override de taxas por ativo"
						>
							<SelectValue placeholder="+ Adicionar override por ativo" />
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
			<TabsContent value="__default__" className="pt-m-400">
				<p className="text-tiny text-txt-300 mb-s-300">
					Taxas padrão da conta. Aplicadas a qualquer ativo sem override específico.
				</p>
				<FeeRatePane
					assetSymbol={null}
					initial={defaultDisplay}
					allowReset={false}
					onSave={triggerReload}
					onReset={triggerReload}
				/>
			</TabsContent>
			{assetTabs.map((tab) => (
				<TabsContent key={tab.symbol} value={tab.symbol} className="pt-m-400">
					<p className="text-tiny text-txt-300 mb-s-300">
						{tab.hasOverride
							? `Taxas específicas para ${tab.symbol} (sobrescreve o padrão).`
							: `Sem override ainda — valores pré-preenchidos com o padrão. Salve para criar override específico de ${tab.symbol}.`}
					</p>
					<FeeRatePane
						assetSymbol={tab.symbol}
						initial={tab.display}
						allowReset={tab.hasOverride}
						onSave={triggerReload}
						onReset={triggerReload}
					/>
				</TabsContent>
			))}
		</Tabs>
	)
}

export { FeeRateForm }
