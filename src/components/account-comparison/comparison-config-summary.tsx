"use client"

import { useTranslations } from "next-intl"
import type { AccountComparisonMetrics } from "@/types"
import { COMPARISON_COLORS } from "./comparison-colors"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

interface ComparisonConfigSummaryProps {
	accounts: AccountComparisonMetrics[]
}

const ComparisonConfigSummary = ({
	accounts,
}: ComparisonConfigSummaryProps) => {
	const t = useTranslations("accountComparison.config")

	return (
		<div
			id="comparison-config-summary"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 overflow-x-auto rounded-lg border"
		>
			<h3 className="text-small sm:text-body text-txt-100 mb-s-300 font-semibold">
				{t("title")}
			</h3>

			<Table className="text-small w-full">
				<TableHeader>
					<TableRow className="border-bg-300 border-b">
						<TableHead className="text-txt-300 py-s-200 pr-m-400 text-left font-medium">
							{t("title")}
						</TableHead>
						{accounts.map((account, index) => (
							<TableHead
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right font-medium"
							>
								<div className="gap-s-200 flex items-center justify-end">
									<span
										className="inline-block h-2.5 w-2.5 rounded-full"
										style={{
											backgroundColor:
												COMPARISON_COLORS[index % COMPARISON_COLORS.length],
										}}
									/>
									{account.accountName}
								</div>
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow className="border-bg-300 border-b">
						<TableCell className="text-txt-300 py-s-200 pr-m-400">
							{t("accountType")}
						</TableCell>
						{accounts.map((account) => (
							<TableCell
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right"
							>
								{account.accountType}
							</TableCell>
						))}
					</TableRow>
				</TableBody>
			</Table>
		</div>
	)
}

export { ComparisonConfigSummary }
