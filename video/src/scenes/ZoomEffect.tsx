import { interpolate, useCurrentFrame, Easing } from "remotion"
import type { ZoomEffect as ZoomEffectType } from "./types"
import { FPS } from "../lib/constants"
import type { ReactNode } from "react"

interface ZoomEffectProps {
	effects: ZoomEffectType[]
	children: ReactNode
}

const ZoomEffect = ({ effects, children }: ZoomEffectProps) => {
	const frame = useCurrentFrame()

	let scale = 1
	let originX = 0.5
	let originY = 0.5

	for (const effect of effects) {
		const start = effect.offsetSec * FPS
		const end = (effect.offsetSec + effect.durationSec) * FPS
		if (frame < start || frame >= end) continue

		const holdFrames = (effect.holdSec ?? 0) * FPS
		const rampIn = (end - start - holdFrames) / 2
		const holdStart = start + rampIn
		const holdEnd = holdStart + holdFrames
		const rampOut = end

		if (frame < holdStart) {
			// Easing in
			scale = interpolate(frame, [start, holdStart], [1, effect.scale], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
				easing: Easing.inOut(Easing.ease),
			})
		} else if (frame < holdEnd) {
			// Holding at max zoom
			scale = effect.scale
		} else {
			// Easing out
			scale = interpolate(frame, [holdEnd, rampOut], [effect.scale, 1], {
				extrapolateLeft: "clamp",
				extrapolateRight: "clamp",
				easing: Easing.inOut(Easing.ease),
			})
		}

		originX = effect.originX
		originY = effect.originY
		break // Only one active zoom at a time
	}

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				overflow: "hidden",
				transform: `scale(${scale})`,
				transformOrigin: `${originX * 100}% ${originY * 100}%`,
				willChange: "transform",
			}}
		>
			{children}
		</div>
	)
}

export { ZoomEffect }
