"use client"

import { useMemo, useState } from "react"
import { Calculator } from "lucide-react"
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
	const [symbol, setSymbol] = useState<string>(assets[0]?.symbol ?? "")
	const [stopTicks, setStopTicks] = useState<string>("10")

	const selected = useMemo(
		() => assets.find((a) => a.symbol === symbol) ?? assets[0],
		[symbol, assets],
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
			<div className="rounded-md border border-dashed border-bg-300 bg-bg-100 p-s-300 text-tiny text-txt-300">
				Cadastre ativos para usar a calculadora de tamanho de posição.
			</div>
		)
	}

	return (
		<section
			aria-label="Calculadora de tamanho de posição"
			className="rounded-md border border-bg-300 bg-bg-100 p-m-400"
		>
			<header className="flex items-center gap-s-200">
				<Calculator className="size-3.5 text-guide" />
				<h3 className="text-small font-medium text-txt-100">What-if · sizing</h3>
				<span className="ml-auto font-mono text-tiny text-txt-300">
					1R = {formatBRL(oneRCents)}
				</span>
			</header>

			<div className="mt-s-300 grid grid-cols-1 gap-s-300 sm:grid-cols-3">
				<div>
					<Label id="whatif-asset-label" htmlFor="whatif-asset">Ativo</Label>
					<Select value={symbol} onValueChange={setSymbol}>
						<SelectTrigger id="whatif-asset" className="mt-s-100">
							<SelectValue placeholder="Ativo" />
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
					<Label id="whatif-ticks-label" htmlFor="whatif-ticks">Stop (ticks)</Label>
					<Input
						id="whatif-ticks"
						className="mt-s-100"
						inputMode="decimal"
						value={stopTicks}
						onChange={(e) => setStopTicks(e.target.value)}
					/>
				</div>
				<div>
					<Label id="whatif-risk-label" htmlFor="whatif-risk">Risk / contrato</Label>
					<output
						id="whatif-risk"
						className="mt-s-100 block rounded-sm border border-bg-300 bg-bg-200 px-s-300 py-s-200 font-mono text-small tabular-nums text-txt-200"
					>
						{result ? formatBRL(result.riskPerContractCents) : "—"}
					</output>
				</div>
			</div>

			<dl className="mt-s-300 grid grid-cols-3 gap-s-300 border-t border-bg-300 pt-s-300 text-tiny">
				<div>
					<dt className="text-txt-300">Contratos</dt>
					<dd className="mt-px font-mono text-h3 tabular-nums text-acc-100">
						{result?.contracts ?? 0}
					</dd>
				</div>
				<div>
					<dt className="text-txt-300">Risk efetivo</dt>
					<dd className="mt-px font-mono tabular-nums text-txt-200">
						{result ? formatBRL(result.actualRiskCents) : "—"}
					</dd>
				</div>
				<div>
					<dt className="text-txt-300">Tick</dt>
					<dd className="mt-px font-mono tabular-nums text-txt-200">
						{selected ? `${selected.tickSize} · ${formatBRL(selected.tickValueCents)}` : "—"}
					</dd>
				</div>
			</dl>
		</section>
	)
}

export { WhatIfCalculator }
export type { WhatIfCalculatorProps, AssetOption }
