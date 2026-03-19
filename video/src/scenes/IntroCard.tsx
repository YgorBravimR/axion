import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../lib/constants"

interface IntroCardProps {
	durationFrames: number
}

const IntroCard = ({ durationFrames }: IntroCardProps) => {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	// Overall fade in/out
	const opacity = interpolate(
		frame,
		[0, 20, durationFrames - 20, durationFrames],
		[0, 1, 1, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }
	)

	// Logo entrance — scale up with spring
	const logoSpring = spring({ frame, fps, config: { damping: 25, stiffness: 80 } })
	const logoScale = interpolate(logoSpring, [0, 1], [0.6, 1])
	const logoOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" })

	// Wordmark entrance — delayed
	const wordmarkOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
	const wordmarkY = interpolate(frame, [20, 40], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

	// Tagline — more delayed
	const taglineOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

	// Accent line
	const lineWidth = interpolate(frame, [35, 55], [0, 80], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

	return (
		<AbsoluteFill
			style={{
				backgroundColor: COLORS.bg,
				opacity,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 20,
			}}
		>
			{/* Lion Logo */}
			<Img
				src={staticFile("logo.png")}
				style={{
					width: 140,
					height: 140,
					transform: `scale(${logoScale})`,
					opacity: logoOpacity,
				}}
			/>

			{/* BRAVO Wordmark */}
			<Img
				src={staticFile("bravo.png")}
				style={{
					height: 50,
					opacity: wordmarkOpacity,
					transform: `translateY(${wordmarkY}px)`,
				}}
			/>

			{/* Accent line */}
			<div
				style={{
					width: lineWidth,
					height: 2,
					backgroundColor: COLORS.accent,
					borderRadius: 1,
					marginTop: 8,
				}}
			/>

			{/* Tagline */}
			<p
				style={{
					color: COLORS.textMuted,
					fontSize: 20,
					fontFamily: "system-ui, -apple-system, sans-serif",
					letterSpacing: "0.1em",
					textTransform: "uppercase",
					opacity: taglineOpacity,
					margin: 0,
					marginTop: 4,
				}}
			>
				Trading Journal
			</p>
		</AbsoluteFill>
	)
}

export { IntroCard }
