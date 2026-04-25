/**
 * Regression test for bug 2b4c0e3b — "Auto submit"
 *
 * TagForm's <form> submit event was bubbling through React's virtual tree
 * to the parent TradeForm, causing unintended trade saves. The fix adds
 * e.stopPropagation() in TagForm.handleSubmit.
 *
 * Since vitest runs in node (no jsdom/React), this test verifies the
 * source code contains the stopPropagation call as a static guard.
 * The real regression guard is the e2e test in journal.spec.ts.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("TagForm event propagation fix", () => {
	const tagFormPath = resolve(
		import.meta.dirname,
		"../../components/settings/tag-form.tsx"
	)
	const source = readFileSync(tagFormPath, "utf-8")

	it("should call stopPropagation in handleSubmit to prevent trade form auto-submit", () => {
		// The handleSubmit function must contain e.stopPropagation()
		// to prevent React synthetic event bubbling to parent forms
		expect(source).toContain("stopPropagation")
	})

	it("should call both preventDefault and stopPropagation in handleSubmit", () => {
		// Extract the handleSubmit function body
		const handleSubmitMatch = source.match(
			/const handleSubmit[\s\S]*?startTransition/
		)
		expect(handleSubmitMatch).not.toBeNull()

		const handleSubmitBody = handleSubmitMatch![0]
		expect(handleSubmitBody).toContain("preventDefault")
		expect(handleSubmitBody).toContain("stopPropagation")
	})
})
