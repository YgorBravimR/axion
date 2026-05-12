"use client"

import { useTranslations } from "next-intl"
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

const FeeBreakdownTable = ({
	rows,
	totals,
	locale = "pt-BR",
}: FeeBreakdownTableProps) => {
	const t = useTranslations("tax.feeBreakdown")
	const fmt = (cents: number) => formatCurrency(cents / 100, locale, "BRL")
	const fmtDate = (date: Date) =>
		new Intl.DateTimeFormat(locale, {
			day: "2-digit",
			month: "2-digit",
		}).format(new Date(date))

	const cols = [
		t("columns.date"),
		t("columns.contracts"),
		t("columns.corretagem"),
		t("columns.registro"),
		t("columns.emolumentos"),
		t("columns.iss"),
		t("columns.irrf"),
		t("columns.total"),
	]

	return (
		<Table className="font-mono" aria-label={t("tableAriaLabel")}>
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
						<TableCell className="text-txt-300 text-right">
							{row.contractsExecuted}
						</TableCell>
						<TableCell className="text-right">
							{fmt(row.txCorretagem)}
						</TableCell>
						<TableCell className="text-right">{fmt(row.txRegistro)}</TableCell>
						<TableCell className="text-right">{fmt(row.emolumentos)}</TableCell>
						<TableCell className="text-txt-300 text-right">
							{fmt(row.iss)}
						</TableCell>
						<TableCell className="text-right">{fmt(row.irrf)}</TableCell>
						<TableCell className="text-right font-medium">
							{fmt(row.subtotal)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
			<TableFooter>
				<TableRow>
					<TableCell colSpan={2}>{t("footer.total")}</TableCell>
					<TableCell className="text-right">
						{fmt(totals.txCorretagem)}
					</TableCell>
					<TableCell className="text-right">{fmt(totals.txRegistro)}</TableCell>
					<TableCell className="text-right">
						{fmt(totals.emolumentos)}
					</TableCell>
					<TableCell className="text-txt-300 text-right">
						{fmt(totals.iss)}
					</TableCell>
					<TableCell className="text-right">{fmt(totals.irrf)}</TableCell>
					<TableCell className="text-acc-100 text-right">
						{fmt(totals.subtotal)}
					</TableCell>
				</TableRow>
			</TableFooter>
		</Table>
	)
}

export type { FeeBreakdownRow, FeeBreakdownTotals, FeeBreakdownTableProps }
export { FeeBreakdownTable }
