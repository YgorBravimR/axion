/**
 * `axion/enforce-server-action-async-only`
 *
 * Files with a top-of-file `"use server"` directive must export only:
 *   - `export const foo = async (...) => ...` (async arrow)
 *   - `export const foo = async function () {}` (async function expression)
 *   - `export async function foo() {}` (async function declaration)
 *   - `export type { Foo } from "./bar"` (typed re-export syntax — bundler-stripped)
 *
 * Forbidden (CLAUDE.md guardrail + Next 16 RSC rules):
 *   - `export type Foo = ...` / `export interface Foo`  → move to sibling `*.types.ts`
 *   - `export enum Foo`                                  → const object + union type
 *   - `export class Foo`                                 → classes can't cross RSC boundary
 *   - `export function foo()` (sync)                     → Next build fails
 *   - `export const x = 5` (sync value)                  → Next build fails
 *   - `export { foo, bar }` (ambiguous re-export)        → flatten or split
 *   - `export default ...`                               → also banned by no-restricted-syntax
 *
 * @see https://nextjs.org/docs/messages/invalid-use-server-value
 */

const isAsyncFunctionInit = (node) => {
	if (!node) {
		return false
	}
	if (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionExpression"
	) {
		return Boolean(node.async)
	}
	// Allow `cache(async () => ...)` / `unstable_cache(async () => ...)` —
	// React/Next memoization wrappers that pass through async functions.
	if (node.type === "CallExpression" && node.arguments.length > 0) {
		return isAsyncFunctionInit(node.arguments[0])
	}
	return false
}

const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Files with `'use server'` directive must export only async functions",
		},
		messages: {
			typeExport:
				'Server-action files (`"use server"`) cannot export types — TS strips them at build but the project policy forbids the pattern. Move to sibling `*.types.ts`.',
			interfaceExport:
				'Server-action files (`"use server"`) cannot export interfaces. Move to sibling `*.types.ts`.',
			enumExport:
				'Server-action files (`"use server"`) cannot export enums. Use a const object + union type, ideally in a sibling `*.types.ts`.',
			classExport:
				'Server-action files (`"use server"`) cannot export classes — they cannot cross the RSC boundary.',
			syncFunction:
				'Server-action files (`"use server"`) cannot export sync functions — Next.js rejects this at build time. Make it async.',
			syncValue:
				'Server-action files (`"use server"`) cannot export sync values — Next.js rejects this at build time. Move to a non-server module.',
			barrelReexport:
				'Server-action files (`"use server"`) cannot use `export { foo, bar }` re-exports — ambiguous and risks runtime refs. Flatten by exporting the original declarations directly.',
			syncDefault:
				'Server-action files (`"use server"`) cannot have a sync default export.',
		},
		schema: [],
	},
	create(context) {
		let isUseServer = false

		return {
			Program(node) {
				const first = node.body[0]
				if (
					first &&
					first.type === "ExpressionStatement" &&
					first.directive === "use server"
				) {
					isUseServer = true
				}
			},

			ExportNamedDeclaration(node) {
				if (!isUseServer) {
					return
				}

				// Re-export form (no declaration): `export { ... }` /
				// `export type { ... }` / `export { ... } from "./x"`.
				if (!node.declaration) {
					if (node.exportKind === "type") {
						// `export type { Foo } from "./bar"` — re-export from another
						// module, fully erased by TS, safe.
						if (node.source) {
							return
						}
						// `export type { Foo }` (no `from`) — local typed re-export
						// of an in-file interface/alias. The Next.js server-action
						// transform still references the identifier at runtime and
						// crashes with `ReferenceError: Foo is not defined` when the
						// actions loader evaluates the manifest. Move the type to a
						// sibling `*.types.ts` and re-export with `from`.
						context.report({ node, messageId: "typeExport" })
						return
					}
					// `export { foo, bar }` — filter type-only specifiers
					// (`export { type Foo }`); flag the rest.
					const valueSpecifiers = node.specifiers.filter(
						(spec) => spec.exportKind !== "type"
					)
					if (valueSpecifiers.length > 0) {
						context.report({ node, messageId: "barrelReexport" })
					}
					return
				}

				const decl = node.declaration

				if (decl.type === "TSTypeAliasDeclaration") {
					context.report({ node: decl, messageId: "typeExport" })
					return
				}
				if (decl.type === "TSInterfaceDeclaration") {
					context.report({ node: decl, messageId: "interfaceExport" })
					return
				}
				if (decl.type === "TSEnumDeclaration") {
					context.report({ node: decl, messageId: "enumExport" })
					return
				}
				if (decl.type === "ClassDeclaration") {
					context.report({ node: decl, messageId: "classExport" })
					return
				}
				if (decl.type === "FunctionDeclaration" && !decl.async) {
					context.report({ node: decl, messageId: "syncFunction" })
					return
				}
				if (decl.type === "VariableDeclaration") {
					for (const declarator of decl.declarations) {
						if (!isAsyncFunctionInit(declarator.init)) {
							context.report({
								node: declarator,
								messageId: "syncValue",
							})
						}
					}
				}
			},

			ExportDefaultDeclaration(node) {
				if (!isUseServer) {
					return
				}
				const decl = node.declaration
				const isAsync =
					(decl.type === "FunctionDeclaration" ||
						decl.type === "FunctionExpression" ||
						decl.type === "ArrowFunctionExpression") &&
					Boolean(decl.async)
				if (!isAsync) {
					context.report({ node, messageId: "syncDefault" })
				}
			},
		}
	},
}

export default rule
