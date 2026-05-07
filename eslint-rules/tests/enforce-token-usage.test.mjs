import { tsRuleTester } from "./_helpers.mjs"
import rule from "../enforce-token-usage.mjs"

tsRuleTester.run("enforce-token-usage", rule, {
	valid: [
		{
			name: "stub passes — full implementation in commit C",
			code: `const x = "p-4 rounded-md text-base"`,
		},
	],
	invalid: [],
})
