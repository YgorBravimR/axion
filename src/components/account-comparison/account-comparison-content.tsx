"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { AccountSelector, type AccountOption } from "./account-selector"
import { ComparisonStatsTable } from "./comparison-stats-table"
import { ComparisonEquityChart } from "./comparison-equity-chart"
import { ComparisonConfigSummary } from "./comparison-config-summary"
import { ComparisonNormalizedTable } from "./comparison-normalized-table"
import {
	ExpectancyModeToggle,
	type ExpectancyMode,
} from "@/components/analytics/expectancy-mode-toggle"
import { getAccountComparisonData } from "@/app/actions/account-comparison"
import type { AccountComparisonData } from "@/types"
import { useRegisterPageGuide } from "@/components/ui/page-guide"
import { accountComparisonGuide } from "@/components/ui/page-guide/guide-configs/account-comparison"

interface AccountComparisonContentProps {
	accounts: AccountOption[]
}

const AccountComparisonContent = ({
	accounts,
}: AccountComparisonContentProps) => {
	const t = useTranslations("accountComparison")

	useRegisterPageGuide(accountComparisonGuide)

	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [expectancyMode, setExpectancyMode] = useState<ExpectancyMode>("edge")
	const [comparisonData, setComparisonData] =
		useState<AccountComparisonData | null>(null)
	const [isPending, startTransition] = useTransition()

	const handleCompare = () => {
		if (selectedIds.length < 2) {
			return
		}

		startTransition(async () => {
			const result = await getAccountComparisonData(selectedIds)
			if (result.status === "success" && result.data) {
				setComparisonData(result.data)
			}
		})
	}

	return (
		<section
			className="space-y-m-400 sm:space-y-m-500"
			aria-labelledby="account-comparison-heading"
		>
			{/* Section header — renders inline inside Analytics, no back-link */}
			<div className="gap-s-300 flex flex-col sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2
						id="account-comparison-heading"
						className="text-body sm:text-h3 text-txt-100 font-semibold"
					>
						{t("title")}
					</h2>
					<p className="text-tiny sm:text-small text-txt-300">
						{t("subtitle")}
					</p>
				</div>

				{comparisonData && (
					<ExpectancyModeToggle
						mode={expectancyMode}
						onModeChange={setExpectancyMode}
					/>
				)}
			</div>

			{/* Account Selector */}
			<AccountSelector
				accounts={accounts}
				selectedIds={selectedIds}
				onSelectionChange={setSelectedIds}
				onCompare={handleCompare}
				isPending={isPending}
			/>

			{/* Results — only shown after comparison */}
			{comparisonData && (
				<div className="space-y-m-400 sm:space-y-m-500">
					{/* Screen-reader announcement — narrow aria-live region so the entire panel doesn't re-announce on every update */}
					<p className="sr-only" aria-live="polite" aria-atomic="true">
						{t("comparisonComplete", { count: comparisonData.accounts.length })}
					</p>

					{/* Stats Table */}
					<ComparisonStatsTable
						accounts={comparisonData.accounts}
						expectancyMode={expectancyMode}
					/>

					{/* Normalized Monetary Comparison */}
					<ComparisonNormalizedTable accounts={comparisonData.accounts} />

					{/* Equity Chart */}
					<ComparisonEquityChart accounts={comparisonData.accounts} />

					{/* Config Summary */}
					<ComparisonConfigSummary accounts={comparisonData.accounts} />
				</div>
			)}
		</section>
	)
}

export { AccountComparisonContent }
