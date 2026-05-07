import js from "@eslint/js"
import tseslint from "typescript-eslint"
import betterTailwind from "eslint-plugin-better-tailwindcss"

export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				React: "readonly",
				JSX: "readonly",
				console: "readonly",
				process: "readonly",
				Promise: "readonly",
				Intl: "readonly",
				Date: "readonly",
				Array: "readonly",
				Object: "readonly",
				Math: "readonly",
				Infinity: "readonly",
				setTimeout: "readonly",
			},
		},
		rules: {
			"react/no-unescaped-entities": "off",
			"no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-empty-object-type": "off",
		},
	},
	{
		files: ["src/**/*.{ts,tsx}"],
		plugins: {
			"better-tailwindcss": betterTailwind,
		},
		settings: {
			"better-tailwindcss": {
				entryPoint: "src/app/globals.css",
			},
		},
		rules: {
			"better-tailwindcss/no-unknown-classes": "error",
			"better-tailwindcss/no-deprecated-classes": "error",
			"better-tailwindcss/no-conflicting-classes": "error",
		},
	},
	{
		ignores: [".next/*", "node_modules/*"],
	},
]
