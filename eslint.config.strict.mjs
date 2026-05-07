import baseConfig from "./eslint.config.mjs"
import tseslint from "typescript-eslint"
import eslintReact from "@eslint-react/eslint-plugin"
import importX from "eslint-plugin-import-x"
import reactHooks from "eslint-plugin-react-hooks"

const projectServiceLanguageOptions = {
	parser: tseslint.parser,
	parserOptions: {
		projectService: true,
		tsconfigRootDir: import.meta.dirname,
	},
}

// eslint-disable-next-line no-restricted-syntax -- ESLint flat config files require a default export; named exports are not supported by the ESLint config loader
export default [
	...baseConfig,

	{
		files: ["src/**/*.{ts,tsx}"],
		languageOptions: projectServiceLanguageOptions,
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			"@eslint-react": eslintReact,
			"react-hooks": reactHooks,
			"import-x": importX,
		},
		rules: {
			// Type-checked safety net (highest-ROI agent-bug catchers).
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": [
				"error",
				{ checksVoidReturn: { attributes: false } },
			],
			"@typescript-eslint/await-thenable": "error",
			"@typescript-eslint/consistent-type-exports": "error",
			"@typescript-eslint/no-base-to-string": "error",

			// Phase-in (warn). Promote to error per-cluster after backlog clears.
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/restrict-template-expressions": [
				"warn",
				{ allowNumber: true, allowBoolean: true, allowNullish: false },
			],
			"@typescript-eslint/no-unnecessary-condition": "warn",

			// React 19 / hooks v5.
			"@eslint-react/no-nested-component-definitions": "error",
			"@eslint-react/no-missing-key": "error",
			"@eslint-react/no-array-index-key": "warn",
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",

			// Import hygiene.
			"import-x/no-cycle": ["error", { maxDepth: 5 }],
			"import-x/no-duplicates": "error",
			"import-x/no-relative-parent-imports": "warn",
		},
	},

	{
		files: [
			"src/__tests__/**/*.{ts,tsx}",
			"src/**/*.test.{ts,tsx}",
			"e2e/**/*.{ts,tsx}",
		],
		rules: {
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
		},
	},

	{
		ignores: [".next/*", "node_modules/*", "video/*", "scripts/*"],
	},
]
