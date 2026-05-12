import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const ACTIONS_DIR = join(process.cwd(), "src/app/actions")

const collectServerActionFiles = (dir: string): string[] => {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			out.push(...collectServerActionFiles(full))
			continue
		}
		if (!entry.name.endsWith(".ts") || entry.name.endsWith(".types.ts")) {
			continue
		}
		const source = readFileSync(full, "utf8")
		if (source.startsWith('"use server"')) {
			out.push(full)
		}
	}
	return out
}

// Regression: ReferenceError "FetchByDateResult is not defined" at runtime
// (Sentry PROFIT-JOURNAL-A). Cause: top-level `type` / `interface` / `enum`
// declarations inside a `"use server"` file leak to the Next.js actions loader
// as runtime witnesses, then fail with ReferenceError when the loader removes
// them at build time. Fix: move every top-level type to a sibling `.types.ts`
// file (which has no `"use server"` directive). This guard enforces it across
// every server action file.
describe("server action files contain no top-level type/interface/enum declarations", () => {
	const files = collectServerActionFiles(ACTIONS_DIR)

	it("found at least one server action file to scan", () => {
		expect(files.length).toBeGreaterThan(0)
	})

	for (const file of files) {
		const relative = file.replace(`${process.cwd()}/`, "")
		it(`${relative} has no top-level type/interface/enum`, () => {
			const source = readFileSync(file, "utf8")
			const offenders = source
				.split("\n")
				.filter((line) =>
					/^(type [A-Z]|interface [A-Z]|enum [A-Z]|export type [A-Z]|export interface [A-Z]|export enum [A-Z])/.test(
						line
					)
				)
			expect(
				offenders,
				`Move top-level type declarations from ${relative} to a sibling .types.ts file`
			).toEqual([])
		})
	}
})
