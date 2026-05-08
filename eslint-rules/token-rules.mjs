/**
 * Tailwind v4 invalid-token catalog.
 *
 * Single source of truth shared by:
 *   - `scripts/token-fix.ts` — bulk rewriter (CLI, autofix on disk)
 *   - `eslint-rules/enforce-token-usage.mjs` — editor surface (autofix in IDE)
 *
 * Adding a rule: append `{ category, from, to, reason }`. The `from` field is
 * a RegExp. The replacement supports backrefs (`$1`, `$2`).
 *
 * @see docs/scans/2026-05-07-cockpit-tokens.md
 */

const SPACING_PROPS = [
	"gap",
	"gap-x",
	"gap-y",
	"p",
	"px",
	"py",
	"pt",
	"pb",
	"pl",
	"pr",
	"m",
	"mx",
	"my",
	"mt",
	"mb",
	"ml",
	"mr",
	"space-x",
	"space-y",
	"inset",
	"top",
	"bottom",
	"left",
	"right",
	"w",
	"h",
	"min-w",
	"min-h",
	"max-w",
	"max-h",
]

const wordBound = (literal) =>
	new RegExp(
		`\\b${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`,
		"g"
	)

const buildSpacingFixes = () => {
	const fixes = []
	const invalidSpacing = {
		"s-400": "m-400",
		"s-500": "m-500",
		"s-600": "m-600",
		"m-100": "s-100",
		"m-200": "s-200",
		"m-300": "s-300",
		"l-100": "s-100",
		"l-200": "s-200",
		"l-300": "s-300",
		"l-400": "m-400",
		"l-500": "m-500",
		"l-600": "m-600",
	}
	for (const prop of SPACING_PROPS) {
		for (const [bad, good] of Object.entries(invalidSpacing)) {
			fixes.push({
				category: "spacing",
				from: wordBound(`${prop}-${bad}`),
				to: `${prop}-${good}`,
				reason:
					"Axion spacing scale: s-100/200/300, m-400/500/600, l-700/800/900 only.",
			})
		}
	}
	return fixes
}

const RULES = [
	// Radius — only --radius defined; use Tailwind built-ins.
	{
		category: "radius",
		from: wordBound("rounded-m-200"),
		to: "rounded-md",
		reason: "No `--radius-m-*` token; use `rounded-md`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-m-300"),
		to: "rounded-md",
		reason: "No `--radius-m-*` token; use `rounded-md`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-m-400"),
		to: "rounded-lg",
		reason: "No `--radius-m-*` token; use `rounded-lg`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-s-100"),
		to: "rounded-sm",
		reason: "No `--radius-s-*` token; use `rounded-sm`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-s-200"),
		to: "rounded-sm",
		reason: "No `--radius-s-*` token; use `rounded-sm`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-l-700"),
		to: "rounded-lg",
		reason: "No `--radius-l-*` token; use `rounded-lg`.",
	},
	{
		category: "radius",
		from: wordBound("rounded-l-800"),
		to: "rounded-xl",
		reason: "No `--radius-l-*` token; use `rounded-xl`.",
	},

	// Text scale — h1/h2/h3/body/small/tiny/micro only.
	{
		category: "typography",
		from: wordBound("text-h4"),
		to: "text-h3",
		reason:
			"No `--text-h4` token; demote to `text-h3` or use `text-body font-semibold`.",
	},
	{
		category: "typography",
		from: /\btext-heading-(\d+)\b/g,
		to: "text-h$1",
		reason:
			"Use Axion `text-h{N}` (matches `--text-h{N}` token), not `text-heading-{N}`.",
	},

	// Tailwind v4 deprecated utilities.
	{
		category: "v3-deprecated",
		from: wordBound("flex-shrink-0"),
		to: "shrink-0",
		reason: "v4 deprecated `flex-shrink-0`; use `shrink-0`.",
	},
	{
		category: "v3-deprecated",
		from: wordBound("flex-shrink"),
		to: "shrink",
		reason: "v4 deprecated `flex-shrink`; use `shrink`.",
	},
	{
		category: "v3-deprecated",
		from: /\btransition-colors\s+transition-opacity\b/g,
		to: "transition",
		reason:
			"Conflicting transition-* utilities both set `transition-property`; use `transition` (covers all).",
	},
	{
		category: "typography",
		from: /\btext-\[10px\]/g,
		to: "text-micro",
		reason:
			"Use design-system `text-micro` instead of arbitrary `text-[10px]`.",
	},
	{
		category: "typography",
		from: /\btext-\[11px\]/g,
		to: "text-tiny",
		reason: "Use design-system `text-tiny` instead of arbitrary `text-[11px]`.",
	},
	{
		category: "typography",
		from: /\btext-\[12px\]/g,
		to: "text-small",
		reason:
			"Use design-system `text-small` instead of arbitrary `text-[12px]`.",
	},

	// Semantic colors — fb-error/warning/success.
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-err-\d{2,3}\b/g,
		to: "$1-fb-error",
		reason: "No `err-*` token; use `fb-error`.",
	},
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-warn-\d{2,3}\b/g,
		to: "$1-warning",
		reason: "No `warn-*` token; use `warning` (CSS var `--color-warning`).",
	},
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-fb-warning\b/g,
		to: "$1-warning",
		reason:
			"No `fb-warning` token (only `fb-error` and `fb-success` exist with `fb-` prefix); use `warning`.",
	},
	{
		category: "semantic-color",
		from: /\b(text|bg|border|ring|fill|stroke|outline)-success-\d{2,3}\b/g,
		to: "$1-fb-success",
		reason: "No `success-*` token; use `fb-success`.",
	},

	// Spacing namespace mistakes — generated.
	...buildSpacingFixes(),
]

export { RULES }
