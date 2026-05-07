import { tsRuleTester } from "./_helpers.mjs"
import rule from "../enforce-ui-primitives.mjs"

tsRuleTester.run("enforce-ui-primitives", rule, {
	valid: [
		{
			name: "stub passes — full implementation in commit E",
			code: `const x = <div />`,
		},
	],
	invalid: [],
})
