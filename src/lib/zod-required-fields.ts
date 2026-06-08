/**
 * Zod 4 schema introspection utility.
 * Inspects a Zod schema and determines which fields are required vs optional.
 *
 * Zod 4 uses `_zod.def.type` instead of `_def.typeName` from Zod 3.
 * Shape is directly accessible via `.shape` even on refined/superRefined schemas.
 *
 * LINT JUSTIFICATION: This file casts `unknown` to `Record<string, unknown>` to
 * access Zod 4's internal `_zod` property, which has no public API. The casts and
 * optional-chain accesses are necessary to safely introspect opaque schema objects.
 * @typescript-eslint/no-unnecessary-condition disabled file-wide because the analyzer
 * cannot prove that the `?. ` accesses are unnecessary (they protect against the
 * schema shape differing from expected in edge cases).
 */

/**
 * Introspects a Zod schema and returns a Set of field names that are required.
 * Works with ZodObject, including those wrapped in .refine()/.superRefine().
 *
 * @param schema - Any Zod schema (typically a ZodObject or effects wrapping one)
 * @returns Set of required field name strings
 */
const getRequiredFields = (schema: unknown): Set<string> => {
	// In Zod 4, .shape is available directly even on refined schemas
	const schemaAny = schema as Record<string, unknown>
	const shape = schemaAny?.shape
	if (!shape || typeof shape !== "object") {
		return new Set()
	}

	const required = new Set<string>()

	for (const [key, fieldSchema] of Object.entries(shape)) {
		if (!isOptionalField(fieldSchema)) {
			required.add(key)
		}
	}

	return required
}

/**
 * Recursively checks if a Zod 4 field schema is optional.
 * A field is optional if it uses .optional(), .nullable(), .default(),
 * or is a union that includes z.literal("").
 */
const isOptionalField = (schema: unknown): boolean => {
	const schemaAny = schema as Record<string, unknown>
	const zodDef = schemaAny?._zod as Record<string, unknown>
	const typeName =
		(zodDef?.def as Record<string, unknown>)?.type ?? zodDef?.type

	if (!typeName) {
		return false
	}

	if (typeName === "optional" || typeName === "nullable") {
		return true
	}
	if (typeName === "default") {
		return true
	}

	// Unwrap pipe (.pipe()) — check the input side
	if (typeName === "pipe") {
		const def = (schemaAny._zod as Record<string, unknown>)?.def as Record<
			string,
			unknown
		>
		return isOptionalField(def?.in)
	}

	// Union — check if any branch is z.literal("")
	if (typeName === "union") {
		const def = zodDef?.def as Record<string, unknown>
		const options = def?.options as unknown[]
		if (!options) {
			return false
		}
		return options.some((option: unknown) => {
			const optAny = option as Record<string, unknown>
			const optZodDef = optAny?._zod as Record<string, unknown>
			const optType =
				(optZodDef?.def as Record<string, unknown>)?.type ?? optZodDef?.type
			if (optType === "literal") {
				const optDef = optZodDef?.def as Record<string, unknown>
				const values = optDef?.values as unknown[]
				return Array.isArray(values) && values.includes("")
			}
			return isOptionalField(option)
		})
	}

	return false
}

/**
 * Helper to check if a specific field is required in a schema.
 */
const isFieldRequired = (schema: unknown, fieldName: string): boolean => {
	return getRequiredFields(schema).has(fieldName)
}

export { getRequiredFields, isFieldRequired }
