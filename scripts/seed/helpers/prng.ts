// Deterministic linear-congruential PRNG so seed output is reproducible.
// Same algorithm as the original scripts/seed.ts to preserve seed snapshots.
export const createPrng = (seed = 42): (() => number) => {
	let state = seed
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff
		return state / 0x7fffffff
	}
}

export const pickFrom = <T>(arr: readonly T[], rand: () => number): T => {
	const idx = Math.floor(rand() * arr.length)
	const item = arr[idx]
	if (item === undefined) {
		throw new Error("pickFrom: empty array")
	}
	return item
}
