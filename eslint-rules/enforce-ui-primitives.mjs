/**
 * `axion/enforce-ui-primitives`
 *
 * Bans raw HTML elements where shadcn UI primitives or Next built-ins exist:
 *   - `<table>`                       → `Table` from `@/components/ui/table`
 *   - `<a href>` (internal)           → `Link` from `next/link`
 *   - `<input type="checkbox">`       → `Checkbox` from `@/components/ui/checkbox`
 *
 * Skipped inside `src/components/ui/` (the primitives themselves) and inside
 * test/story files. `<img>` is already enforced by `@next/next/no-img-element`.
 */

const PRIMITIVES_DIR = "/src/components/ui/"

const isExternalHref = (value) => {
	if (typeof value !== "string") {
		return false
	}
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return true
	}
	if (value.startsWith("//")) {
		return true
	}
	if (
		value.startsWith("mailto:") ||
		value.startsWith("tel:") ||
		value.startsWith("sms:")
	) {
		return true
	}
	return false
}

const getAttr = (node, name) =>
	node.attributes.find(
		(attr) =>
			attr.type === "JSXAttribute" && attr.name && attr.name.name === name
	)

const getStringAttrValue = (attr) => {
	if (!attr || !attr.value) {
		return null
	}
	if (attr.value.type === "Literal") {
		return typeof attr.value.value === "string" ? attr.value.value : null
	}
	if (
		attr.value.type === "JSXExpressionContainer" &&
		attr.value.expression.type === "Literal" &&
		typeof attr.value.expression.value === "string"
	) {
		return attr.value.expression.value
	}
	return null
}

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
				"Use `Link` from `next/link` for internal navigation instead of raw `<a>`. External/mailto/tel links are exempt.",
			rawCheckbox:
				"Use `Checkbox` from `@/components/ui/checkbox` instead of raw `<input type='checkbox'>`.",
		},
		schema: [],
	},
	create(context) {
		const filename = context.filename ?? context.getFilename()
		// Primitives themselves are allowed to use raw HTML.
		if (filename.includes(PRIMITIVES_DIR)) {
			return {}
		}

		return {
			JSXOpeningElement(node) {
				if (node.name.type !== "JSXIdentifier") {
					return
				}
				const tag = node.name.name

				if (tag === "table") {
					context.report({ node, messageId: "rawTable" })
					return
				}

				if (tag === "a") {
					const hrefAttr = getAttr(node, "href")
					if (!hrefAttr) {
						// No href — likely a placeholder; not the case this rule targets.
						return
					}
					const href = getStringAttrValue(hrefAttr)
					// Dynamic href (`href={someVar}`) — assume internal; flag.
					if (href === null) {
						context.report({ node, messageId: "rawAnchor" })
						return
					}
					if (isExternalHref(href)) {
						return
					}
					// Anchor-only href (`#section`) is in-page navigation; allow.
					if (href.startsWith("#")) {
						return
					}
					context.report({ node, messageId: "rawAnchor" })
					return
				}

				if (tag === "input") {
					const typeAttr = getAttr(node, "type")
					const typeValue = getStringAttrValue(typeAttr)
					if (typeValue === "checkbox") {
						context.report({ node, messageId: "rawCheckbox" })
					}
				}
			},
		}
	},
}

export default rule
