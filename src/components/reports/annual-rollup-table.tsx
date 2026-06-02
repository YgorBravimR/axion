// src/components/reports/annual-rollup-table.tsx
"use client"

import { useFormatting } from "@/hooks/use-formatting"
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

const CellBRL = ({
	value,
	highlight = false,
	format,
}: {
	value: number | null
	highlight?: boolean
	format: (_cents: number) => string
}) => {
	if (value === null) {
		return (
			<TableCell className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono">
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
			className={`text-tiny px-s-300 py-s-200 text-right font-mono ${colorClass} tabular-nums`}
		>
			{format(value)}
		</TableCell>
	)
}

const CellNum = ({ value }: { value: number | null }) => (
	<TableCell className="text-txt-100 text-tiny px-s-300 py-s-200 text-right font-mono tabular-nums">
		{value === null ? "—" : value}
	</TableCell>
)

const RowData = ({
	row,
	formatBRL,
}: {
	row: AnnualRollupRow
	formatBRL: (_cents: number) => string
}) => {
	if (row.disabled) {
		return (
			<TableRow className="opacity-30">
				<TableHead
					scope="row"
					className="bg-bg-200 text-txt-200 text-tiny px-s-300 py-s-200 sticky left-0 min-w-[80px] text-left font-medium"
				>
					{row.monthName.slice(0, 3)}
				</TableHead>
				{Array.from({ length: 13 }, (_, i) => `placeholder-${String(i)}`).map(
					(slotId) => (
						<TableCell
							key={slotId}
							className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono"
						>
							—
						</TableCell>
					)
				)}
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
				className="bg-bg-200 text-txt-100 text-tiny px-s-300 py-s-200 sticky left-0 min-w-[80px] text-left font-medium"
			>
				{row.monthName.slice(0, 3)}
			</TableHead>
			<CellBRL value={row.resultadoBruto} format={formatBRL} />
			<CellBRL value={row.resultadoLiquido} highlight format={formatBRL} />
			<CellNum value={row.pontos} />
			<CellBRL value={row.taxas} format={formatBRL} />
			<CellBRL value={row.imposto} format={formatBRL} />
			<CellBRL value={row.aporteInicial} format={formatBRL} />
			<CellBRL value={row.mesAnterior} format={formatBRL} />
			<CellBRL value={row.novoAporte} format={formatBRL} />
			<CellBRL value={row.retirada} format={formatBRL} />
			<CellBRL value={row.capitalInvestido} format={formatBRL} />
			<CellBRL value={row.patrimonio} format={formatBRL} />
			<CellNum value={row.diasGain} />
			<CellNum value={row.diasLoss} />
		</TableRow>
	)
}

const AnnualRollupTable = ({ data, className }: AnnualRollupTableProps) => {
	const { rows, totals, taxEstimated } = data
	const { formatCurrency } = useFormatting()

	const formatBRL = (cents: number): string =>
		formatCurrency(cents / 100, "BRL")

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
								className="bg-bg-300/50 text-txt-300 text-tiny px-s-300 py-s-200 sticky left-0 text-left font-medium tracking-wider uppercase"
							>
								Mês
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={3}
								className="text-txt-300 border-acc-100/20 text-tiny px-s-300 py-s-100 border-b text-center font-medium tracking-wider uppercase"
							>
								Resultado
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={2}
								className="text-txt-300 border-acc-100/20 text-tiny px-s-300 py-s-100 border-b text-center font-medium tracking-wider uppercase"
							>
								Despesas
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={6}
								className="text-txt-300 border-acc-100/20 text-tiny px-s-300 py-s-100 border-b text-center font-medium tracking-wider uppercase"
							>
								Capital
							</TableHead>
							<TableHead
								scope="colgroup"
								colSpan={2}
								className="text-txt-300 border-acc-100/20 text-tiny px-s-300 py-s-100 border-b text-center font-medium tracking-wider uppercase"
							>
								Dias
							</TableHead>
						</TableRow>
						<TableRow className="bg-bg-300/30">
							<TableHead
								scope="col"
								className="bg-bg-300/30 px-s-300 py-s-200 sticky left-0"
							/>
							{["Bruto", "Líquido", "Pontos"].map((h) => (
								<TableHead
									key={h}
									scope="col"
									className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono font-medium"
								>
									{h}
								</TableHead>
							))}
							<TableHead
								scope="col"
								className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono font-medium"
							>
								Taxas
							</TableHead>
							<TableHead
								scope="col"
								className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono font-medium"
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
									className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono font-medium whitespace-nowrap"
								>
									{h}
								</TableHead>
							))}
							<TableHead
								scope="col"
								className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono font-medium"
							>
								G
							</TableHead>
							<TableHead
								scope="col"
								className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono font-medium"
							>
								L
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<RowData key={row.month} row={row} formatBRL={formatBRL} />
						))}
					</TableBody>
					<TableFooter>
						<TableRow className="bg-bg-300 border-bg-300 border-t-2 font-semibold">
							<TableHead
								scope="row"
								className="bg-bg-300 text-txt-100 text-tiny px-s-300 py-s-200 sticky left-0 text-left"
							>
								Total
							</TableHead>
							<CellBRL value={totals.resultadoBruto} format={formatBRL} />
							<CellBRL
								value={totals.resultadoLiquido}
								highlight
								format={formatBRL}
							/>
							<CellNum value={totals.pontos} />
							<CellBRL value={totals.taxas} format={formatBRL} />
							<CellBRL value={totals.imposto} format={formatBRL} />
							<TableCell className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono">
								—
							</TableCell>
							<TableCell className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono">
								—
							</TableCell>
							<CellBRL value={totals.novoAporte} format={formatBRL} />
							<CellBRL value={totals.retirada} format={formatBRL} />
							<TableCell className="text-txt-300 text-tiny px-s-300 py-s-200 text-right font-mono">
								—
							</TableCell>
							<CellBRL value={totals.patrimonio} format={formatBRL} />
							<CellNum value={totals.diasGain} />
							<CellNum value={totals.diasLoss} />
						</TableRow>
					</TableFooter>
				</Table>
			</div>

			{taxEstimated && (
				<p className="text-txt-300 text-tiny mt-2">
					* Imposto estimado com base na alíquota de IR configurada. Dados do
					Tax Engine (quando disponível) substituirão esta estimativa.
				</p>
			)}
		</div>
	)
}

export { AnnualRollupTable }
