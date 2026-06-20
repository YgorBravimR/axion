import { describe, it, expect } from "vitest"

// Regression guard for Sentry PROFIT-JOURNAL-F: WithdrawalCalculator and
// CapitalEventLog used to expose `onLogged` / `onEventAdded` / `onEventDeleted`
// callback props. async-sections.tsx (a server component) passed inline
// arrow functions for those props, which Next.js then tried to serialize
// across the RSC boundary, throwing "Event handlers cannot be passed to
// Client Component props." The fix removes the callbacks; refresh is now
// handled internally via useRouter().refresh().
//
// We use a pure source-text check because importing the components at
// runtime pulls in next-auth/next/server which the vitest node env can't
// resolve. The source assertion is enough to catch a regression: if anyone
// re-adds the callback props, the prop string appears again in the file.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const repoRoot = resolve(__dirname, "..", "..", "..")
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8")

describe("reports RSC boundary", () => {
	it("WithdrawalCalculator no longer accepts onLogged callback prop", () => {
		const src = read("src/components/reports/withdrawal-calculator.tsx")
		expect(src).not.toMatch(/onLogged\s*:/)
		expect(src).not.toMatch(/onLogged\(\)/)
	})

	it("CapitalEventLog no longer accepts onEventAdded/onEventDeleted props", () => {
		const src = read("src/components/reports/capital-event-log.tsx")
		expect(src).not.toMatch(/onEventAdded\s*:/)
		expect(src).not.toMatch(/onEventDeleted\s*:/)
		expect(src).not.toMatch(/onEventAdded\(\)/)
		expect(src).not.toMatch(/onEventDeleted\(\)/)
	})

	it("async-sections (server component) does not pass function props", () => {
		const src = read("src/components/reports/async-sections.tsx")
		// The server-component async-sections must not pass inline arrow
		// functions to the client components below — that's exactly what
		// triggers the RSC serialization crash.
		expect(src).not.toMatch(/onLogged=\{/)
		expect(src).not.toMatch(/onEventAdded=\{/)
		expect(src).not.toMatch(/onEventDeleted=\{/)
	})
})
