import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion"
import { COLORS } from "../lib/constants"

interface FadeTransitionProps {
	type: "in" | "out"
	durationFrames: number
}

const FadeTransition = ({ type, durationFrames }: FadeTransitionProps) => {
	const frame = useCurrentFrame()

	const opacity = interpolate(
		frame,
		[0, durationFrames],
		type === "in" ? [1, 0] : [0, 1],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }
	)

	return (
		<AbsoluteFill
			style={{
				backgroundColor: COLORS.bg,
				opacity,
				zIndex: 10,
			}}
		/>
	)
}

export { FadeTransition }
