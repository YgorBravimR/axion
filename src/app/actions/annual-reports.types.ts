interface RecordCapitalEventParams {
	eventType: "deposit" | "withdrawal"
	amountCents: number
	eventDate: string // ISO "YYYY-MM-DD"
	notes?: string
}

interface ActionResult<T = void> {
	status: "success" | "error"
	data?: T
	message?: string
}

export type { RecordCapitalEventParams, ActionResult }
