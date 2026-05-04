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
		<div className="overflow-x-auto">
			<table className="w-full text-sm font-mono" aria-label="Detalhamento de Taxas por Dia">
				<thead>
					<tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wide">
						{cols.map((col) => (
							<th key={col} className="py-2 text-right first:text-left font-medium">
								{col}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={new Date(row.date).toISOString()} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
							<td className="py-1.5 text-left">{fmtDate(row.date)}</td>
							<td className="py-1.5 text-right text-muted-foreground">{row.contractsExecuted}</td>
							<td className="py-1.5 text-right">{fmt(row.txCorretagem)}</td>
							<td className="py-1.5 text-right">{fmt(row.txRegistro)}</td>
							<td className="py-1.5 text-right">{fmt(row.emolumentos)}</td>
							<td className="py-1.5 text-right text-muted-foreground">{fmt(row.iss)}</td>
							<td className="py-1.5 text-right">{fmt(row.irrf)}</td>
							<td className="py-1.5 text-right font-medium">{fmt(row.subtotal)}</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="border-t border-border font-semibold">
						<td className="py-2 text-left" colSpan={2}>Total</td>
						<td className="py-2 text-right">{fmt(totals.txCorretagem)}</td>
						<td className="py-2 text-right">{fmt(totals.txRegistro)}</td>
						<td className="py-2 text-right">{fmt(totals.emolumentos)}</td>
						<td className="py-2 text-right text-muted-foreground">{fmt(totals.iss)}</td>
						<td className="py-2 text-right">{fmt(totals.irrf)}</td>
						<td className="py-2 text-right text-acc-100">{fmt(totals.subtotal)}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	)
}

export type { FeeBreakdownRow, FeeBreakdownTotals, FeeBreakdownTableProps }
export { FeeBreakdownTable }
