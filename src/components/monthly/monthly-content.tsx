"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { startOfMonth, subMonths } from "date-fns"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { MonthNavigator } from "./month-navigator"
import { LoadingSpinner } from "@/components/shared"
import { PropProfitSummary } from "./prop-profit-summary"
import { MonthlyProjection } from "./monthly-projection"
import { MonthComparison } from "./month-comparison"
import { WeeklyBreakdown } from "./weekly-breakdown"
import {
	getMonthlyResultsWithProp,
	getMonthlyProjection,
	getMonthComparison,
	type MonthlyResultsWithProp,
	type MonthlyProjection as MonthlyProjectionData,
	type MonthComparison as MonthComparisonData,
} from "@/app/actions/reports"

interface MonthlyContentProps {
	initialMonthlyData: MonthlyResultsWithProp | null
	initialProjectionData: MonthlyProjectionData | null
	initialComparisonData: MonthComparisonData | null
}

export const MonthlyContent = ({
	initialMonthlyData,
	initialProjectionData,
	initialComparisonData,
}: MonthlyContentProps) => {
	const t = useTranslations("monthly")
	const effectiveDate = useEffectiveDate()
	const [isPending, startTransition] = useTransition()
	const [currentDate, setCurrentDate] = useState(() => startOfMonth(effectiveDate))
	const [monthOffset, setMonthOffset] = useState(0)

	const [monthlyData, setMonthlyData] = useState<MonthlyResultsWithProp | null>(
		initialMonthlyData
	)
	const [projectionData, setProjectionData] =
		useState<MonthlyProjectionData | null>(initialProjectionData)
	const [comparisonData, setComparisonData] =
		useState<MonthComparisonData | null>(initialComparisonData)
	const [error, setError] = useState<string | null>(null)

	// Reset state when initial props change (e.g., account switch)
	useEffect(() => {
		setMonthlyData(initialMonthlyData)
		setProjectionData(initialProjectionData)
		setComparisonData(initialComparisonData)
		setMonthOffset(0)
		setCurrentDate(startOfMonth(effectiveDate))
	}, [initialMonthlyData, initialProjectionData, initialComparisonData, effectiveDate])

	// Determine if we're viewing the current month
	const isCurrentMonth = monthOffset === 0

	const loadData = async (offset: number) => {
		setError(null)

		const [monthlyResult, comparisonResult] = await Promise.all([
			getMonthlyResultsWithProp(offset),
			getMonthComparison(offset),
		])

		if (monthlyResult.status === "success" && monthlyResult.data) {
			setMonthlyData(monthlyResult.data)
		} else {
			setError(monthlyResult.message || t("errorLoading"))
		}

		if (comparisonResult.status === "success" && comparisonResult.data) {
			setComparisonData(comparisonResult.data)
		}

		// Only load projection for current month
		if (offset === 0) {
			const projectionResult = await getMonthlyProjection()
			if (projectionResult.status === "success" && projectionResult.data) {
				setProjectionData(projectionResult.data)
			}
		} else {
			setProjectionData(null)
		}
	}

	// Load data when month changes (but not on initial render since we have initial data)
	useEffect(() => {
		// Skip initial render - we already have initial data
		if (monthOffset === 0) return

		startTransition(() => {
			loadData(monthOffset)
		})
	}, [monthOffset])

	const handleMonthChange = (newDate: Date) => {
		const currentMonthStart = startOfMonth(effectiveDate)
		const newMonthStart = startOfMonth(newDate)

		// Calculate offset from current month
		const diffMonths =
			(currentMonthStart.getFullYear() - newMonthStart.getFullYear()) * 12 +
			(currentMonthStart.getMonth() - newMonthStart.getMonth())

		setMonthOffset(diffMonths)
		setCurrentDate(newMonthStart)
	}

	if (isPending && !monthlyData) {
		return <LoadingSpinner size="md" className="h-96" />
	}

	if (error && !monthlyData) {
		return (
			<div className="rounded-lg border border-fb-error/20 bg-fb-error/10 p-m-500 text-center">
				<p className="text-small text-fb-error">{error}</p>
			</div>
		)
	}

	return (
		<div className="space-y-m-400 sm:space-y-m-500 lg:space-y-m-600">
			{/* Month Navigator */}
			<MonthNavigator
				currentDate={currentDate}
				onMonthChange={handleMonthChange}
				maxDate={startOfMonth(effectiveDate)}
			/>

			{isPending && <LoadingSpinner size="sm" className="py-m-400" />}

			{monthlyData && !isPending && (
				<>
					{/* Main Profit Summary */}
					{monthlyData.report.totalTrades > 0 ? (
						<>
							<PropProfitSummary
								data={monthlyData.prop}
								isPropAccount={monthlyData.settings.isPropAccount}
								propFirmName={monthlyData.settings.propFirmName}
								profitSharePercentage={
									monthlyData.settings.profitSharePercentage
								}
								taxRate={monthlyData.settings.dayTradeTaxRate}
							/>

							{/* Projection (only for current month) */}
							{isCurrentMonth && projectionData && (
								<MonthlyProjection data={projectionData} />
							)}

							{/* Month Comparison */}
							{comparisonData && (
								<MonthComparison
									current={comparisonData.currentMonth}
									previous={comparisonData.previousMonth}
									changes={comparisonData.changes}
								/>
							)}

							{/* Weekly Breakdown */}
							<WeeklyBreakdown weeks={monthlyData.weeklyBreakdown} />
						</>
					) : (
						<div className="rounded-lg border border-bg-300 bg-bg-200 p-l-700 text-center">
							<p className="text-txt-300">{t("noData")}</p>
						</div>
					)}
				</>
			)}
		</div>
	)
}
