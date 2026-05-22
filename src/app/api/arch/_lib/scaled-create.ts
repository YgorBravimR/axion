import { db } from "@/db/drizzle"
import { tradeExecutions } from "@/db/schema"
import { toCents } from "@/lib/money"
import { updateTradeAggregates } from "@/app/actions/executions"

interface ScaledExecutionInput {
	executionType: "entry" | "exit"
	executionDate: string | Date | number
	price: number | string
	quantity: number | string
	orderType?: "market" | "limit" | "stop" | "stop_limit" | null
	notes?: string | null
	commission?: number | string | null
	fees?: number | string | null
	slippage?: number | string | null
}

interface ValidatedScaledExecution {
	executionType: "entry" | "exit"
	executionDate: Date
	price: number
	quantity: number
	orderType: "market" | "limit" | "stop" | "stop_limit" | null
	notes: string | null
	commission: number
	fees: number
	slippage: number
}

interface ValidatedScaledExecutions {
	legs: ValidatedScaledExecution[]
	earliestEntryDate: Date
	entryQty: number
	exitQty: number
}

const toFiniteNumber = (
	value: number | string | null | undefined,
	fallback = 0
): number => {
	if (value === null || value === undefined || value === "") {
		return fallback
	}
	const parsed = typeof value === "number" ? value : Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Validate and normalize the executions array from a scaled-mode create request.
 *
 * Rules:
 * - Non-empty array
 * - At least one "entry" leg (a trade with only exits has no opening position)
 * - All quantities must be > 0
 * - All prices must be finite
 * - executionDate must parse to a valid Date
 * - Total exit quantity must NOT exceed total entry quantity (no naked exits)
 *
 * Throws on validation failure with a code-prefixed message:
 *   "SCALED_VALIDATION:<code>:<detail>"
 */
const validateScaledExecutions = (
	executions: ScaledExecutionInput[]
): ValidatedScaledExecutions => {
	if (!Array.isArray(executions) || executions.length === 0) {
		throw new Error(
			"SCALED_VALIDATION:EMPTY_EXECUTIONS:executions array must contain at least one leg"
		)
	}

	const legs: ValidatedScaledExecution[] = []
	let entryQty = 0
	let exitQty = 0

	for (const [index, leg] of executions.entries()) {
		if (leg.executionType !== "entry" && leg.executionType !== "exit") {
			throw new Error(
				`SCALED_VALIDATION:INVALID_TYPE:executions[${index}].executionType must be "entry" or "exit"`
			)
		}
		const date = new Date(leg.executionDate)
		if (Number.isNaN(date.getTime())) {
			throw new Error(
				`SCALED_VALIDATION:INVALID_DATE:executions[${index}].executionDate is not a valid date`
			)
		}
		const price = toFiniteNumber(leg.price, NaN)
		const quantity = toFiniteNumber(leg.quantity, NaN)
		if (!Number.isFinite(price)) {
			throw new Error(
				`SCALED_VALIDATION:INVALID_PRICE:executions[${index}].price must be a finite number`
			)
		}
		if (!Number.isFinite(quantity) || quantity <= 0) {
			throw new Error(
				`SCALED_VALIDATION:INVALID_QUANTITY:executions[${index}].quantity must be > 0`
			)
		}

		legs.push({
			executionType: leg.executionType,
			executionDate: date,
			price,
			quantity,
			orderType: leg.orderType ?? null,
			notes: leg.notes ?? null,
			commission: toFiniteNumber(leg.commission ?? 0),
			fees: toFiniteNumber(leg.fees ?? 0),
			slippage: toFiniteNumber(leg.slippage ?? 0),
		})

		if (leg.executionType === "entry") {
			entryQty += quantity
		} else {
			exitQty += quantity
		}
	}

	if (entryQty === 0) {
		throw new Error(
			"SCALED_VALIDATION:NO_ENTRIES:scaled executions must contain at least one entry leg"
		)
	}
	if (exitQty > entryQty) {
		throw new Error(
			`SCALED_VALIDATION:EXIT_EXCEEDS_ENTRIES:total exit quantity (${exitQty}) exceeds total entry quantity (${entryQty})`
		)
	}

	const entries = legs.filter((leg) => leg.executionType === "entry")
	const firstEntry = entries[0]
	if (!firstEntry) {
		throw new Error(
			"SCALED_VALIDATION:NO_ENTRIES:scaled executions must contain at least one entry leg"
		)
	}
	const earliestEntryDate = entries.reduce(
		(earliest, leg) =>
			leg.executionDate < earliest ? leg.executionDate : earliest,
		firstEntry.executionDate
	)

	return {
		legs,
		earliestEntryDate,
		entryQty,
		exitQty,
	}
}

/**
 * Persist the validated execution legs for a freshly created scaled trade,
 * then delegate aggregate computation (avg prices, P&L, outcome, R-multiple,
 * remaining quantity) to updateTradeAggregates — the canonical recompute fn.
 */
const persistScaledExecutions = async (
	tradeId: string,
	legs: ValidatedScaledExecution[]
): Promise<void> => {
	const insertValues = legs.map((leg) => {
		const executionValue = toCents(leg.price * leg.quantity)

		return {
			tradeId,
			executionType: leg.executionType,
			executionDate: leg.executionDate,
			price: String(leg.price),
			quantity: String(leg.quantity),
			orderType: leg.orderType,
			notes: leg.notes,
			commission: String(leg.commission),
			fees: String(leg.fees),
			slippage: String(leg.slippage),
			executionValue: String(executionValue),
		}
	})

	await db.insert(tradeExecutions).values(insertValues)
	await updateTradeAggregates(tradeId)
}

export { validateScaledExecutions, persistScaledExecutions }
export type { ScaledExecutionInput, ValidatedScaledExecutions }
