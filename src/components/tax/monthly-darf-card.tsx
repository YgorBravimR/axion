"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"
import type { MonthlyDarfRow } from "@/app/actions/tax-engine"

interface MonthlyDarfCardProps {
	ledgerRow: MonthlyDarfRow
	onMarkPaid: (paidAmountCents: number) => Promise<void>
	locale?: Locale
}

const STATUS_LABELS: Record<MonthlyDarfRow["darfStatus"], string> = {
	pending: "Pendente",
	paid: "Pago",
	exempt: "Isento",
	overdue: "Vencido",
}

const STATUS_VARIANTS: Record<MonthlyDarfRow["darfStatus"], "default" | "secondary" | "destructive" | "outline"> = {
	pending: "outline",
	paid: "default",
	exempt: "secondary",
	overdue: "destructive",
}

const MonthlyDarfCard = ({ ledgerRow, onMarkPaid, locale = "pt-BR" }: MonthlyDarfCardProps) => {
	const [isPending, setIsPending] = useState(false)

	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")

	const handleMarkPaid = async () => {
		setIsPending(true)
		try {
			await onMarkPaid(ledgerRow.darfDueCents)
		} finally {
			setIsPending(false)
		}
	}

	const isProp = ledgerRow.darfDueCents === 0 && ledgerRow.grossGainCents === 0

	const rows: Array<{ label: string; value: number; muted?: boolean }> = [
		{ label: "Resultado Bruto",      value: ledgerRow.grossGainCents },
		{ label: "Tx Corretagem",        value: -ledgerRow.totalTxCorretagemCents, muted: true },
		{ label: "Tx Registro",          value: -ledgerRow.totalTxRegistroCents, muted: true },
		{ label: "Emolumentos",          value: -ledgerRow.totalEmolumentosCents, muted: true },
		{ label: "ISS (municipal)",      value: -ledgerRow.totalIssCents, muted: true },
		{ label: "Resultado Líquido",    value: ledgerRow.netGainBeforeCarryoverCents },
		{ label: "Prejuízo Compensado",  value: -ledgerRow.carryoverConsumedCents, muted: true },
		{ label: "Base de Cálculo IR",   value: ledgerRow.taxableGainCents },
		{ label: "IR Bruto (20%)",       value: ledgerRow.irGrossCents },
		{ label: "IRRF Retido (−)",      value: -ledgerRow.irrfCents, muted: true },
	]

	return (
		<Card id={`darf-card-${ledgerRow.id}`}>
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm font-medium">DARF do Mês</CardTitle>
				<Badge
					id={`darf-status-${ledgerRow.id}`}
					variant={STATUS_VARIANTS[ledgerRow.darfStatus]}
				>
					{STATUS_LABELS[ledgerRow.darfStatus]}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-2">
				{isProp ? (
					<p className="text-sm text-muted-foreground">N/A — Conta Prop. O IR é responsabilidade da corretora/mesa.</p>
				) : (
					<>
						<table className="w-full text-sm" aria-label="Detalhamento DARF">
							<tbody>
								{rows.map(({ label, value, muted }) => (
									<tr
										key={label}
										className={cn(
											"border-b border-border/40 last:border-0",
											muted && "text-muted-foreground",
										)}
									>
										<td className="py-1">{label}</td>
										<td
											className={cn(
												"py-1 text-right tabular-nums",
												value < 0 ? "text-trade-sell" : value > 0 ? "text-trade-buy" : "",
											)}
										>
											{fmt(value)}
										</td>
									</tr>
								))}
							</tbody>
						</table>

						<div className="flex items-center justify-between border-t border-border pt-3">
							<span className="font-semibold text-sm">DARF a Pagar</span>
							<span
								className={cn(
									"font-semibold tabular-nums text-acc-100",
									ledgerRow.darfDueCents === 0 && "text-muted-foreground",
								)}
							>
								{fmt(ledgerRow.darfDueCents)}
							</span>
						</div>

						{ledgerRow.darfDueDate && (
							<p className="text-xs text-muted-foreground">
								Vencimento:{" "}
								{new Intl.DateTimeFormat(locale, {
									day: "2-digit",
									month: "2-digit",
									year: "numeric",
								}).format(new Date(ledgerRow.darfDueDate))}
							</p>
						)}

						{ledgerRow.darfStatus === "pending" && ledgerRow.darfDueCents > 0 && (
							<Button
								id={`darf-mark-paid-${ledgerRow.id}`}
								size="sm"
								variant="outline"
								onClick={handleMarkPaid}
								disabled={isPending}
								aria-label="Marcar DARF como pago"
								className="w-full mt-2"
							>
								{isPending ? "Registrando..." : "Marcar como Pago"}
							</Button>
						)}

						{ledgerRow.darfStatus === "paid" && ledgerRow.darfPaidAt && (
							<p className="text-xs text-trade-buy">
								Pago em{" "}
								{new Intl.DateTimeFormat(locale, {
									day: "2-digit",
									month: "2-digit",
									year: "numeric",
								}).format(new Date(ledgerRow.darfPaidAt))}
								{ledgerRow.darfPaidAmountCents != null &&
									` — ${fmt(ledgerRow.darfPaidAmountCents)}`}
							</p>
						)}

						{ledgerRow.carryoverOutCents > 0 && (
							<p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
								Prejuízo a Compensar próximo mês: {fmt(ledgerRow.carryoverOutCents)}
							</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	)
}

export type { MonthlyDarfCardProps }
export { MonthlyDarfCard }
