/**
 * Cross-timeframe indicator projection.
 *
 * Renko bricks on a higher timeframe (15m, 60m) close at irregular wall
 * times — driven by price moves, not by clock boundaries. To run a
 * triple-screen strategy on a 5m brick stream, we need to know, *at the
 * moment each 5m brick closes*, the most recent value of each higher-TF
 * indicator that had already closed by then.
 *
 * Algorithm — two pointers, O(host.length + Σ source.length):
 *   For each source series, we hold an index `j` that advances forward
 *   only. As the host index `i` advances chronologically, we slide each
 *   source's `j` forward while `source[j+1].closeTimestamp <= host[i]`.
 *   The projected value at host[i] is `source[j].value` (or `null` if
 *   no source point has yet closed).
 *
 * Look-back semantics: strict "≤". A higher-TF brick that closes at the
 * exact same instant as a 5m brick is considered visible — both belong
 * to the same bar boundary, and the engine consumes the post-close state.
 *
 * Inputs must be sorted ascending by `closeTimestamp`. We don't sort
 * defensively; callers know their pipeline.
 */

interface SeriesPoint {
	readonly closeTimestamp: Date
	readonly value: number | null
}

interface ProjectedSource {
	readonly key: string
	readonly series: readonly SeriesPoint[]
}

interface HostPoint {
	readonly closeTimestamp: Date
}

type ProjectionRow = Record<string, number | null>

const projectIndicators = (
	host: readonly HostPoint[],
	sources: readonly ProjectedSource[]
): ProjectionRow[] => {
	const keys = new Set<string>()
	for (const s of sources) {
		if (keys.has(s.key)) {
			throw new Error(`Duplicate projection key: ${s.key}`)
		}
		keys.add(s.key)
	}

	const pointers: number[] = sources.map(() => -1)
	const out: ProjectionRow[] = []

	for (let i = 0; i < host.length; i++) {
		const t = host[i]!.closeTimestamp.getTime()
		const row: ProjectionRow = {}

		for (let sIdx = 0; sIdx < sources.length; sIdx++) {
			const source = sources[sIdx]!
			let j = pointers[sIdx]!
			while (
				j + 1 < source.series.length &&
				source.series[j + 1]!.closeTimestamp.getTime() <= t
			) {
				j++
			}
			pointers[sIdx] = j
			row[source.key] = j >= 0 ? source.series[j]!.value : null
		}

		out.push(row)
	}

	return out
}

export type { SeriesPoint, ProjectedSource, HostPoint, ProjectionRow }
export { projectIndicators }
