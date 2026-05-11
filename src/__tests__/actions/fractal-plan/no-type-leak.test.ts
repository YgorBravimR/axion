import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const DAILY = join(process.cwd(), "src/app/actions/fractal-plan/daily.ts")
const DAILY_TYPES = join(
	process.cwd(),
	"src/app/actions/fractal-plan/daily.types.ts"
)

// Regression: ReferenceError "FetchByDateResult is not defined" at runtime
// (Sentry PROFIT-JOURNAL-A). Cause: top-level `type` declaration inside a
// `"use server"` file leaked to the Next.js actions loader. Fix: move type to
// sibling `daily.types.ts`. This guard keeps it there.
describe("daily.ts has no top-level type/interface declarations (Sentry PROFIT-JOURNAL-A)", () => {
	it("no top-level `type ` or `interface ` declarations remain", () => {
		const source = readFileSync(DAILY, "utf8")
		const offenders = source
			.split("\n")
			.filter((line) => /^(type |interface |enum )[A-Z]/.test(line))
		expect(
			offenders,
			"Move type/interface declarations from daily.ts to daily.types.ts"
		).toEqual([])
	})

	it("FetchByDateResult is defined in daily.types.ts", () => {
		const types = readFileSync(DAILY_TYPES, "utf8")
		expect(types).toMatch(/type FetchByDateResult/)
		expect(types).toMatch(/export type \{ FetchByDateResult \}/)
	})
})
