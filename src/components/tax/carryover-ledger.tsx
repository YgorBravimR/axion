import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
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
		<Table aria-label="Histórico de Prejuízo a Compensar">
			<TableHeader>
				<TableRow>
					<TableHead>Mês</TableHead>
					<TableHead className="text-right">Resultado Líquido</TableHead>
					<TableHead className="text-right">Compensado</TableHead>
					<TableHead className="text-right">Saldo Restante</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{history.map((row) => {
					const isLoss = row.netGainCents < 0
					return (
						<TableRow
							key={new Date(row.month).toISOString()}
							className={cn(
								isLoss ? "bg-trade-sell/5" : row.consumed > 0 ? "bg-trade-buy/5" : "",
							)}
						>
							<TableCell className="capitalize">{fmtMonth(row.month)}</TableCell>
							<TableCell className={cn("text-right tabular-nums", isLoss ? "text-trade-sell" : "text-trade-buy")}>
								{fmt(row.netGainCents)}
							</TableCell>
							<TableCell className="text-right tabular-nums text-txt-300">
								{row.consumed > 0 ? fmt(row.consumed) : "—"}
							</TableCell>
							<TableCell className={cn("text-right tabular-nums font-medium", row.balanceCents > 0 ? "text-trade-sell" : "text-txt-300")}>
								{row.balanceCents > 0 ? fmt(row.balanceCents) : "—"}
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}

export type { CarryoverHistoryRow, CarryoverLedgerProps }
export { CarryoverLedger }
