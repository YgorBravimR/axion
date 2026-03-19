import { registerRoot, Composition } from "remotion"
import { DemoVideo, INTRO_DURATION_FRAMES, OUTRO_DURATION_FRAMES } from "./compositions/DemoVideo"
import { FPS, WIDTH, HEIGHT, TITLE_CARD_DURATION_FRAMES } from "./lib/constants"
import { scenes } from "./scenes/scene-data"

const calculateTotalFrames = (): number => {
	let frames = INTRO_DURATION_FRAMES + OUTRO_DURATION_FRAMES

	for (const scene of scenes) {
		if (scene.id === "end") continue // Replaced by OutroCard
		if (scene.titleCard) frames += TITLE_CARD_DURATION_FRAMES
		const videoDuration = scene.sourceEndSec - scene.sourceStartSec
		frames += Math.round(videoDuration * FPS)
	}

	return frames
}

const Root = () => {
	return (
		<Composition
			id="DemoVideo"
			component={DemoVideo}
			durationInFrames={calculateTotalFrames()}
			fps={FPS}
			width={WIDTH}
			height={HEIGHT}
		/>
	)
}

registerRoot(Root)
