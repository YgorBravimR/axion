// src/components/reports/annual-rollup-table.tsx
"use client"

import type {
	AnnualRollupData,
	AnnualRollupRow,
} from "@/lib/reports/annual-types"
import {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableRow,
	TableHead,
	TableCell,
	TableCaption,
} from "@/components/ui/table"

interface AnnualRollupTableProps {
	data: AnnualRollupData
	className?: string
}

const formatBRL = (cents: number | null): string => {
	if (cents === null) {
		return "—"
	}
	const value = cents / 100
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value)
}

const CellBRL = ({
	value,
	highlight = false,
}: {
	value: number | null
	highlight?: boolean
}) => {
	if (value === null) {
		return (
			<TableCell className="text-txt-300 px-3 py-2 text-right font-mono text-xs">
				—
			</TableCell>
		)
	}
	const positive = value >= 0
	const colorClass = highlight
		? positive
			? "text-trade-buy"
			: "text-trade-sell"
		: "text-txt-100"
	return (
		<TableCell
			className={`px-3 py-2 text-right font-mono text-xs ${colorClass} tabular-nums`}
		>
			{formatBRL(value)}
		</TableCell>
	)
}

const CellNum = ({ value }: { value: number | null }) => (
	<TableCell className="text-txt-100 px-3 py-2 text-right font-mono text-xs tabular-nums">
		{value === null ? "—" : value}
	</TableCell>
)

const RowData = ({ row }: { row: AnnualRollupRow }) => {
	if (row.disabled) {
		return (
			<TableRow className="opacity-30">
				<TableHead
					scope="row"
					className="bg-bg-200 text-txt-200 sticky left-0 min-w-[80px] px-3 py-2 text-left text-xs font-medium"
				>
					{row.monthName.slice(0, 3)}
				</TableHead>
				{Array.from({ length: 13 }).map((_, i) => (
					<TableCell
						key={i}
						className="text-txt-300 px-3 py-2 text-right font-mono text-xs"
					>
						—
					</TableCell>
				))}
			</TableRow>
		)
	}

	const rowOpacity = !row.hasTrades ? "opacity-40" : ""

	return (
		<TableRow
			className={`border-bg-300 hover:bg-bg-300/30 border-t transition-colors ${rowOpacity}`}
		>
			<TableHead
				scope="row"
				className="bg-bg-200 text-txt-100 sticky left-0 min-w-[80px] px-3 py-2 text-left text-xs font-medium"
			>
				{row.monthName.slice(0, 3)}
			</TableHead>
			<CellBRL value={row.resultadoBruto} />
			<CellBRL value={row.resultadoLiquido} highlight />
			<CellNum value={row.pontos} />
			<CellBRL value={row.taxas} />
			<CellBRL value={row.imposto} />
			<CellBRL value={row.aporteInicial} />
			<CellBRL value={row.mesAnterior} />
			<CellBRL value={row.novoAporte} />
			<CellBRL value={row.retirada} />
			<CellBRL value={row.capitalInvestido} />
			<CellBRL value={row.patrimonio} />
			<CellNum value={row.diasGain} />
			<CellNum value={row.diasLoss} />
		</TableRow>
	)
}

