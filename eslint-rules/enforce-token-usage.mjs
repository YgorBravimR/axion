/**
 * `axion/enforce-token-usage`
 *
 * Flags invalid Tailwind v4 tokens (`s-400`, `text-h4`, `rounded-m-200`, etc.)
 * in className strings, cn/clsx/cva calls. Mirrors the regex catalog in
 * `scripts/token-fix.ts` so editor surface matches the post-hoc rewriter.
 *
 * Stub — implementation lands in commit C.
 */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow invalid Tailwind v4 tokens in className strings",
		},
		fixable: "code",
		messages: {
			invalidToken:
				'Invalid token "{{from}}". Use "{{to}}" instead (see scripts/token-fix.ts).',
		},
		schema: [],
	},
	create() {
		return {}
	},
}

export default rule
