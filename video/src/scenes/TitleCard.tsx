import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion"
import { COLORS } from "../lib/constants"

interface TitleCardProps {
	label: string
	durationFrames: number
}

const TitleCard = ({ label, durationFrames }: TitleCardProps) => {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	// Fade in over first 15 frames, fade out over last 15
	const opacity = interpolate(
		frame,
		[0, 15, durationFrames - 15, durationFrames],
		[0, 1, 1, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }
	)

	// Subtle scale entrance
	const scale = spring({
		frame,
		fps,
		config: { damping: 30, stiffness: 100 },
	})

	const titleScale = interpolate(scale, [0, 1], [0.9, 1])

	return (
		<AbsoluteFill
			style={{
				backgroundColor: COLORS.bg,
				opacity,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 5,
			}}
		>
			{/* Accent line */}
			<div
				style={{
					width: 60,
					height: 3,
					backgroundColor: COLORS.accent,
					marginBottom: 24,
					borderRadius: 2,
					transform: `scaleX(${titleScale})`,
				}}
			/>

			{/* Label */}
			<h1
				style={{
					color: COLORS.text,
					fontSize: 52,
					fontWeight: 700,
					fontFamily: "system-ui, -apple-system, sans-serif",
					letterSpacing: "-0.02em",
					transform: `scale(${titleScale})`,
					margin: 0,
				}}
			>
				{label}
			</h1>

			{/* Subtitle */}
			<p
				style={{
					color: COLORS.textMuted,
					fontSize: 20,
					fontFamily: "system-ui, -apple-system, sans-serif",
					marginTop: 12,
					transform: `scale(${titleScale})`,
				}}
			>
				ProfitJournal
			</p>
		</AbsoluteFill>
	)
}

export { TitleCard }
