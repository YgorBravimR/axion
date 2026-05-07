/**
 * `axion/enforce-server-action-async-only`
 *
 * Files with a top-of-file `"use server"` directive must export only async
 * functions. Type re-exports, sync values, classes, and barrel re-exports
 * silently break Next.js 16 RSC bundling: types get rewritten as runtime
 * refs, classes can't be marshaled across the network boundary.
 *
 * Stub — implementation lands in commit B.
 */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Files with `'use server'` directive must export only async functions",
		},
		messages: {
			notAsync:
				'Server-action files (`"use server"`) may only export async functions. Move types/values to a sibling `*.types.ts` or non-server module.',
		},
		schema: [],
	},
	create() {
		return {}
	},
}

export default rule
