import type { Page } from "@playwright/test"

/**
 * Demo-mode narration overlay.
 *
 * Injects a temporary banner at the top of the viewport so showcase recordings
 * have human-readable context. No-op in CI mode (DEMO !== "1") so regression
 * runs stay fast.
 *
 * @param page - active Playwright page
 * @param text - narration message (one short sentence)
 * @param holdMs - how long to leave the banner visible (default 3500ms)
 */
export const annotate = async (
	page: Page,
	text: string,
	holdMs = 3500
): Promise<void> => {
	if (process.env.DEMO !== "1") {
		return
	}
	await page.evaluate(
		({ msg, hold }) => {
			const banner = document.createElement("div")
			banner.textContent = msg
			banner.style.cssText = [
				"position:fixed",
				"top:0",
				"left:0",
				"right:0",
				"padding:16px 24px",
				"background:rgba(8,14,28,0.92)",
				"color:#d4af37",
				"font-family:'Public Sans',system-ui,sans-serif",
				"font-size:18px",
				"font-weight:600",
				"text-align:center",
				"letter-spacing:0.02em",
				"z-index:2147483647",
				"box-shadow:0 4px 16px rgba(0,0,0,0.4)",
			].join(";")
			document.body.appendChild(banner)
			window.setTimeout(() => banner.remove(), hold)
		},
		{ msg: text, hold: holdMs }
	)
	await page.waitForTimeout(holdMs)
}
