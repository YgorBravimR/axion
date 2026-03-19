import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { COLORS } from "../lib/constants"

interface OutroCardProps {
	durationFrames: number
}

const OutroCard = ({ durationFrames }: OutroCardProps) => {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	// Fade in, hold, fade out
	const opacity = interpolate(
		frame,
		[0, 20, durationFrames - 30, durationFrames],
		[0, 1, 1, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }
	)

	// Logo entrance
	const logoSpring = spring({ frame, fps, config: { damping: 30, stiffness: 100 } })
	const logoScale = interpolate(logoSpring, [0, 1], [0.8, 1])

	// Tagline entrance
	const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
	const taglineY = interpolate(frame, [30, 50], [15, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

	return (
		<AbsoluteFill
			style={{
				backgroundColor: COLORS.bg,
				opacity,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 24,
			}}
		>
			{/* Lion Logo */}
			<Img
				src={staticFile("logo.png")}
				style={{
					width: 120,
					height: 120,
					transform: `scale(${logoScale})`,
				}}
			/>

			{/* BRAVO Wordmark */}
			<Img
				src={staticFile("bravo.png")}
				style={{
					height: 45,
					transform: `scale(${logoScale})`,
				}}
			/>

			{/* Accent line */}
			<div
				style={{
					width: 60,
					height: 2,
					backgroundColor: COLORS.accent,
					borderRadius: 1,
				}}
			/>

			{/* Final tagline */}
			<p
				style={{
					color: COLORS.text,
					fontSize: 24,
					fontFamily: "system-ui, -apple-system, sans-serif",
					fontWeight: 500,
					opacity: taglineOpacity,
					transform: `translateY(${taglineY}px)`,
					margin: 0,
				}}
			>
				Transforme sua disciplina em retorno financeiro.
			</p>
		</AbsoluteFill>
	)
}

export { OutroCard }
