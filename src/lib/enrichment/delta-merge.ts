import type {
	DryRunPasses,
	EnrichmentDelta,
	EnrichmentField,
	MergedEnrichmentField,
} from "./types"

const CONFIDENCE_RANK: Record<EnrichmentField["confidence"], number> = {
	high: 3,
	medium: 2,
	low: 1,
}

const pickWinning = (
	current: MergedEnrichmentField | undefined,
	candidate: EnrichmentField,
	candidateSource: EnrichmentDelta["source"]
): MergedEnrichmentField => {
	if (!current) {
		return { ...candidate, winningPass: candidateSource }
	}
	if (
		CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[current.confidence]
	) {
		return { ...candidate, winningPass: candidateSource }
	}
	return current
}

const mergeDeltas = (
	passes: DryRunPasses
): Record<string, MergedEnrichmentField> => {
	const merged: Record<string, MergedEnrichmentField> = {}
	const ordered: EnrichmentDelta[] = [
		passes.operations,
		passes.candleMath,
		passes.indicatorReadout,
		passes.deterministicSlTarget,
	]
	for (const delta of ordered) {
		if (delta.passStatus !== "succeeded") {
			continue
		}
		for (const [fieldName, field] of Object.entries(delta.fields)) {
			merged[fieldName] = pickWinning(merged[fieldName], field, delta.source)
		}
	}
	return merged
}

const computeStatus = (
	passes: DryRunPasses,
	merged: Record<string, MergedEnrichmentField>
): "ready-to-commit" | "partial" | "no-changes" => {
	if (Object.keys(merged).length === 0) {
		return "no-changes"
	}
	const allSucceeded = [
		passes.operations,
		passes.candleMath,
		passes.indicatorReadout,
		passes.deterministicSlTarget,
	].every((pass) => pass.passStatus !== "failed")
	return allSucceeded ? "ready-to-commit" : "partial"
}

export { mergeDeltas, computeStatus }
