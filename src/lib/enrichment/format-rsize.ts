import { rNumberToPoints } from "./brick-size-resolver"

export const formatRSize = (size: number | null | undefined): string => {
	if (size === null || size === undefined) {
		return "—"
	}
	return `R${size} (${rNumberToPoints(size)} pts)`
}
