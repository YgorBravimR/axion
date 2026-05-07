import { resolveDay } from "./resolver"

interface CaptureInput {
	readonly accountId: string
	readonly entryDate: Date
}

const captureROnEntry = async (input: CaptureInput): Promise<number | null> => {
	const resolved = await resolveDay(input.accountId, input.entryDate)
	if (!resolved || resolved.oneRCents === 0) {
		return null
	}
	return resolved.oneRCents
}

interface OutcomeInput {
	readonly pnlCents: number
	readonly oneRSnapshotCents: number | null
}

const computeROutcome = (input: OutcomeInput): string | null => {
	if (!input.oneRSnapshotCents || input.oneRSnapshotCents === 0) {
		return null
	}
	const r = input.pnlCents / input.oneRSnapshotCents
	return r.toFixed(2)
}

export { captureROnEntry, computeROutcome }
