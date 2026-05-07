import { tsRuleTester } from "./_helpers.mjs"
import rule from "../no-dynamic-functions-in-pages.mjs"

tsRuleTester.run("no-dynamic-functions-in-pages", rule, {
	valid: [
		{
			name: "stub passes — full implementation in commit F",
			code: `export default function Page() { return null }`,
		},
	],
	invalid: [],
})
