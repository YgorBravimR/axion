import { z } from "zod"

const yearSchema = z
	.number()
	.int("validation.taxEngine.yearInteger")
	.min(2000, "validation.taxEngine.yearMin")
	.max(2100, "validation.taxEngine.yearMax")

const monthSchema = z
	.number()
	.int("validation.taxEngine.monthInteger")
	.min(1, "validation.taxEngine.monthRange")
	.max(12, "validation.taxEngine.monthRange")

export const recomputeLedgerSchema = z
	.object({
		accountId: z.string().uuid("validation.taxEngine.invalidAccountId"),
		fromYear: yearSchema.optional(),
		fromMonth: monthSchema.optional(),
	})
	.refine(
		(v) =>
			(v.fromYear === undefined && v.fromMonth === undefined) ||
			(v.fromYear !== undefined && v.fromMonth !== undefined),
		{
			message: "validation.taxEngine.yearMonthPaired",
			path: ["fromMonth"],
		}
	)

export type RecomputeLedgerInput = z.infer<typeof recomputeLedgerSchema>
