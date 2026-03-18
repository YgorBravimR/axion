"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"
import { Link } from "@/i18n/routing"
import { AccountSelector, type AccountOption } from "./account-selector"
import { ComparisonStatsTable } from "./comparison-stats-table"
import { ComparisonEquityChart } from "./comparison-equity-chart"
import { ComparisonConfigSummary } from "./comparison-config-summary"
import { ComparisonNormalizedTable } from "./comparison-normalized-table"
import { ExpectancyModeToggle, type ExpectancyMode } from "@/components/analytics/expectancy-mode-toggle"
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
		if (selectedIds.length < 2) return

		startTransition(async () => {
			const result = await getAccountComparisonData(selectedIds)
			if (result.status === "success" && result.data) {
				setComparisonData(result.data)
			}
		})
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500">
			{/* Header */}
			<div className="flex flex-col gap-s-300 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-s-300">
					<Link
						href="/analytics"
						className="text-txt-300 hover:text-txt-100 transition-colors"
						aria-label={t("backToAnalytics")}
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
					<div>
						<h1 className="text-body sm:text-heading text-txt-100 font-semibold">
							{t("title")}
						</h1>
						<p className="text-tiny sm:text-small text-txt-300">
							{t("subtitle")}
						</p>
					</div>
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
					{/* Stats Table */}
					<ComparisonStatsTable
						accounts={comparisonData.accounts}
						expectancyMode={expectancyMode}
					/>

					{/* Normalized Monetary Comparison */}
					<ComparisonNormalizedTable
						accounts={comparisonData.accounts}
					/>

					{/* Equity Chart */}
					<ComparisonEquityChart accounts={comparisonData.accounts} />

					{/* Config Summary */}
					<ComparisonConfigSummary
						accounts={comparisonData.accounts}
					/>
				</div>
			)}
		</div>
	)
}

export { AccountComparisonContent }
