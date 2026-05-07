import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/formatting"
import type { Locale } from "@/i18n/config"

interface FeeBreakdownRow {
	date: Date
	contractsExecuted: number
	txCorretagem: number
	txRegistro: number
	emolumentos: number
	iss: number
	irrf: number
	subtotal: number
}

interface FeeBreakdownTotals {
	txCorretagem: number
	txRegistro: number
	emolumentos: number
	iss: number
	irrf: number
	subtotal: number
}

interface FeeBreakdownTableProps {
	rows: FeeBreakdownRow[]
	totals: FeeBreakdownTotals
	locale?: Locale
}

const FeeBreakdownTable = ({ rows, totals, locale = "pt-BR" }: FeeBreakdownTableProps) => {
	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")
	const fmtDate = (date: Date) =>
		new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(new Date(date))

	const cols = ["Data", "Cnts.", "Corretagem", "Registro", "Emolumentos", "ISS", "IRRF", "Total"] as const

	return (
		<Table className="font-mono" aria-label="Detalhamento de Taxas por Dia">
			<TableHeader>
				<TableRow>
					{cols.map((col) => (
						<TableHead key={col} className="text-right first:text-left">
							{col}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={new Date(row.date).toISOString()}>
						<TableCell>{fmtDate(row.date)}</TableCell>
						<TableCell className="text-right text-txt-300">{row.contractsExecuted}</TableCell>
						<TableCell className="text-right">{fmt(row.txCorretagem)}</TableCell>
						<TableCell className="text-right">{fmt(row.txRegistro)}</TableCell>
						<TableCell className="text-right">{fmt(row.emolumentos)}</TableCell>
						<TableCell className="text-right text-txt-300">{fmt(row.iss)}</TableCell>
						<TableCell className="text-right">{fmt(row.irrf)}</TableCell>
						<TableCell className="text-right font-medium">{fmt(row.subtotal)}</TableCell>
					</TableRow>
				))}
			</TableBody>
			<TableFooter>
				<TableRow>
					<TableCell colSpan={2}>Total</TableCell>
					<TableCell className="text-right">{fmt(totals.txCorretagem)}</TableCell>
					<TableCell className="text-right">{fmt(totals.txRegistro)}</TableCell>
					<TableCell className="text-right">{fmt(totals.emolumentos)}</TableCell>
					<TableCell className="text-right text-txt-300">{fmt(totals.iss)}</TableCell>
					<TableCell className="text-right">{fmt(totals.irrf)}</TableCell>
					<TableCell className="text-right text-acc-100">{fmt(totals.subtotal)}</TableCell>
				</TableRow>
			</TableFooter>
		</Table>
	)
}

export type { FeeBreakdownRow, FeeBreakdownTotals, FeeBreakdownTableProps }
export { FeeBreakdownTable }
