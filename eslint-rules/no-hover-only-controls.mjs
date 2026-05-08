/**
 * `axion/no-hover-only-controls`
 *
 * Flags elements whose interactivity is revealed ONLY on hover via opacity
 * transitions. Such controls are invisible on touch devices and unreachable
 * via keyboard. Element must expose an alternative path:
 *   - a `focus-visible:opacity-*` (or `peer-focus:`/`group-focus:`) variant
 *   - an `aria-label` attribute (acceptable on icon-only real buttons)
 */

const HIDE_PATTERN = /\bopacity-0\b/
const HOVER_REVEAL_PATTERN = /\b(?:[a-z]+:)*group-hover:opacity-(?!0\b)/
const FOCUS_ESCAPE_PATTERN =
	/\b(?:focus-visible|focus|peer-focus|group-focus|peer-focus-visible|group-focus-visible|focus-within|group-focus-within|peer-focus-within):opacity-/

const collectStrings = (node, sink) => {
	if (!node) {
		return
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		sink.push(node.value)
		return
	}
	if (node.type === "TemplateLiteral") {
		for (const quasi of node.quasis) {
			sink.push(quasi.value.cooked)
		}
		for (const expr of node.expressions) {
			collectStrings(expr, sink)
		}
		return
	}
	if (node.type === "ConditionalExpression") {
		collectStrings(node.consequent, sink)
		collectStrings(node.alternate, sink)
		return
	}
	if (node.type === "LogicalExpression") {
		collectStrings(node.left, sink)
		collectStrings(node.right, sink)
		return
	}
	if (node.type === "ArrayExpression") {
		for (const el of node.elements) {
			collectStrings(el, sink)
		}
		return
	}
	if (node.type === "CallExpression") {
		// `cn(...)`, `clsx(...)`, `cva(...)` etc — collect all string args.
		for (const arg of node.arguments) {
			collectStrings(arg, sink)
		}
	}
}

const getClassnameSink = (attr) => {
	const sink = []
	if (!attr.value) {
		return sink
	}
	if (attr.value.type === "Literal" && typeof attr.value.value === "string") {
		sink.push(attr.value.value)
		return sink
	}
	if (attr.value.type === "JSXExpressionContainer") {
		collectStrings(attr.value.expression, sink)
	}
	return sink
}

const rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow controls that only become visible on hover (touch + keyboard a11y)",
		},
		messages: {
			hoverOnly:
				"Hover-only reveal (`opacity-0` + `group-hover:opacity-*`) fails on touch + keyboard. Add `focus-visible:opacity-100` or move the control inside an `aria-label`'d `<button>`.",
		},
		schema: [],
	},
	create(context) {
		return {
			JSXOpeningElement(node) {
				let classnameAttr = null
				let hasAriaLabel = false
				let isAriaHidden = false
				for (const attr of node.attributes) {
					if (attr.type !== "JSXAttribute" || !attr.name) {
						continue
					}
					const name = attr.name.name
					if (name === "className" || name === "class") {
						classnameAttr = attr
					} else if (name === "aria-label" || name === "aria-labelledby") {
						// Even null/empty aria-label still signals intent; only flag if attribute absent.
						hasAriaLabel = true
					} else if (name === "aria-hidden") {
						// Element is presentational — not interactive, no a11y obligation.
						isAriaHidden = true
					}
				}
				if (isAriaHidden) {
					return
				}
				if (!classnameAttr) {
					return
				}
				const strings = getClassnameSink(classnameAttr)
				if (strings.length === 0) {
					return
				}
				const combined = strings.join(" ")
				if (!HIDE_PATTERN.test(combined)) {
					return
				}
				if (!HOVER_REVEAL_PATTERN.test(combined)) {
					return
				}
				if (FOCUS_ESCAPE_PATTERN.test(combined)) {
					return
				}
				if (hasAriaLabel) {
					return
				}
				context.report({ node: classnameAttr, messageId: "hoverOnly" })
			},
		}
	},
}

export default rule
