/**
 * `axion/no-dynamic-functions-in-pages`
 *
 * Banned in `page.tsx`/`layout.tsx`/`template.tsx`:
 *   `cookies`, `headers`, `draftMode`, `unstable_after` from `next/headers`.
 *
 * Reading these inside a page/layout/template forces the entire route segment
 * into dynamic rendering as a side effect, killing static-island optimization
 * for the whole branch. Push the read into a server action and pass the value
 * down, or set `export const dynamic = "force-dynamic"` explicitly so the
 * intent is documented.
 *
 * Note: `connection()` from `next/server` is intentionally NOT banned — it's
 * Next 16's explicit opt-in to dynamic rendering (the supported replacement
 * for `noStore()`), not a footgun.
 */

const PAGE_FILE_PATTERN = /\/(?:page|layout|template)\.(?:tsx?|jsx?)$/
const BANNED_SOURCES = new Set(["next/headers"])
const BANNED_NAMES = new Set([
	"cookies",
	"headers",
	"draftMode",
	"unstable_after",
])

const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban dynamic-rendering primitives in page/layout/template files",
		},
		messages: {
			dynamicInPage:
				"`{{name}}` from `{{source}}` forces dynamic rendering for the whole route. Move to a server action, or set `export const dynamic = 'force-dynamic'` on this segment explicitly.",
		},
		schema: [],
	},
	create(context) {
		const filename = context.filename ?? context.getFilename()
		if (!PAGE_FILE_PATTERN.test(filename)) {
			return {}
		}
		return {
			ImportDeclaration(node) {
				const source = node.source?.value
				if (!source || !BANNED_SOURCES.has(source)) {
					return
				}
				for (const spec of node.specifiers) {
					if (spec.type !== "ImportSpecifier") {
						continue
					}
					const imported = spec.imported?.name
					if (imported && BANNED_NAMES.has(imported)) {
						context.report({
							node: spec,
							messageId: "dynamicInPage",
							data: { name: imported, source },
						})
					}
				}
			},
		}
	},
}

export default rule
