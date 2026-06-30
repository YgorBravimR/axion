// Inlined to keep this client-safe — brick-size-resolver imports drizzle
// which transitively imports node 'fs' and breaks SSR bundling.
const POINTS_PER_TICK = 5

const rNumberToPoints = (rNumber: number): number =>
	(rNumber - 1) * POINTS_PER_TICK

export const formatRSize = (size: number | null | undefined): string => {
	if (size === null || size === undefined) {
		return "—"
	}
	return `R${size} (${rNumberToPoints(size)} pts)`
}
