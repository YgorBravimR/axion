type CascadeLevel = "day" | "week" | "month" | "quarter" | "year"

interface CascadeLayer<T> {
	readonly level: CascadeLevel
	readonly value: T | null | undefined
}

interface CascadeResult<T> {
	readonly value: T
	readonly source: CascadeLevel
}

const resolveCascade = <T>(layers: readonly CascadeLayer<T>[]): CascadeResult<T> => {
	for (const layer of layers) {
		if (layer.value !== null && layer.value !== undefined) {
			return { value: layer.value, source: layer.level }
		}
	}
	throw new Error("cascade has no defined value at any level")
}

export type { CascadeLevel, CascadeLayer, CascadeResult }
export { resolveCascade }
