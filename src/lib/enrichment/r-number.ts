const POINTS_PER_TICK = 5

const rNumberToPoints = (rNumber: number): number => {
	return (rNumber - 1) * POINTS_PER_TICK
}

export { rNumberToPoints }
