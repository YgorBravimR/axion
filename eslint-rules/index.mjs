import enforceServerActionAsyncOnly from "./enforce-server-action-async-only.mjs"
import enforceTokenUsage from "./enforce-token-usage.mjs"
import noHoverOnlyControls from "./no-hover-only-controls.mjs"
import enforceUiPrimitives from "./enforce-ui-primitives.mjs"
import noDynamicFunctionsInPages from "./no-dynamic-functions-in-pages.mjs"

const plugin = {
	meta: {
		name: "axion",
		version: "0.1.0",
	},
	rules: {
		"enforce-server-action-async-only": enforceServerActionAsyncOnly,
		"enforce-token-usage": enforceTokenUsage,
		"no-hover-only-controls": noHoverOnlyControls,
		"enforce-ui-primitives": enforceUiPrimitives,
		"no-dynamic-functions-in-pages": noDynamicFunctionsInPages,
	},
}

export default plugin
