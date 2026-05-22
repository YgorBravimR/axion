import { test as base, expect } from "@playwright/test"

export * from "@playwright/test"

export const test = base.extend({
	page: async ({ page }, use, testInfo) => {
		const consoleLogs: string[] = []
		const pageErrors: string[] = []

		page.on("console", (msg) => {
			if (msg.type() === "error" || msg.type() === "warning") {
				consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
			}
		})
		page.on("pageerror", (err) => {
			pageErrors.push(err.message)
		})

		await use(page)

		const hasLogs = consoleLogs.length > 0
		const hasErrors = pageErrors.length > 0
		if (!hasLogs && !hasErrors) return

		if (process.env.CI) {
			if (hasLogs)
				console.error(
					`\n[browser-console] ${testInfo.title}\n${consoleLogs.join("\n")}`
				)
			if (hasErrors)
				console.error(
					`\n[page-errors] ${testInfo.title}\n${pageErrors.join("\n")}`
				)
		} else {
			if (hasLogs)
				await testInfo.attach("browser-console", {
					body: consoleLogs.join("\n"),
					contentType: "text/plain",
				})
			if (hasErrors)
				await testInfo.attach("page-errors", {
					body: pageErrors.join("\n"),
					contentType: "text/plain",
				})
		}
	},
})

export { expect }
