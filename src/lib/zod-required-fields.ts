/**
 * Zod 4 schema introspection utility.
 * Inspects a Zod schema and determines which fields are required vs optional.
 *
 * Zod 4 uses `_zod.def.type` instead of `_def.typeName` from Zod 3.
 * Shape is directly accessible via `.shape` even on refined/superRefined schemas.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Introspects a Zod schema and returns a Set of field names that are required.
 * Works with ZodObject, including those wrapped in .refine()/.superRefine().
 *
 * @param schema - Any Zod schema (typically a ZodObject or effects wrapping one)
 * @returns Set of required field name strings
 */
const getRequiredFields = (schema: any): Set<string> => {
	// In Zod 4, .shape is available directly even on refined schemas
	const shape = schema?.shape
	if (!shape || typeof shape !== "object") return new Set()

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
const isOptionalField = (schema: any): boolean => {
	const typeName = schema?._zod?.def?.type ?? schema?._zod?.type

	if (!typeName) return false

	if (typeName === "optional" || typeName === "nullable") return true
	if (typeName === "default") return true

	// Unwrap pipe (.pipe()) — check the input side
	if (typeName === "pipe") {
		return isOptionalField(schema._zod.def.in)
	}

	// Union — check if any branch is z.literal("")
	if (typeName === "union") {
		const options = schema._zod.def.options as any[]
		if (!options) return false
		return options.some((option: any) => {
			const optType = option?._zod?.def?.type ?? option?._zod?.type
			if (optType === "literal") {
				const values = option._zod.def.values
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
const isFieldRequired = (schema: any, fieldName: string): boolean => {
	return getRequiredFields(schema).has(fieldName)
}

export { getRequiredFields, isFieldRequired }
