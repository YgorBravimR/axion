/**
 * `axion/enforce-token-usage`
 *
 * Flags invalid Tailwind v4 tokens (`s-400`, `text-h4`, `rounded-m-200`, etc.)
 * in className strings + `cn`/`clsx`/`cva`/`twMerge` calls. Catalog lives in
 * `eslint-rules/token-rules.mjs` and is shared with `scripts/token-fix.ts`.
 *
 * @see docs/scans/2026-05-07-cockpit-tokens.md
 */
import { RULES } from "./token-rules.mjs"

const CLASSNAME_HELPERS = new Set([
	"cn",
	"clsx",
	"classnames",
	"cva",
	"twMerge",
])

/**
 * Compute the full all-rules-applied rewrite of `input` and the list of
 * individual rule hits (one entry per matching rule, regardless of how many
 * occurrences inside the literal).
 */
const analyze = (input) => {
	let output = input
	const hits = []
	for (const rule of RULES) {
		const before = output
		output = output.replace(rule.from, rule.to)
		if (before !== output) {
			const sample = before.match(rule.from)
			const fromSample = sample ? sample[0] : ""
			const toSample = fromSample.replace(rule.from, rule.to)
			hits.push({ from: fromSample, to: toSample, reason: rule.reason })
		}
	}
	return { output, hits }
}

const isClassnameAttr = (node) => {
	if (node.type !== "JSXAttribute") {
		return false
	}
	const name = node.name?.name
	return name === "className" || name === "class"
}

const isClassnameHelperCall = (node) => {
	if (node.type !== "CallExpression") {
		return false
	}
	const callee = node.callee
	if (callee.type === "Identifier") {
		return CLASSNAME_HELPERS.has(callee.name)
	}
	// `tw.cn(...)` / `cls.cva(...)` patterns.
	if (callee.type === "MemberExpression" && !callee.computed) {
		return CLASSNAME_HELPERS.has(callee.property?.name)
	}
	return false
}

const buildFix = (context, node, output) => (fixer) => {
	const raw = context.sourceCode.getText(node)
	const quote = raw[0]
	if (
		node.type === "Literal" &&
		(quote === '"' || quote === "'" || quote === "`")
	) {
		return fixer.replaceText(node, `${quote}${output}${quote}`)
	}
	if (node.type === "TemplateElement") {
		// Inner text of a template element sits between backticks/`${`/`}` markers.
		// Range = [node.range[0] + 1, node.range[1] - (tail ? 1 : 2)].
		return fixer.replaceTextRange(
			[node.range[0] + 1, node.range[1] - (node.tail ? 1 : 2)],
			output
		)
	}
	return null
}

const checkLiteral = (context, node, value) => {
	if (typeof value !== "string" || value.length === 0) {
		return
	}
	const { output, hits } = analyze(value)
	if (output === value || hits.length === 0) {
		return
	}
	// Emit one report per matching rule. Fix replaces full literal with the
	// all-rules-applied rewrite — overlapping fixers are deduped by ESLint, and
	// the next pass will be stable since the rewrite is idempotent.
	const fix = buildFix(context, node, output)
	for (const hit of hits) {
		context.report({
			node,
			messageId: "invalidToken",
			data: { from: hit.from, to: hit.to, reason: hit.reason },
			fix,
		})
	}
}

const walkExpression = (context, node) => {
	if (!node) {
		return
	}
	if (node.type === "Literal") {
		checkLiteral(context, node, node.value)
		return
	}
	if (node.type === "TemplateLiteral") {
		for (const quasi of node.quasis) {
			checkLiteral(context, quasi, quasi.value.cooked)
		}
		for (const expr of node.expressions) {
			walkExpression(context, expr)
		}
		return
	}
	if (node.type === "ConditionalExpression") {
		walkExpression(context, node.consequent)
		walkExpression(context, node.alternate)
		return
	}
	if (node.type === "LogicalExpression") {
		walkExpression(context, node.left)
		walkExpression(context, node.right)
		return
	}
	if (node.type === "ArrayExpression") {
		for (const el of node.elements) {
			walkExpression(context, el)
		}
		return
	}
	if (node.type === "ObjectExpression") {
		for (const prop of node.properties) {
			if (prop.type === "Property" && prop.key) {
				if (prop.key.type === "Literal") {
					checkLiteral(context, prop.key, prop.key.value)
				}
			}
		}
	}
}

const rule = {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow invalid Tailwind v4 tokens in className strings",
		},
		fixable: "code",
		messages: {
			invalidToken:
				'Invalid Tailwind token "{{from}}" — use "{{to}}". {{reason}}',
		},
		schema: [],
	},
	create(context) {
		return {
			JSXAttribute(node) {
				if (!isClassnameAttr(node) || !node.value) {
					return
				}
				const value = node.value
				if (value.type === "Literal") {
					checkLiteral(context, value, value.value)
					return
				}
				if (value.type === "JSXExpressionContainer") {
					walkExpression(context, value.expression)
				}
			},
			CallExpression(node) {
				if (!isClassnameHelperCall(node)) {
					return
				}
				for (const arg of node.arguments) {
					walkExpression(context, arg)
				}
			},
		}
	},
}

export default rule
