import { describe, it } from "node:test"
import assert from "node:assert/strict"
import plugin from "../index.mjs"

describe("axion eslint plugin", () => {
	it("exports a valid plugin object with meta + rules", () => {
		assert.equal(plugin.meta.name, "axion")
		assert.ok(plugin.rules, "rules map missing")
	})

	it("registers all 5 expected rules", () => {
		const expected = [
			"enforce-server-action-async-only",
			"enforce-token-usage",
			"no-hover-only-controls",
			"enforce-ui-primitives",
			"no-dynamic-functions-in-pages",
		]
		for (const name of expected) {
			assert.ok(plugin.rules[name], `rule "${name}" not registered in plugin`)
			assert.equal(
				typeof plugin.rules[name].create,
				"function",
				`rule "${name}" missing create()`
			)
			assert.ok(plugin.rules[name].meta, `rule "${name}" missing meta`)
		}
	})
})
