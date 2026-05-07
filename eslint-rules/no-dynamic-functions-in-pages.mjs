/**
 * `axion/no-dynamic-functions-in-pages`
 *
 * Banned imports inside `page.tsx`/`layout.tsx`/`template.tsx`:
 * `cookies`, `headers`, `connection`, `draftMode`, `unstable_after` from
 * `next/headers` or `next/server`. These calls force the entire route into
 * dynamic rendering — preventing RSC static-island optimizations. Push them
 * into server actions or annotate the route segment with `force-dynamic`
 * intentionally instead.
 *
 * Stub — implementation lands in commit F.
 */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban dynamic-rendering primitives in page/layout/template files",
		},
		messages: {
			dynamicInPage:
				"`{{name}}` from `{{source}}` forces dynamic rendering for the whole route. Move to a server action or set `export const dynamic = 'force-dynamic'` explicitly.",
		},
		schema: [],
	},
	create() {
		return {}
	},
}

export default rule
