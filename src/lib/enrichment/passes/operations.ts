import type { Trade } from "@/db/schema"
import type {
	EnrichmentDelta,
	EnrichmentPass,
	EnrichmentContext,
	EnrichmentField,
} from "@/lib/enrichment/types"

const operationsPass: EnrichmentPass = (
	trade: Trade,
	ctx: EnrichmentContext
): EnrichmentDelta => {
	// Skip if no ProfitChartOperation was provided
	if (!ctx.profitOperation) {
		return {
			tradeId: trade.id,
			source: "ops-csv",
			fields: {},
			passStatus: "skipped",
			skipReason: "no-profit-operation",
		}
	}

	// Skip if the operation number doesn't match the trade's recorded operation number.
	// Thin-form trades have trade.profitOperationNumber === null and are matched by
	// time-window in the dry-run dispatcher, so allow null on the trade side.
	if (
		trade.profitOperationNumber != null &&
		ctx.profitOperation.profitOperationNumber !== trade.profitOperationNumber
	) {
		return {
			tradeId: trade.id,
			source: "ops-csv",
			fields: {},
			passStatus: "skipped",
			skipReason: "operation-mismatch",
		}
	}

	const fields: Record<string, EnrichmentField<unknown>> = {}

	try {
		const { profitOperation } = ctx
		const operationNumber = profitOperation.profitOperationNumber

		const checkAndAdd = (
			fieldName: string,
			newValue: number | null | undefined,
			currentValue: number | null,
			allowZeroChange: boolean = false
		) => {
			if (newValue == null) {
				return
			}
			const differs =
				currentValue === null ||
				(allowZeroChange && currentValue === 0) ||
				currentValue !== newValue
			if (!differs) {
				return
			}

			const hasConflict =
				currentValue !== null &&
				currentValue !== newValue &&
				!(allowZeroChange && currentValue === 0)

			fields[fieldName] = {
				value: newValue,
				source: "ops-csv" as const,
				confidence: "high" as const,
				conflictsWithCurrent: hasConflict,
				derivation: `Profit Pro Operações CSV row #${operationNumber}`,
			}
		}

		checkAndAdd(
			"entryPrice",
			Number(profitOperation.entryPrice),
			trade.entryPrice != null ? Number(trade.entryPrice) : null
		)
		checkAndAdd(
			"exitPrice",
			Number(profitOperation.exitPrice),
			trade.exitPrice != null ? Number(trade.exitPrice) : null
		)
		checkAndAdd(
			"positionSize",
			Number(profitOperation.positionSize),
			trade.positionSize != null ? Number(trade.positionSize) : null
		)
		// Mirror bulkCreateTrades: pnl = cents (BRL × 100); mfe/mae = BRL gross.
		const pnlCents =
			profitOperation.pnl == null
				? null
				: Math.round(Number(profitOperation.pnl) * 100)
		checkAndAdd(
			"pnl",
			pnlCents,
			trade.pnl != null ? Number(trade.pnl) : null,
			true
		)
		checkAndAdd(
			"mfe",
			typeof profitOperation.mfe === "string"
				? Number(profitOperation.mfe)
				: (profitOperation.mfe ?? null),
			trade.mfe != null ? Number(trade.mfe) : null,
			true
		)
		checkAndAdd(
			"mae",
			typeof profitOperation.mae === "string"
				? Number(profitOperation.mae)
				: (profitOperation.mae ?? null),
			trade.mae != null ? Number(trade.mae) : null,
			true
		)

		return {
			tradeId: trade.id,
			source: "ops-csv",
			fields,
			passStatus: "succeeded",
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error
				? error.message
				: "Unknown error in operations pass"

		return {
			tradeId: trade.id,
			source: "ops-csv",
			fields: {},
			passStatus: "failed",
			errorMessage,
		}
	}
}

export { operationsPass }
