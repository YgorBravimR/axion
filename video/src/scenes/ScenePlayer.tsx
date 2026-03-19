import { OffthreadVideo, staticFile } from "remotion"
import { FPS, WIDTH, HEIGHT, SOURCE_WIDTH, SOURCE_HEIGHT } from "../lib/constants"

interface ScenePlayerProps {
	startSec: number
	endSec: number
}

const ScenePlayer = ({ startSec }: ScenePlayerProps) => {
	// Scale source (1749x980) to fill composition (1920x1080)
	const scaleX = WIDTH / SOURCE_WIDTH
	const scaleY = HEIGHT / SOURCE_HEIGHT
	const scale = Math.max(scaleX, scaleY)

	const videoWidth = SOURCE_WIDTH * scale
	const videoHeight = SOURCE_HEIGHT * scale
	const offsetX = (WIDTH - videoWidth) / 2
	const offsetY = (HEIGHT - videoHeight) / 2

	return (
		<div style={{ width: WIDTH, height: HEIGHT, overflow: "hidden", position: "relative" }}>
			<OffthreadVideo
				src={staticFile("profitjournal-demo.webm")}
				startFrom={Math.round(startSec * FPS)}
				style={{
					position: "absolute",
					left: offsetX,
					top: offsetY,
					width: videoWidth,
					height: videoHeight,
				}}
			/>
		</div>
	)
}

export { ScenePlayer }
