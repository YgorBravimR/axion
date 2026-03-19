import { AbsoluteFill, Sequence } from "remotion"
import { scenes } from "../scenes/scene-data"
import { ScenePlayer } from "../scenes/ScenePlayer"
import { TitleCard } from "../scenes/TitleCard"
import { NarrationOverlay } from "../scenes/NarrationOverlay"
import { ZoomEffect } from "../scenes/ZoomEffect"
import { FadeTransition } from "../scenes/FadeTransition"
import { IntroCard } from "../scenes/IntroCard"
import { OutroCard } from "../scenes/OutroCard"
import { FPS, FADE_DURATION_FRAMES, TITLE_CARD_DURATION_FRAMES, COLORS } from "../lib/constants"

const INTRO_DURATION_FRAMES = 120 // 4 seconds
const OUTRO_DURATION_FRAMES = 150 // 5 seconds

const DemoVideo = () => {
	let currentFrame = 0

	const elements: JSX.Element[] = []

	// ── INTRO ────────────────────────────────────────────────────────
	elements.push(
		<Sequence key="intro" from={0} durationInFrames={INTRO_DURATION_FRAMES}>
			<IntroCard durationFrames={INTRO_DURATION_FRAMES} />
		</Sequence>
	)
	currentFrame += INTRO_DURATION_FRAMES

	// ── SCENES ───────────────────────────────────────────────────────
	for (const scene of scenes) {
		// Skip the "end" scene — we'll use OutroCard instead
		if (scene.id === "end") continue

		// Title card
		if (scene.titleCard) {
			elements.push(
				<Sequence
					key={`${scene.id}-title`}
					from={currentFrame}
					durationInFrames={TITLE_CARD_DURATION_FRAMES}
				>
					<TitleCard label={scene.label} durationFrames={TITLE_CARD_DURATION_FRAMES} />
				</Sequence>
			)
			currentFrame += TITLE_CARD_DURATION_FRAMES
		}

		// Fade in
		elements.push(
			<Sequence
				key={`${scene.id}-fade-in`}
				from={currentFrame}
				durationInFrames={FADE_DURATION_FRAMES}
			>
				<FadeTransition type="in" durationFrames={FADE_DURATION_FRAMES} />
			</Sequence>
		)

		// Video + overlays
		const videoDurationSec = scene.sourceEndSec - scene.sourceStartSec
		const videoDurationFrames = Math.round(videoDurationSec * FPS)

		elements.push(
			<Sequence
				key={`${scene.id}-video`}
				from={currentFrame}
				durationInFrames={videoDurationFrames}
			>
				<ZoomEffect effects={scene.zoom}>
					<ScenePlayer
						startSec={scene.sourceStartSec}
						endSec={scene.sourceEndSec}
					/>
				</ZoomEffect>
			</Sequence>
		)

		// Fade out
		elements.push(
			<Sequence
				key={`${scene.id}-fade-out`}
				from={currentFrame + videoDurationFrames - FADE_DURATION_FRAMES}
				durationInFrames={FADE_DURATION_FRAMES}
			>
				<FadeTransition type="out" durationFrames={FADE_DURATION_FRAMES} />
			</Sequence>
		)

		currentFrame += videoDurationFrames
	}

	// ── OUTRO ────────────────────────────────────────────────────────
	elements.push(
		<Sequence key="outro" from={currentFrame} durationInFrames={OUTRO_DURATION_FRAMES}>
			<OutroCard durationFrames={OUTRO_DURATION_FRAMES} />
		</Sequence>
	)
	currentFrame += OUTRO_DURATION_FRAMES

	return (
		<AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
			{elements}
		</AbsoluteFill>
	)
}

export { DemoVideo, INTRO_DURATION_FRAMES, OUTRO_DURATION_FRAMES }
