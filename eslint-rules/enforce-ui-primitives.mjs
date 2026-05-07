/**
 * `axion/enforce-ui-primitives`
 *
 * Bans raw HTML elements where shadcn UI primitives or Next built-ins exist:
 * - `<table>` → `@/components/ui/table`
 * - `<a href>` → `next/link` (skip external/mailto/tel)
 * - `<input type="checkbox">` → `@/components/ui/checkbox`
 *
 * `<img>` is already covered by `@next/next/no-img-element`. This rule fills
 * the gaps. Skipped under `src/components/ui/` (where the primitives live).
 *
 * Stub — implementation lands in commit E.
 */
const rule = {
	meta: {
		type: "problem",
		docs: {
			description: "Use shadcn UI primitives instead of raw HTML elements",
		},
		messages: {
			rawTable:
				"Use `Table` from `@/components/ui/table` instead of raw `<table>`.",
			rawAnchor:
				"Use `Link` from `next/link` for internal navigation instead of raw `<a>`.",
			rawCheckbox:
				"Use `Checkbox` from `@/components/ui/checkbox` instead of raw `<input type='checkbox'>`.",
		},
		schema: [],
	},
	create() {
		return {}
	},
}

export default rule
