/**
 * `axion/no-hover-only-controls`
 *
 * Flags elements that reveal interactivity only via hover
 * (`opacity-0 group-hover:opacity-100` and responsive variants). Such controls
 * are invisible on touch devices and unreachable via keyboard. Element must
 * also expose an alternative path (focus-visible variant or aria-label on a
 * real button).
 *
 * Stub — implementation lands in commit D.
 */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow controls that only become visible on hover (touch + keyboard a11y)",
		},
		messages: {
			hoverOnly:
				"Hover-only reveal pattern fails on touch + keyboard. Add `focus-visible:opacity-100` or expose via `aria-label` on a real `<button>`.",
		},
		schema: [],
	},
	create() {
		return {}
	},
}

export default rule
