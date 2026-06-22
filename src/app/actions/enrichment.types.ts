import type { DryRunResult } from "@/lib/enrichment/types"

interface StartDryRunInput {
	dateFrom: Date
	dateTo: Date
	parsedOperationsJson?: string
}

interface StartDryRunOutput {
	runId: string
	tradeCount: number
	snapshotIds: string[]
}

interface DryRunSnapshotHydrated {
	snapshotId: string
	tradeId: string
	version: number
	status: "draft" | "committed" | "abandoned"
	enrichedAt: Date
	dryRun: DryRunResult
	baseline: Record<string, unknown>
	// Persisted per-field selections for resume. Null when the user hasn't
	// touched the snapshot yet (distinct from an empty array, which means
	// "explicitly rejected everything").
	acceptedFields: string[] | null
	rejectedFields: string[] | null
}

interface GetDryRunOutput {
	runId: string
	snapshots: DryRunSnapshotHydrated[]
}

interface CommitTradeInput {
	runId: string
	tradeId: string
	acceptedFields: string[]
	rejectedFields: string[]
}

interface StalenessConflict {
	field: string
	baselineValue: unknown
	currentValue: unknown
}

interface CommitTradeOutput {
	snapshotId: string
	tradeId: string
	committedFields: string[]
	staleness: StalenessConflict[]
}

interface SaveDraftSelectionsInput {
	runId: string
	tradeId: string
	acceptedFields: string[]
	rejectedFields: string[]
}

interface SaveDraftSelectionsOutput {
	snapshotId: string
}

interface AbandonDryRunInput {
	runId: string
}

interface AbandonDryRunOutput {
	runId: string
	abandonedCount: number
}

export type {
	StartDryRunInput,
	StartDryRunOutput,
	DryRunSnapshotHydrated,
	GetDryRunOutput,
	CommitTradeInput,
	StalenessConflict,
	CommitTradeOutput,
	SaveDraftSelectionsInput,
	SaveDraftSelectionsOutput,
	AbandonDryRunInput,
	AbandonDryRunOutput,
}
