import type { BugReport, BugReportImage } from "@/db/schema"

/** Input for submitBugReport server action */
interface SubmitBugReportInput {
	subject: string
	description: string
	currentUrl?: string
	userAgent?: string
	consoleLogs?: string
	networkErrors?: string
	images?: {
		imageUrl: string
		s3Key: string
		isScreenshot: boolean
	}[]
}

/** Input for updateBugReportStatus server action */
interface UpdateBugReportStatusInput {
	id: string
	action: "accept" | "reject" | "close"
	rejectReason?: string
	adminNotes?: string
}

interface BugReportWithReporter extends BugReport {
	reporterName: string | null
	reporterEmail: string
	handlerName: string | null
	imageCount: number
}

interface BugReportDetail extends BugReport {
	reporterName: string | null
	reporterEmail: string
	handlerName: string | null
	images: BugReportImage[]
}

export type {
	SubmitBugReportInput,
	UpdateBugReportStatusInput,
	BugReportWithReporter,
	BugReportDetail,
}
