// Non-empty array contract. Use at boundaries between "user input" / unknown
// length data and computations whose result is meaningless on []. Forces the
// caller to validate length once, then statistical helpers (median, percentile,
// first, last) can index without fear of `undefined`.

export type NonEmptyArray<T> = readonly [T, ...T[]]

export const isNonEmpty = <T>(arr: readonly T[]): arr is NonEmptyArray<T> =>
	arr.length > 0

export const assertNonEmpty: <T>(
	arr: readonly T[],
	message?: string
) => asserts arr is NonEmptyArray<T> = (arr, message) => {
	if (arr.length === 0) {
		throw new Error(message ?? "expected non-empty array")
	}
}

// Sort preserving non-emptiness — `Array.prototype.toSorted` widens the result.
export const toSortedNonEmpty = <T>(
	arr: NonEmptyArray<T>,
	compare?: (a: T, b: T) => number
): NonEmptyArray<T> => arr.toSorted(compare) as unknown as NonEmptyArray<T>

// Map preserving non-emptiness — TS cannot infer it from `Array.prototype.map`.
export const mapNonEmpty = <T, U>(
	arr: NonEmptyArray<T>,
	fn: (value: T, index: number) => U
): NonEmptyArray<U> => {
	const [head, ...rest] = arr
	return [fn(head, 0), ...rest.map((v, i) => fn(v, i + 1))]
}

// Statistical helpers that require non-empty input.
// Returning T (never `T | undefined`) since input contract guarantees ≥1.
export const first = <T>(arr: NonEmptyArray<T>): T => arr[0]

export const last = <T>(arr: NonEmptyArray<T>): T => {
	const [head, ...rest] = arr
	return rest.length === 0 ? head : (rest[rest.length - 1] ?? head)
}

export const mean = (values: NonEmptyArray<number>): number =>
	values.reduce((sum, v) => sum + v, 0) / values.length

export const median = (values: NonEmptyArray<number>): number => {
	const sorted = toSortedNonEmpty(values, (a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	if (sorted.length % 2 !== 0) {
		return sorted[mid] ?? sorted[0]
	}
	const high = sorted[mid] ?? sorted[0]
	const low = sorted[mid - 1] ?? sorted[0]
	return (low + high) / 2
}

export const percentile = (
	values: NonEmptyArray<number>,
	p: number
): number => {
	const sorted = toSortedNonEmpty(values, (a, b) => a - b)
	const idx = Math.ceil((p / 100) * sorted.length) - 1
	const clamped = Math.max(0, Math.min(idx, sorted.length - 1))
	return sorted[clamped] ?? sorted[0]
}
