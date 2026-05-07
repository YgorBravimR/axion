/**
 * Shared RuleTester factory. Flat-config-native API: pass `languageOptions`
 * directly. Default to TS parser (typescript-eslint) since most project
 * source files are .ts/.tsx. Tests can override per-suite.
 */
import { RuleTester } from "eslint"
import tseslint from "typescript-eslint"

const tsRuleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			ecmaFeatures: { jsx: true },
		},
	},
})

export { tsRuleTester }
