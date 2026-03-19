interface NarrationCue {
	/** Offset in seconds relative to scene start */
	offsetSec: number
	/** Duration in seconds */
	durationSec: number
	/** Portuguese narration text */
	text: string
}

interface ZoomEffect {
	/** Offset in seconds relative to scene start */
	offsetSec: number
	/** Duration in seconds */
	durationSec: number
	/** Zoom scale (1.0 = no zoom, 1.5 = 150%) */
	scale: number
	/** Focal point X (0-1, 0=left, 1=right) */
	originX: number
	/** Focal point Y (0-1, 0=top, 1=bottom) */
	originY: number
	/** Hold at max zoom for this many seconds before releasing */
	holdSec?: number
}

interface FreezeFrame {
	/** Offset in seconds relative to scene start — video pauses here */
	offsetSec: number
	/** How many extra seconds to hold this frame */
	holdSec: number
}

interface SceneDefinition {
	id: string
	/** Portuguese section title (shown on title card) */
	label: string
	/** Start time in the raw WebM (seconds) */
	sourceStartSec: number
	/** End time in the raw WebM (seconds) */
	sourceEndSec: number
	/** Show a title card before this scene */
	titleCard: boolean
	/** Timed narration text overlays */
	narration: NarrationCue[]
	/** Timed zoom/focus effects */
	zoom: ZoomEffect[]
	/** Freeze frames — pause video at specific moments */
	freeze?: FreezeFrame[]
}

export type { SceneDefinition, NarrationCue, ZoomEffect, FreezeFrame }
