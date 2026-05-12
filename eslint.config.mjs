import js from "@eslint/js"
import tseslint from "typescript-eslint"
import betterTailwind from "eslint-plugin-better-tailwindcss"
import drizzle from "eslint-plugin-drizzle"
import jsxA11y from "eslint-plugin-jsx-a11y"
import nextPlugin from "@next/eslint-plugin-next"
import reactHooks from "eslint-plugin-react-hooks"
import axion from "./eslint-rules/index.mjs"

const drizzleObjectName = ["db", "dbWs"]

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
		plugins: {
			drizzle,
			"jsx-a11y": jsxA11y,
			"@next/next": nextPlugin,
			"react-hooks": reactHooks,
			axion,
		},
		rules: {
			"react/no-unescaped-entities": "off",
			"no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-unused-vars": "off",

			"drizzle/enforce-delete-with-where": ["error", { drizzleObjectName }],
			"drizzle/enforce-update-with-where": ["error", { drizzleObjectName }],

			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ prefer: "type-imports", fixStyle: "separate-type-imports" },
			],
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-empty-object-type": "error",
			"@typescript-eslint/ban-ts-comment": [
				"error",
				{
					"ts-ignore": "allow-with-description",
					"ts-expect-error": "allow-with-description",
					"minimumDescriptionLength": 10,
				},
			],
			"@typescript-eslint/no-non-null-asserted-optional-chain": "error",
			"@typescript-eslint/no-unused-expressions": "error",

			"no-restricted-syntax": [
				"error",
				{
					selector: "ExportDefaultDeclaration",
					message:
						"Avoid default exports — use named exports (CLAUDE.md). Next.js convention files (page/layout/route/middleware/error/not-found/loading/template + next.config / *.config) are exempt via overrides.",
				},
				{
					selector: "TSEnumDeclaration",
					message:
						'Avoid TS enums — they emit runtime objects that break `"use server"` re-exports and tree-shaking. Use a const object + union type, or a string-literal union.',
				},
				{
					selector: "CallExpression[callee.property.name='forEach']",
					message:
						"Avoid .forEach() — use for...of, map(), or reduce() for clearer iteration semantics (CLAUDE.md).",
				},
			],

			"no-await-in-loop": "error",
			"no-console": ["error", { allow: ["warn", "error", "info"] }],
			"eqeqeq": ["error", "always", { null: "ignore" }],
			"no-debugger": "error",
			"no-unreachable": "error",
			"no-useless-catch": "error",
			"curly": ["error", "all"],

			"@next/next/no-async-client-component": "error",
			"@next/next/no-html-link-for-pages": "error",
			"@next/next/no-img-element": "error",
			"@next/next/no-typos": "error",
			"@next/next/no-head-element": "error",
			"@next/next/no-sync-scripts": "error",

			"jsx-a11y/anchor-is-valid": "error",
			"jsx-a11y/interactive-supports-focus": "error",
			"jsx-a11y/label-has-associated-control": "error",
			"jsx-a11y/click-events-have-key-events": "error",
			"jsx-a11y/no-static-element-interactions": "warn",
			"jsx-a11y/role-has-required-aria-props": "error",
			"jsx-a11y/aria-props": "error",
			"jsx-a11y/aria-role": "error",
			"jsx-a11y/alt-text": "error",

			"axion/enforce-server-action-async-only": "error",
			"axion/enforce-token-usage": "error",
			"axion/no-hover-only-controls": "error",
			"axion/enforce-ui-primitives": "error",
			"axion/no-dynamic-functions-in-pages": "error",
		},
	},
	{
		// Next.js convention files require default exports.
		files: [
			"src/app/**/page.{ts,tsx}",
			"src/app/**/layout.{ts,tsx}",
			"src/app/**/loading.{ts,tsx}",
			"src/app/**/error.{ts,tsx}",
			"src/app/**/not-found.{ts,tsx}",
			"src/app/**/template.{ts,tsx}",
			"src/app/**/route.{ts,tsx}",
			"src/app/**/default.{ts,tsx}",
			"src/middleware.{ts,tsx}",
			"src/instrumentation.{ts,tsx}",
			"src/instrumentation-client.{ts,tsx}",
			"src/sentry.*.config.{ts,tsx}",
			"next.config.{ts,js,mjs}",
			"*.config.{ts,js,mjs}",
			"playwright.config.{ts,js}",
			"vitest.config.{ts,js}",
			"drizzle.config.{ts,js}",
			"postcss.config.{ts,js,mjs}",
			"tailwind.config.{ts,js,mjs}",
		],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector: "TSEnumDeclaration",
					message:
						"Avoid TS enums — they emit runtime objects that break tree-shaking. Use a const object + union type, or a string-literal union.",
				},
				{
					selector: "CallExpression[callee.property.name='forEach']",
					message:
						"Avoid .forEach() — use for...of, map(), or reduce() for clearer iteration semantics (CLAUDE.md).",
				},
			],
		},
	},
	{
		files: [
			"scripts/**/*.{ts,tsx,js,mjs}",
			"**/*.test.{ts,tsx}",
			"e2e/**/*.{ts,tsx}",
			"video/**/*.{ts,tsx}",
		],
		rules: {
			"no-await-in-loop": "off",
			"no-console": "off",
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
		ignores: [
			".next/*",
			"node_modules/*",
			"video/*",
			"eslint-rules/**",
			"e2e/**",
			".claude/**",
			".agents/**",
		],
	},
]
