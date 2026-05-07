/**
 * Server-side PDF generation for trading reports.
 * Renders React-PDF templates to Buffer for streaming as HTTP response.
 */

import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { WeeklyReportPdf, MonthlyReportPdf } from "./report-template"
import type {
	WeeklyReport,
	MonthlyReport,
	CommissionFeeImpact,
} from "@/app/actions/reports.types"

interface GenerateWeeklyPdfInput {
	report: WeeklyReport
	feeData: CommissionFeeImpact | null
}

interface GenerateMonthlyPdfInput {
	report: MonthlyReport
	feeData: CommissionFeeImpact | null
}

const generateWeeklyReportPdf = async (
	input: GenerateWeeklyPdfInput
): Promise<Uint8Array> => {
	const generatedAt = new Date().toISOString().replace("T", " ").split(".")[0]

	const element = createElement(WeeklyReportPdf, {
		report: input.report,
		feeData: input.feeData,
		generatedAt,
	})

	// renderToBuffer expects ReactElement<DocumentProps> but our wrapper component
	// returns <Document> internally — the cast is safe

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @react-pdf/renderer renderToBuffer expects DocumentProps but createElement returns ReactElement<unknown>; cast is safe
	const buffer = await renderToBuffer(element as any)
	return new Uint8Array(buffer)
}

const generateMonthlyReportPdf = async (
	input: GenerateMonthlyPdfInput
): Promise<Uint8Array> => {
	const generatedAt = new Date().toISOString().replace("T", " ").split(".")[0]

	const element = createElement(MonthlyReportPdf, {
		report: input.report,
		feeData: input.feeData,
		generatedAt,
	})

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @react-pdf/renderer renderToBuffer expects DocumentProps but createElement returns ReactElement<unknown>; cast is safe
	const buffer = await renderToBuffer(element as any)
	return new Uint8Array(buffer)
}

export { generateWeeklyReportPdf, generateMonthlyReportPdf }
export type { GenerateWeeklyPdfInput, GenerateMonthlyPdfInput }
