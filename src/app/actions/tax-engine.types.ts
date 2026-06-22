interface DarfAlertEntry {
	year: number
	month: number
	darfDueCents: number
	darfDueDate: Date | null
	derivedStatus: "pending" | "overdue"
}

interface DarfAlertSummary {
	overdueCount: number
	pendingCount: number
	overdueTotalCents: number
	pendingTotalCents: number
	overdue: DarfAlertEntry[]
	pending: DarfAlertEntry[]
}

export type { DarfAlertEntry, DarfAlertSummary }
