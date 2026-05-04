interface StopAuditRecord {
	id: string
	tradeId: string
	changedAt: string
	oldStop: string | null
	newStop: string
	direction: "long" | "short"
	violation: boolean
}

interface LogStopChangeInput {
	tradeId: string
	oldStop: string | null
	newStop: string
	direction: "long" | "short"
}

interface StopMovementInput {
	oldStop: string | null
	newStop: string
	direction: "long" | "short"
}

const isStopMovementViolation = ({
	oldStop,
	newStop,
	direction,
}: StopMovementInput): boolean => {
	if (oldStop === null) return false
	const prev = Number(oldStop)
	const next = Number(newStop)
	if (Number.isNaN(prev) || Number.isNaN(next)) return false
	return direction === "long" ? next < prev : next > prev
}

export { isStopMovementViolation }
export type { StopAuditRecord, LogStopChangeInput, StopMovementInput }
