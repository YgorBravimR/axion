const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080

// The source video is 1749x980 — will be scaled to fit 1920x1080
const SOURCE_WIDTH = 1749
const SOURCE_HEIGHT = 980

const FADE_DURATION_FRAMES = 15 // 0.5s
const TITLE_CARD_DURATION_FRAMES = 75 // 2.5s

// Brand colors (from globals.css dark theme)
const COLORS = {
	bg: "#0a0e14",
	bgCard: "#141a24",
	accent: "#d4a843",
	text: "#e8e0d4",
	textMuted: "#8a8478",
}

export {
	FPS,
	WIDTH,
	HEIGHT,
	SOURCE_WIDTH,
	SOURCE_HEIGHT,
	FADE_DURATION_FRAMES,
	TITLE_CARD_DURATION_FRAMES,
	COLORS,
}
