import { NextResponse, type NextRequest } from "next/server"
import { requireAuth } from "@/app/actions/auth"
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

const pdfResponse = (data: Uint8Array, filename: string): NextResponse => {
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

		// Fetch fee data (shared between both report types)
		const feeResult = await getCommissionFeeImpact()
		const feeData = feeResult.status === "success" ? feeResult.data ?? null : null

		if (type === "weekly") {
			const result = await getWeeklyReport(offset)

			if (result.status !== "success" || !result.data) {
				return NextResponse.json(
					{ error: "No weekly report data available" },
					{ status: 404 }
				)
			}

			const pdfBuffer = await generateWeeklyReportPdf({
				report: result.data,
				feeData,
			})

			return pdfResponse(pdfBuffer, buildWeeklyPdfFilename(result.data.weekStart))
		}

		// Monthly
		const result = await getMonthlyReport(offset)

		if (result.status !== "success" || !result.data) {
			return NextResponse.json(
				{ error: "No monthly report data available" },
				{ status: 404 }
			)
		}

		const pdfBuffer = await generateMonthlyReportPdf({
			report: result.data,
			feeData,
		})

		return pdfResponse(pdfBuffer, buildMonthlyPdfFilename(result.data.monthStart))
	} catch {
		return NextResponse.json(
			{ error: "Failed to generate PDF report" },
			{ status: 500 }
		)
	}
}

export { GET }
