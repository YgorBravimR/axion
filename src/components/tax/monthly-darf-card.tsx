"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"
import type { MonthlyDarfRow } from "@/lib/tax/types"

interface MonthlyDarfCardProps {
	ledgerRow: MonthlyDarfRow
	onMarkPaid: (_paidAmountCents: number) => Promise<void>
	locale?: Locale
	isProp?: boolean
	isFinal?: boolean
}

const STATUS_VARIANTS: Record<
	MonthlyDarfRow["darfStatus"],
	"default" | "secondary" | "destructive" | "outline"
> = {
	pending: "outline",
	paid: "default",
	exempt: "secondary",
	overdue: "destructive",
}

const MonthlyDarfCard = ({
	ledgerRow,
	onMarkPaid,
	locale = "pt-BR",
	isProp = false,
	isFinal = true,
}: MonthlyDarfCardProps) => {
	const t = useTranslations("tax.monthlyDarf")
	const [isPending, setIsPending] = useState(false)
	const [isPrompting, setIsPrompting] = useState(false)
	const [paidInputCents, setPaidInputCents] = useState<number | null>(
		ledgerRow.darfDueCents
	)

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
		if (paidInputCents === null || paidInputCents < 0) {
			return
		}
		setIsPending(true)
		try {
			await onMarkPaid(paidInputCents)
			setIsPrompting(false)
		} finally {
			setIsPending(false)
		}
	}

	const paidDiffCents =
		ledgerRow.darfPaidAmountCents !== null
			? ledgerRow.darfPaidAmountCents - ledgerRow.darfDueCents
			: null

	const rows: Array<{ label: string; value: number; muted?: boolean }> = [
		{ label: t("rows.grossResult"), value: ledgerRow.grossGainCents },
		{
			label: t("rows.txCorretagem"),
			value: -ledgerRow.totalTxCorretagemCents,
			muted: true,
		},
		{
			label: t("rows.txRegistro"),
			value: -ledgerRow.totalTxRegistroCents,
			muted: true,
		},
		{
			label: t("rows.emolumentos"),
			value: -ledgerRow.totalEmolumentosCents,
			muted: true,
		},
		{
			label: t("rows.issMunicipal"),
			value: -ledgerRow.totalIssCents,
			muted: true,
		},
		{
			label: t("rows.netResult"),
			value: ledgerRow.netGainBeforeCarryoverCents,
		},
		{
			label: t("rows.carryoverConsumed"),
			value: -ledgerRow.carryoverConsumedCents,
			muted: true,
		},
		{ label: t("rows.taxableBase"), value: ledgerRow.taxableGainCents },
		{ label: t("rows.irGross"), value: ledgerRow.irGrossCents },
		{ label: t("rows.irrfWithheld"), value: -ledgerRow.irrfCents, muted: true },
	]

	return (
		<Card id={`darf-card-${ledgerRow.id}`}>
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm font-medium">{t("cardTitle")}</CardTitle>
				<Badge
					id={`darf-status-${ledgerRow.id}`}
					variant={isFinal ? STATUS_VARIANTS[ledgerRow.darfStatus] : "outline"}
				>
					{isFinal ? t(`status.${ledgerRow.darfStatus}`) : t("inCourseLabel")}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-2">
				{isProp ? (
					<p className="text-muted-foreground text-sm">
						{t("propAccountNote")}
					</p>
				) : (
					<>
						<Table aria-label={t("tableAriaLabel")}>
							<TableBody>
								{rows.map(({ label, value, muted }) => (
									<TableRow key={label} className={cn(muted && "text-txt-300")}>
										<TableCell>{label}</TableCell>
										<TableCell
											className={cn(
												"text-right tabular-nums",
												value < 0
													? "text-trade-sell"
													: value > 0
														? "text-trade-buy"
														: ""
											)}
										>
											{fmt(value)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						<div className="border-border flex items-center justify-between border-t pt-3">
							<span className="text-sm font-semibold">{t("darfDue")}</span>
							<span
								className={cn(
									"text-acc-100 font-semibold tabular-nums",
									ledgerRow.darfDueCents === 0 && "text-muted-foreground"
								)}
							>
								{fmt(ledgerRow.darfDueCents)}
							</span>
						</div>

						{ledgerRow.darfDueDate && (
							<p className="text-muted-foreground text-xs">
								{t("dueDate")}{" "}
								{new Intl.DateTimeFormat(locale, {
									day: "2-digit",
									month: "2-digit",
									year: "numeric",
								}).format(new Date(ledgerRow.darfDueDate))}
							</p>
						)}

						{!isFinal && (
							<p className="border-bg-300 bg-bg-100 px-m-400 py-s-200 text-txt-300 mt-2 rounded-sm border border-dashed text-xs">
								{t("inCourseNotice")}
							</p>
						)}

						{isFinal &&
							ledgerRow.darfStatus === "pending" &&
							ledgerRow.darfDueCents > 0 &&
							!isPrompting && (
								<Button
									id={`darf-mark-paid-${ledgerRow.id}`}
									size="sm"
									variant="outline"
									onClick={handleOpenPrompt}
									aria-label={t("markPaidButton.ariaLabel")}
									className="mt-2 w-full"
								>
									{t("markPaidButton.label")}
								</Button>
							)}

						{ledgerRow.darfStatus === "pending" && isPrompting && (
							<div className="space-y-s-200 border-bg-300 bg-bg-200 p-s-300 mt-2 rounded-md border">
								<div className="space-y-s-100">
									<Label
										id={`darf-paid-label-${ledgerRow.id}`}
										htmlFor={`darf-paid-input-${ledgerRow.id}`}
										className="text-txt-200 text-xs"
									>
										{t("paidPrompt.label")}
									</Label>
									<CurrencyInput
										id={`darf-paid-input-${ledgerRow.id}`}
										value={paidInputCents}
										onValueChange={setPaidInputCents}
										unit="cents"
										autoFocus
									/>
									<p className="text-txt-300 text-xs">
										{t("paidPrompt.calculated")}{" "}
										<span className="font-mono tabular-nums">
											{fmt(ledgerRow.darfDueCents)}
										</span>
										. {t("paidPrompt.editNote")}
									</p>
								</div>
								<div className="gap-s-200 flex">
									<Button
										id={`darf-paid-confirm-${ledgerRow.id}`}
										size="sm"
										variant="default"
										onClick={handleConfirmPaid}
										disabled={
											isPending || paidInputCents === null || paidInputCents < 0
										}
										className="flex-1"
									>
										{isPending
											? t("paidPrompt.confirmButton.pendingLabel")
											: t("paidPrompt.confirmButton.label")}
									</Button>
									<Button
										id={`darf-paid-cancel-${ledgerRow.id}`}
										size="sm"
										variant="ghost"
										onClick={handleCancelPrompt}
										disabled={isPending}
									>
										{t("paidPrompt.cancelButton")}
									</Button>
								</div>
							</div>
						)}

						{ledgerRow.darfStatus === "paid" && ledgerRow.darfPaidAt && (
							<div className="space-y-s-100">
								<p className="text-trade-buy text-xs">
									{t("paidAt")}{" "}
									{new Intl.DateTimeFormat(locale, {
										day: "2-digit",
										month: "2-digit",
										year: "numeric",
									}).format(new Date(ledgerRow.darfPaidAt))}
									{ledgerRow.darfPaidAmountCents !== null &&
										` — ${fmt(ledgerRow.darfPaidAmountCents)}`}
								</p>
								{paidDiffCents !== null && paidDiffCents !== 0 && (
									<p className="text-txt-300 text-xs">
										{t("paidDiff.calculated")}{" "}
										<span className="font-mono tabular-nums">
											{fmt(ledgerRow.darfDueCents)}
										</span>{" "}
										· {t("paidDiff.diff")}{" "}
										<span
											className={cn(
												"font-mono tabular-nums",
												paidDiffCents > 0 ? "text-trade-sell" : "text-trade-buy"
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
							<p className="text-muted-foreground border-border/40 border-t pt-2 text-xs">
								{t("carryoverOut")} {fmt(ledgerRow.carryoverOutCents)}
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
