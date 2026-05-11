import type { Page } from "@playwright/test"

const SCREENSHOT_DIR = "test-results/journey-demo"

/**
 * Demo-mode screenshot helper.
 *
 * In demo mode (DEMO=1), saves a full-page screenshot under
 * test-results/journey-demo/. In CI mode, no-op so regression runs stay
 * fast and disk usage stays small.
 *
 * @param page - active Playwright page
 * @param name - file basename (no extension); will be saved as `${name}.png`
 */
export const screenshotIfDemo = async (
	page: Page,
	name: string
): Promise<void> => {
	if (process.env.DEMO !== "1") {
		return
	}
	await page.screenshot({
		path: `${SCREENSHOT_DIR}/${name}.png`,
		fullPage: true,
	})
}