const AnnualRollupTable = ({ data, className }: AnnualRollupTableProps) => {
	const { rows, totals, taxEstimated } = data

	return (
		<div className={className}>
			<div className="border-bg-300 rounded-md border">
				<Table
					className="w-full border-collapse text-left"
					aria-label={`Annual rollup ${data.year}`}
				>
					<TableCaption className="sr-only">
						Annual P&L Rollup — {data.year}
					</TableCaption>
					<colgroup>
						<col className="w-[80px]" />
						<col span={3} />
						<col span={2} />
						<col span={6} />
						<col span={2} />
					</colgroup>
					<TableHeader>
						<TableRow className="bg-bg-300/50">
							<TableHead
								scope="col"
								className="bg-bg-300/50 text-txt-300 sticky left-0 px-3 py-2 text-left text-xs font-medium tracking-wider uppercase"
							>
								Mês
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={3}
								className="text-txt-300 border-acc-100/20 border-b px-3 py-1 text-center text-xs font-medium tracking-wider uppercase"
							>
								Resultado
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={2}
								className="text-txt-300 border-acc-100/20 border-b px-3 py-1 text-center text-xs font-medium tracking-wider uppercase"
							>
								Despesas
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={6}
								className="text-txt-300 border-acc-100/20 border-b px-3 py-1 text-center text-xs font-medium tracking-wider uppercase"
							>
								Capital
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={2}
								className="text-txt-300 border-acc-100/20 border-b px-3 py-1 text-center text-xs font-medium tracking-wider uppercase"
							>
								Dias
							</TableHead>
						</TableRow>
						<TableRow className="bg-bg-300/30">
							<TableHead
								scope="col"
								className="bg-bg-300/30 sticky left-0 px-3 py-2"
							/>
							{["Bruto", "Líquido", "Pontos"].map((h) => (
								<TableHead
									key={h}
									scope="col"
									className="text-txt-300 px-3 py-2 text-right font-mono text-xs font-medium"
								>
									{h}
								</TableHead>
							))}
							<TableHead
								scope="col"
								className="text-txt-300 px-3 py-2 text-right font-mono text-xs font-medium"
							>
								Taxas
							</TableHead>
							<TableHead
								scope="col"
								className="text-txt-300 px-3 py-2 text-right font-mono text-xs font-medium"
							>
								Imposto{taxEstimated ? "*" : ""}
							</TableHead>
							{[
								"Aporte Inicial",
								"Mês Anterior",
								"Novo Aporte",
								"Retirada",
								"Capital Invest.",
								"Patrimônio",
							].map((h) => (
								<TableHead
									key={h}
									scope="col"
									className="text-txt-300 px-3 py-2 text-right font-mono text-xs font-medium whitespace-nowrap"
								>
									{h}
								</TableHead>
							))}
							<TableHead
								scope="col"
								className="text-txt-300 px-3 py-2 text-right font-mono text-xs font-medium"
							>
								G
							</TableHead>
							<TableHead
								scope="col"
								className="text-txt-300 px-3 py-2 text-right font-mono text-xs font-medium"
							>
								L
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<RowData key={row.month} row={row} />
						))}
					</TableBody>
					<TableFooter>
						<TableRow className="bg-bg-300 border-bg-300 border-t-2 font-semibold">
							<TableHead
								scope="row"
								className="bg-bg-300 text-txt-100 sticky left-0 px-3 py-2 text-left text-xs"
							>
								Total
							</TableHead>
							<CellBRL value={totals.resultadoBruto} />
							<CellBRL value={totals.resultadoLiquido} highlight />
							<CellNum value={totals.pontos} />
							<CellBRL value={totals.taxas} />
							<CellBRL value={totals.imposto} />
							<TableCell className="text-txt-300 px-3 py-2 text-right font-mono text-xs">
								—
							</TableCell>
							<TableCell className="text-txt-300 px-3 py-2 text-right font-mono text-xs">
								—
							</TableCell>
							<CellBRL value={totals.novoAporte} />
							<CellBRL value={totals.retirada} />
							<TableCell className="text-txt-300 px-3 py-2 text-right font-mono text-xs">
								—
							</TableCell>
							<CellBRL value={totals.patrimonio} />
							<CellNum value={totals.diasGain} />
							<CellNum value={totals.diasLoss} />
						</TableRow>
					</TableFooter>
				</Table>
			</div>

			{taxEstimated && (
				<p className="text-txt-300 mt-2 text-xs">
					* Imposto estimado com base na alíquota de IR configurada. Dados do
					Tax Engine (quando disponível) substituirão esta estimativa.
				</p>
			)}
		</div>
	)
}

export { AnnualRollupTable }
