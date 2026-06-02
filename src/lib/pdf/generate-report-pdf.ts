/**
 * Server-side PDF generation for trading reports.
 * Renders React-PDF templates to Buffer for streaming as HTTP response.
 */

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import { createElement } from "react"
import { WeeklyReportPdf, MonthlyReportPdf } from "./report-template"
import type { WeeklyReportLabels, MonthlyReportLabels } from "./report-template"
import type {
	WeeklyReport,
	MonthlyReport,
	CommissionFeeImpact,
} from "@/app/actions/reports.types"

interface GenerateWeeklyPdfInput {
	report: WeeklyReport
	feeData: CommissionFeeImpact | null
	labels: WeeklyReportLabels
}

interface GenerateMonthlyPdfInput {
	report: MonthlyReport
	feeData: CommissionFeeImpact | null
	labels: MonthlyReportLabels
}

const generateWeeklyReportPdf = async (
	input: GenerateWeeklyPdfInput
): Promise<Uint8Array> => {
	const generatedAt = new Date().toISOString().replace("T", " ").split(".")[0]!

	const element = createElement(WeeklyReportPdf, {
		report: input.report,
		feeData: input.feeData,
		generatedAt,
		labels: input.labels,
	})

	const buffer = await renderToBuffer(
		element as React.ReactElement<DocumentProps>
	)
	return new Uint8Array(buffer)
}

const generateMonthlyReportPdf = async (
	input: GenerateMonthlyPdfInput
): Promise<Uint8Array> => {
	const generatedAt = new Date().toISOString().replace("T", " ").split(".")[0]!

	const element = createElement(MonthlyReportPdf, {
		report: input.report,
		feeData: input.feeData,
		generatedAt,
		labels: input.labels,
	})

	const buffer = await renderToBuffer(
		element as React.ReactElement<DocumentProps>
	)
	return new Uint8Array(buffer)
}

export { generateWeeklyReportPdf, generateMonthlyReportPdf }
export type { GenerateWeeklyPdfInput, GenerateMonthlyPdfInput }
