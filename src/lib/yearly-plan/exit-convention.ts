interface ExitConvention {
	parcialPts: number
	finalPts: number
	stopPts: number
	protPts: number
	parcialProportion: number
	finalProportion: number
}

const computeGainEv = (convention: ExitConvention): number =>
	convention.parcialPts * convention.parcialProportion +
	convention.finalPts * convention.finalProportion

const computeStopEv = (convention: ExitConvention): number => -convention.stopPts

const computeProtEv = (convention: ExitConvention): number => convention.protPts

const computeAvgPointsPerOp = (convention: ExitConvention): number =>
	computeGainEv(convention)

const DEFAULT_EXIT_CONVENTION: ExitConvention = {
	parcialPts: 5.0,
	finalPts: 10.0,
	stopPts: 3.5,
	protPts: 1.0,
	parcialProportion: 0.70,
	finalProportion: 0.30,
}

export { computeGainEv, computeStopEv, computeProtEv, computeAvgPointsPerOp, DEFAULT_EXIT_CONVENTION }
export type { ExitConvention }
