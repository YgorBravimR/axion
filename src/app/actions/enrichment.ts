"use server"

import type { ActionResponse } from "@/types"
import { abandonDryRunImpl } from "@/lib/enrichment/actions/abandon-dry-run-impl"
import { commitTradeImpl } from "@/lib/enrichment/actions/commit-trade-impl"
import { getDryRunImpl } from "@/lib/enrichment/actions/get-dry-run-impl"
import { startDryRunImpl } from "@/lib/enrichment/actions/start-dry-run-impl"
import type {
	StartDryRunInput,
	StartDryRunOutput,
	GetDryRunOutput,
	CommitTradeInput,
	CommitTradeOutput,
	AbandonDryRunInput,
	AbandonDryRunOutput,
} from "./enrichment.types"

export const startDryRun = async (
	input: StartDryRunInput
): Promise<ActionResponse<StartDryRunOutput>> => {
	return startDryRunImpl(input)
}

export const getDryRun = async (
	runId: string
): Promise<ActionResponse<GetDryRunOutput>> => {
	return getDryRunImpl(runId)
}

export const commitTrade = async (
	input: CommitTradeInput
): Promise<ActionResponse<CommitTradeOutput>> => {
	return commitTradeImpl(input)
}

export const abandonDryRun = async (
	input: AbandonDryRunInput
): Promise<ActionResponse<AbandonDryRunOutput>> => {
	return abandonDryRunImpl(input)
}
