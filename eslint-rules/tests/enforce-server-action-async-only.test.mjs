import { tsRuleTester } from "./_helpers.mjs"
import rule from "../enforce-server-action-async-only.mjs"

tsRuleTester.run("enforce-server-action-async-only", rule, {
	valid: [
		{
			name: "stub allows everything for now",
			code: `"use server"\nexport const foo = async () => 1`,
		},
	],
	invalid: [],
})
