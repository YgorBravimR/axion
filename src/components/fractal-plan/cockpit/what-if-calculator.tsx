"use client"

import { useMemo, useState } from "react"
import { Calculator } from "lucide-react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { calculateTickBasedPositionSize } from "@/lib/calculations"

interface AssetOption {
	symbol: string
	name: string
	tickSize: string
	tickValueCents: number
}

interface WhatIfCalculatorProps {
	oneRCents: number
	assets: readonly AssetOption[]
}

const formatBRL = (cents: number): string =>
	(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const WhatIfCalculator = ({ oneRCents, assets }: WhatIfCalculatorProps) => {
	const t = useTranslations("plan.whatIf")
	const [symbol, setSymbol] = useState<string>(assets[0]?.symbol ?? "")
	const [stopTicks, setStopTicks] = useState<string>("10")

	const selected = useMemo(
		() => assets.find((a) => a.symbol === symbol) ?? assets[0],
		[symbol, assets]
	)

	const ticksAtRiskNum = Number(stopTicks.replace(",", "."))

	const result = useMemo(() => {
		if (!selected || !Number.isFinite(ticksAtRiskNum) || ticksAtRiskNum <= 0) {
			return null
		}
		const tickSize = Number(selected.tickSize) || 1
		const entry = 100_000 // arbitrary anchor
		const stopLoss = entry - ticksAtRiskNum * tickSize
		return calculateTickBasedPositionSize({
			riskBudgetCents: oneRCents,
			entryPrice: entry,
			stopLoss,
			tickSize,
			tickValue: selected.tickValueCents,
		})
	}, [selected, ticksAtRiskNum, oneRCents])

	if (assets.length === 0) {
		return (
			<div className="border-bg-300 bg-bg-100 p-s-300 text-tiny text-txt-300 rounded-md border border-dashed">
				{t("noAssets")}
			</div>
		)
	}

	return (
		<section
			aria-label={t("ariaLabel")}
			className="border-bg-300 bg-bg-100 p-m-400 rounded-md border"
		>
			<header className="gap-s-200 flex items-center">
				<Calculator className="text-guide size-3.5" />
				<h3 className="text-small text-txt-100 font-medium">{t("heading")}</h3>
				<span className="text-tiny text-txt-300 ml-auto font-mono">
					1R = {formatBRL(oneRCents)}
				</span>
			</header>

			<div className="mt-s-300 gap-s-300 grid grid-cols-1 sm:grid-cols-3">
				<div>
					<Label id="whatif-asset-label" htmlFor="whatif-asset">
						{t("assetLabel")}
					</Label>
					<Select value={symbol} onValueChange={setSymbol}>
						<SelectTrigger id="whatif-asset" className="mt-s-100">
							<SelectValue placeholder={t("assetPlaceholder")} />
						</SelectTrigger>
						<SelectContent>
							{assets.map((a) => (
								<SelectItem key={a.symbol} value={a.symbol}>
									{a.symbol}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div>
					<Label id="whatif-ticks-label" htmlFor="whatif-ticks">
						{t("stopLabel")}
					</Label>
					<Input
						id="whatif-ticks"
						className="mt-s-100"
						inputMode="decimal"
						value={stopTicks}
						onChange={(e) => setStopTicks(e.target.value)}
					/>
				</div>
				<div>
					<Label id="whatif-risk-label" htmlFor="whatif-risk">
						{t("riskPerContractLabel")}
					</Label>
					<output
						id="whatif-risk"
						className="mt-s-100 border-bg-300 bg-bg-200 px-s-300 py-s-200 text-small text-txt-200 block rounded-sm border font-mono tabular-nums"
					>
						{result ? formatBRL(result.riskPerContractCents) : "—"}
					</output>
				</div>
			</div>

			<dl className="mt-s-300 gap-s-300 border-bg-300 pt-s-300 text-tiny grid grid-cols-3 border-t">
				<div>
					<dt className="text-txt-300">{t("contracts")}</dt>
					<dd className="text-h3 text-acc-100 mt-px font-mono tabular-nums">
						{result?.contracts ?? 0}
					</dd>
				</div>
				<div>
					<dt className="text-txt-300">{t("effectiveRisk")}</dt>
					<dd className="text-txt-200 mt-px font-mono tabular-nums">
						{result ? formatBRL(result.actualRiskCents) : "—"}
					</dd>
				</div>
				<div>
					<dt className="text-txt-300">{t("tick")}</dt>
					<dd className="text-txt-200 mt-px font-mono tabular-nums">
						{selected
							? `${selected.tickSize} · ${formatBRL(selected.tickValueCents)}`
							: "—"}
					</dd>
				</div>
			</dl>
		</section>
	)
}

export { WhatIfCalculator }
export type { WhatIfCalculatorProps, AssetOption }
