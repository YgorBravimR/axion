import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import type { NarrationCue } from "./types"
import { COLORS, FPS } from "../lib/constants"

interface NarrationOverlayProps {
	cues: NarrationCue[]
	sceneStartFrame: number
}

const NarrationOverlay = ({ cues, sceneStartFrame }: NarrationOverlayProps) => {
	const frame = useCurrentFrame()

	// Find the active cue
	const activeCue = cues.find((cue) => {
		const cueStartFrame = cue.offsetSec * FPS
		const cueEndFrame = (cue.offsetSec + cue.durationSec) * FPS
		return frame >= cueStartFrame && frame < cueEndFrame
	})

	if (!activeCue) return null

	const cueStartFrame = activeCue.offsetSec * FPS
	const cueEndFrame = (activeCue.offsetSec + activeCue.durationSec) * FPS
	const fadeFrames = 10

	// Fade in/out within the cue
	const opacity = interpolate(
		frame,
		[cueStartFrame, cueStartFrame + fadeFrames, cueEndFrame - fadeFrames, cueEndFrame],
		[0, 1, 1, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }
	)

	// Slide up entrance
	const translateY = interpolate(
		frame,
		[cueStartFrame, cueStartFrame + fadeFrames],
		[20, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }
	)

	return (
		<AbsoluteFill style={{ zIndex: 8, pointerEvents: "none" }}>
			<div
				style={{
					position: "absolute",
					bottom: 0,
					left: 0,
					right: 0,
					padding: "28px 60px",
					background: "linear-gradient(transparent, rgba(10, 14, 20, 0.9) 30%)",
					opacity,
					transform: `translateY(${translateY}px)`,
				}}
			>
				<p
					style={{
						color: COLORS.text,
						fontSize: 22,
						fontFamily: "system-ui, -apple-system, sans-serif",
						lineHeight: 1.5,
						margin: 0,
						textShadow: "0 2px 8px rgba(0,0,0,0.8)",
						maxWidth: 1200,
					}}
				>
					{activeCue.text}
				</p>
			</div>
		</AbsoluteFill>
	)
}

export { NarrationOverlay }
