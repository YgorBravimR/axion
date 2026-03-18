"use client"

import { useTranslations } from "next-intl"
import type { AccountComparisonMetrics } from "@/types"
import { COMPARISON_COLORS } from "./comparison-colors"

interface ComparisonConfigSummaryProps {
	accounts: AccountComparisonMetrics[]
}

const ComparisonConfigSummary = ({
	accounts,
}: ComparisonConfigSummaryProps) => {
	const t = useTranslations("accountComparison.config")

	return (
		<div id="comparison-config-summary" className="border-bg-300 bg-bg-200 overflow-x-auto rounded-lg border p-s-300 sm:p-m-400">
			<h3 className="text-small sm:text-body text-txt-100 mb-s-300 font-semibold">
				{t("title")}
			</h3>

			<table className="w-full text-small">
				<thead>
					<tr className="border-bg-300 border-b">
						<th className="text-txt-300 py-s-200 pr-m-400 text-left font-medium">
							{t("title")}
						</th>
						{accounts.map((account, index) => (
							<th
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right font-medium"
							>
								<div className="flex items-center justify-end gap-s-200">
									<span
										className="inline-block h-2.5 w-2.5 rounded-full"
										style={{
											backgroundColor:
												COMPARISON_COLORS[
													index % COMPARISON_COLORS.length
												],
										}}
									/>
									{account.accountName}
								</div>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					<tr className="border-bg-300 border-b">
						<td className="text-txt-300 py-s-200 pr-m-400">
							{t("accountType")}
						</td>
						{accounts.map((account) => (
							<td
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right"
							>
								{account.accountType}
							</td>
						))}
					</tr>
					<tr className="border-bg-300 border-b">
						<td className="text-txt-300 py-s-200 pr-m-400">
							{t("commission")}
						</td>
						{accounts.map((account) => (
							<td
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right"
							>
								R$ {account.config.defaultCommission.toFixed(2)}
							</td>
						))}
					</tr>
					<tr className="border-bg-300 border-b">
						<td className="text-txt-300 py-s-200 pr-m-400">
							{t("fees")}
						</td>
						{accounts.map((account) => (
							<td
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right"
							>
								R$ {account.config.defaultFees.toFixed(2)}
							</td>
						))}
					</tr>
					<tr>
						<td className="text-txt-300 py-s-200 pr-m-400">
							{t("riskPerTrade")}
						</td>
						{accounts.map((account) => (
							<td
								key={account.accountId}
								className="text-txt-100 py-s-200 px-s-300 text-right"
							>
								{account.config.defaultRiskPerTrade !== null
									? `${account.config.defaultRiskPerTrade}%`
									: t("notSet")}
							</td>
						))}
					</tr>
				</tbody>
			</table>
		</div>
	)
}

export { ComparisonConfigSummary }
