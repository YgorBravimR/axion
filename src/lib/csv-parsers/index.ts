/**
 * CSV Parser Dispatcher
 * Selects the appropriate broker-specific parser based on broker name
 */

import { parseClearCSV, validateClearCSV } from "./clear-parser"
import { parseXPCSV, validateXPCSV } from "./xp-parser"
import { parseGenialCSV, validateGenialCSV } from "./genial-parser"
import type { RawExecution } from "./types"

/**
 * Internal helper to normalize parser results
 */
interface InternalParserResult {
	executions: RawExecution[]
	skippedRowCount?: number
	skippedRowNumbers?: number[]
}

const normalizeParserResult = (
	result: RawExecution[] | InternalParserResult
): InternalParserResult => {
	if (Array.isArray(result)) {
		return { executions: result, skippedRowCount: 0, skippedRowNumbers: [] }
	}
	return result
}

export type BrokerName = "CLEAR" | "XP" | "GENIAL"

export interface ParseStatementOptions {
	brokerName: BrokerName
	csvContent: string
	delimiter?: string
}

export interface ParseStatementResult {
	executions: RawExecution[]
	skippedRowCount: number
	skippedRowNumbers: number[] // First N row numbers (up to 10) that were skipped
}

/**
 * Parse broker statement CSV and return raw executions with skip counts
 * Delegates to broker-specific parser
 */
export const parseStatementCSV = (
	options: ParseStatementOptions
): ParseStatementResult => {
	const { brokerName, csvContent, delimiter } = options

	let result: RawExecution[] | InternalParserResult
	switch (brokerName) {
		case "CLEAR":
			result = parseClearCSV(csvContent, { delimiter })
			break
		case "XP":
			result = parseXPCSV(csvContent, { delimiter })
			break
		case "GENIAL":
			result = parseGenialCSV(csvContent, { delimiter })
			break
		default:
			throw new Error(`Unknown broker: ${JSON.stringify(brokerName)}`)
	}

	const normalized = normalizeParserResult(result)
	return {
		executions: normalized.executions,
		skippedRowCount: normalized.skippedRowCount ?? 0,
		skippedRowNumbers: normalized.skippedRowNumbers ?? [],
	}
}

/**
 * Validate broker statement CSV format before parsing
 */
export const validateStatementCSV = (
	brokerName: BrokerName,
	csvContent: string
): { valid: boolean; error?: string } => {
	try {
		switch (brokerName) {
			case "CLEAR":
				return validateClearCSV(csvContent)
			case "XP":
				return validateXPCSV(csvContent)
			case "GENIAL":
				return validateGenialCSV(csvContent)
			default:
				return {
					valid: false,
					error: `Unknown broker: ${JSON.stringify(brokerName)}`,
				}
		}
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : "Unknown error",
		}
	}
}

// Re-export functions and types
export {
	groupExecutionsIntoTrades,
	createImportPreview,
	calculateRMetrics,
} from "./trade-grouping"

// Re-export types
export type {
	RawExecution,
	GroupedTrade,
	ImportPreview,
	ImportResult,
} from "./types"
