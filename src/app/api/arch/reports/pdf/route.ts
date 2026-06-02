import { NextResponse, type NextRequest } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"
import {
	getWeeklyReport,
	getMonthlyReport,
	getCommissionFeeImpact,
} from "@/app/actions/reports"
import {
	generateWeeklyReportPdf,
	generateMonthlyReportPdf,
} from "@/lib/pdf/generate-report-pdf"
import {
	isValidReportType,
	parseOffsetParam,
	buildWeeklyPdfFilename,
	buildMonthlyPdfFilename,
} from "@/lib/pdf/report-pdf-helpers"
import type {
	WeeklyReportLabels,
	MonthlyReportLabels,
} from "@/lib/pdf/report-template"

const pdfResponse = (data: Uint8Array, filename: string): NextResponse => {
	// Uint8Array is valid BodyInit at runtime but TS strict mode requires the cast
	return new NextResponse(data as unknown as BodyInit, {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Content-Length": String(data.byteLength),
		},
	})
}

const GET = async (request: NextRequest): Promise<NextResponse> => {
	try {
		await requireAuth()

		const { searchParams } = request.nextUrl
		const type = searchParams.get("type")
		const offset = parseOffsetParam(searchParams.get("offset"))

		if (!isValidReportType(type)) {
			return NextResponse.json(
				{ error: "Invalid report type. Use 'weekly' or 'monthly'." },
				{ status: 400 }
			)
		}

		if (isNaN(offset) || offset < 0) {
			return NextResponse.json(
				{ error: "Invalid offset. Must be a non-negative integer." },
				{ status: 400 }
			)
		}

		// Resolve locale from next-intl context (falls back to pt-BR via routing config)
		const locale = await getLocale()

		// Kick off fee fetch eagerly so it runs in parallel with the type-specific report.
		// Branch before awaiting so TS can narrow the report type inside each branch.
		const feePromise = getCommissionFeeImpact()

		if (type === "weekly") {
			const [feeResult, result] = await Promise.all([
				feePromise,
				getWeeklyReport(offset),
			])

			const feeData =
				feeResult.status === "success" ? (feeResult.data ?? null) : null

			if (result.status !== "success" || !result.data) {
				return NextResponse.json(
					{ error: "No weekly report data available" },
					{ status: 404 }
				)
			}

			const tw = await getTranslations({
				locale,
				namespace: "reports.pdf.weekly",
			})
			const weeklyLabels: WeeklyReportLabels = {
				headerTitle: tw("headerTitle"),
				performanceSummary: tw("performanceSummary"),
				netPnl: tw("netPnl"),
				grossPnl: tw("grossPnl"),
				winRate: tw("winRate"),
				profitFactor: tw("profitFactor"),
				avgR: tw("avgR"),
				trades: tw("trades"),
				dailyBreakdown: tw("dailyBreakdown"),
				colDate: tw("colDate"),
				colTrades: tw("colTrades"),
				colWL: tw("colWL"),
				colWinRate: tw("colWinRate"),
				colPnl: tw("colPnl"),
				topTrades: tw("topTrades"),
				bestTrades: tw("bestTrades"),
				worstTrades: tw("worstTrades"),
				commissionFeeImpact: tw("commissionFeeImpact"),
				totalFees: tw("totalFees"),
				feesPercentGross: tw("feesPercentGross"),
				avgFeePerTrade: tw("avgFeePerTrade"),
				generatedBy: tw("generatedBy"),
				colAsset: tw("colAsset"),
				colWeek: tw("colWeek"),
			}

			const pdfBuffer = await generateWeeklyReportPdf({
				report: result.data,
				feeData,
				labels: weeklyLabels,
			})

			return pdfResponse(
				pdfBuffer,
				buildWeeklyPdfFilename(result.data.weekStart)
			)
		}

		// Monthly
		const [feeResult, result] = await Promise.all([
			feePromise,
			getMonthlyReport(offset),
		])

		const feeData =
			feeResult.status === "success" ? (feeResult.data ?? null) : null

		if (result.status !== "success" || !result.data) {
			return NextResponse.json(
				{ error: "No monthly report data available" },
				{ status: 404 }
			)
		}

		const tm = await getTranslations({
			locale,
			namespace: "reports.pdf.monthly",
		})
		const monthlyLabels: MonthlyReportLabels = {
			headerTitle: tm("headerTitle"),
			performanceSummary: tm("performanceSummary"),
			netPnl: tm("netPnl"),
			grossPnl: tm("grossPnl"),
			winRate: tm("winRate"),
			profitFactor: tm("profitFactor"),
			avgR: tm("avgR"),
			trades: tm("trades"),
			weeklyBreakdown: tm("weeklyBreakdown"),
			colWeek: tm("colWeek"),
			colTrades: tm("colTrades"),
			colWinRate: tm("colWinRate"),
			colPnl: tm("colPnl"),
			assetPerformance: tm("assetPerformance"),
			colAsset: tm("colAsset"),
			notableDays: tm("notableDays"),
			bestDay: tm("bestDay"),
			worstDay: tm("worstDay"),
			commissionFeeImpact: tm("commissionFeeImpact"),
			totalFees: tm("totalFees"),
			feesPercentGross: tm("feesPercentGross"),
			avgFeePerTrade: tm("avgFeePerTrade"),
			generatedBy: tm("generatedBy"),
		}

		const pdfBuffer = await generateMonthlyReportPdf({
			report: result.data,
			feeData,
			labels: monthlyLabels,
		})

		return pdfResponse(
			pdfBuffer,
			buildMonthlyPdfFilename(result.data.monthStart)
		)
	} catch (error) {
		if (isFrameworkSignal(error)) {
			throw error
		}
		console.error("Error generating PDF report:", error)
		return NextResponse.json(
			{ error: "Failed to generate PDF report" },
			{ status: 500 }
		)
	}
}

export { GET }
