import { formatCurrency } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"

interface CarryoverHistoryRow {
	month: Date
	balanceCents: number
	consumed: number
	netGainCents: number
}

interface CarryoverLedgerProps {
	history: CarryoverHistoryRow[]
	locale?: Locale
}

const CarryoverLedger = ({ history, locale = "pt-BR" }: CarryoverLedgerProps) => {
	if (history.length === 0) {
		return <p className="text-sm text-muted-foreground">Nenhum histórico de carryover disponível.</p>
	}

	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")
	const fmtMonth = (date: Date) =>
		new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(date))

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm" aria-label="Histórico de Prejuízo a Compensar">
				<thead>
					<tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wide">
						<th className="py-2 text-left font-medium">Mês</th>
						<th className="py-2 text-right font-medium">Resultado Líquido</th>
						<th className="py-2 text-right font-medium">Compensado</th>
						<th className="py-2 text-right font-medium">Saldo Restante</th>
					</tr>
				</thead>
				<tbody>
					{history.map((row) => {
						const isLoss = row.netGainCents < 0
						return (
							<tr
								key={new Date(row.month).toISOString()}
								className={cn(
									"border-b border-border/40 last:border-0",
									isLoss ? "bg-trade-sell/5" : row.consumed > 0 ? "bg-trade-buy/5" : "",
								)}
							>
								<td className="py-2 capitalize">{fmtMonth(row.month)}</td>
								<td className={cn("py-2 text-right tabular-nums", isLoss ? "text-trade-sell" : "text-trade-buy")}>
									{fmt(row.netGainCents)}
								</td>
								<td className="py-2 text-right tabular-nums text-muted-foreground">
									{row.consumed > 0 ? fmt(row.consumed) : "—"}
								</td>
								<td className={cn("py-2 text-right tabular-nums font-medium", row.balanceCents > 0 ? "text-trade-sell" : "text-muted-foreground")}>
									{row.balanceCents > 0 ? fmt(row.balanceCents) : "—"}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

export type { CarryoverHistoryRow, CarryoverLedgerProps }
export { CarryoverLedger }
