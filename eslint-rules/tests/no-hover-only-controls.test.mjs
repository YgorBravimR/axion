import { tsRuleTester } from "./_helpers.mjs"
import rule from "../no-hover-only-controls.mjs"

tsRuleTester.run("no-hover-only-controls", rule, {
	valid: [
		{
			name: "stub passes — full implementation in commit D",
			code: `const x = <div className="opacity-100" />`,
		},
	],
	invalid: [],
})
