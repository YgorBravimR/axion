import type { Page } from "@playwright/test"

const STORAGE_DIR = "e2e/.auth"

const stagePath = (stage: number): string =>
	`${STORAGE_DIR}/journey-stage-${stage}.json`

/**
 * Persist the current browser context (cookies + localStorage) so the next
 * journey stage can pick up authenticated state without re-running the
 * preceding stages.
 *
 * Call at the END of each stage's test body.
 */
export const saveStageState = async (
	page: Page,
	stage: number
): Promise<void> => {
	await page.context().storageState({ path: stagePath(stage) })
}

/**
 * Resolve the storageState option for a given journey stage. Pass the result
 * into `test.use({ ... })` at the top of the spec for stage N+1.
 *
 * Example:
 *   test.use(loadStageState(0))
 */
export const loadStageState = (stage: number): { storageState: string } => ({
	storageState: stagePath(stage),
})
