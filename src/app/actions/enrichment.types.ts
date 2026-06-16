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
	AbandonDryRunInput,
	AbandonDryRunOutput,
}
