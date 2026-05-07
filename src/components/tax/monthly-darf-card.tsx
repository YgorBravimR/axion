"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"
import type { MonthlyDarfRow } from "@/lib/tax/types"

interface MonthlyDarfCardProps {
	ledgerRow: MonthlyDarfRow
	onMarkPaid: (paidAmountCents: number) => Promise<void>
	locale?: Locale
	isProp?: boolean
	isFinal?: boolean
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

const MonthlyDarfCard = ({ ledgerRow, onMarkPaid, locale = "pt-BR", isProp = false, isFinal = true }: MonthlyDarfCardProps) => {
	const [isPending, setIsPending] = useState(false)
	const [isPrompting, setIsPrompting] = useState(false)
	const [paidInputCents, setPaidInputCents] = useState<number | null>(ledgerRow.darfDueCents)

	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")

	const handleOpenPrompt = () => {
		setPaidInputCents(ledgerRow.darfDueCents)
		setIsPrompting(true)
	}

	const handleCancelPrompt = () => {
		setIsPrompting(false)
		setPaidInputCents(ledgerRow.darfDueCents)
	}

	const handleConfirmPaid = async () => {
		if (paidInputCents == null || paidInputCents < 0) return
		setIsPending(true)
		try {
			await onMarkPaid(paidInputCents)
			setIsPrompting(false)
		} finally {
			setIsPending(false)
		}
	}

	const paidDiffCents =
		ledgerRow.darfPaidAmountCents != null
			? ledgerRow.darfPaidAmountCents - ledgerRow.darfDueCents
			: null

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
					variant={isFinal ? STATUS_VARIANTS[ledgerRow.darfStatus] : "outline"}
				>
					{isFinal ? STATUS_LABELS[ledgerRow.darfStatus] : "Em curso"}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-2">
				{isProp ? (
					<p className="text-sm text-muted-foreground">N/A — Conta Prop. O IR é responsabilidade da corretora/mesa.</p>
				) : (
					<>
						<Table aria-label="Detalhamento DARF">
							<TableBody>
								{rows.map(({ label, value, muted }) => (
									<TableRow key={label} className={cn(muted && "text-txt-300")}>
										<TableCell>{label}</TableCell>
										<TableCell
											className={cn(
												"text-right tabular-nums",
												value < 0 ? "text-trade-sell" : value > 0 ? "text-trade-buy" : "",
											)}
										>
											{fmt(value)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

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

						{!isFinal && (
							<p className="mt-2 rounded-sm border border-dashed border-bg-300 bg-bg-100 px-m-400 py-s-200 text-xs text-txt-300">
								Mês ainda em curso · prévia da DARF. Pagamento só é exigido após o último dia útil do mês seguinte.
							</p>
						)}

						{isFinal && ledgerRow.darfStatus === "pending" && ledgerRow.darfDueCents > 0 && !isPrompting && (
							<Button
								id={`darf-mark-paid-${ledgerRow.id}`}
								size="sm"
								variant="outline"
								onClick={handleOpenPrompt}
								aria-label="Marcar DARF como pago"
								className="w-full mt-2"
							>
								Marcar como Pago
							</Button>
						)}

						{ledgerRow.darfStatus === "pending" && isPrompting && (
							<div className="mt-2 space-y-s-200 rounded-md border border-bg-300 bg-bg-200 p-s-300">
								<div className="space-y-s-100">
									<Label
										id={`darf-paid-label-${ledgerRow.id}`}
										htmlFor={`darf-paid-input-${ledgerRow.id}`}
										className="text-xs text-txt-200"
									>
										Valor efetivamente pago
									</Label>
									<CurrencyInput
										id={`darf-paid-input-${ledgerRow.id}`}
										value={paidInputCents}
										onValueChange={setPaidInputCents}
										unit="cents"
										autoFocus
									/>
									<p className="text-xs text-txt-300">
										Calculado: <span className="font-mono tabular-nums">{fmt(ledgerRow.darfDueCents)}</span>. Edite caso a guia paga tenha valor diferente — ambos serão registrados.
									</p>
								</div>
								<div className="flex gap-s-200">
									<Button
										id={`darf-paid-confirm-${ledgerRow.id}`}
										size="sm"
										variant="default"
										onClick={handleConfirmPaid}
										disabled={isPending || paidInputCents == null || paidInputCents < 0}
										className="flex-1"
									>
										{isPending ? "Registrando..." : "Confirmar pagamento"}
									</Button>
									<Button
										id={`darf-paid-cancel-${ledgerRow.id}`}
										size="sm"
										variant="ghost"
										onClick={handleCancelPrompt}
										disabled={isPending}
									>
										Cancelar
									</Button>
								</div>
							</div>
						)}

						{ledgerRow.darfStatus === "paid" && ledgerRow.darfPaidAt && (
							<div className="space-y-s-100">
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
								{paidDiffCents != null && paidDiffCents !== 0 && (
									<p className="text-xs text-txt-300">
										Calculado: <span className="font-mono tabular-nums">{fmt(ledgerRow.darfDueCents)}</span> · Diferença:{" "}
										<span
											className={cn(
												"font-mono tabular-nums",
												paidDiffCents > 0 ? "text-trade-sell" : "text-trade-buy",
											)}
										>
											{paidDiffCents > 0 ? "+" : ""}
											{fmt(paidDiffCents)}
										</span>
									</p>
								)}
							</div>
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
