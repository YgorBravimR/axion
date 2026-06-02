/**
 * CSV Parser Dispatcher
 * Selects the appropriate broker-specific parser based on broker name
 */

import { parseClearCSV, validateClearCSV } from "./clear-parser"
import { parseXPCSV, validateXPCSV } from "./xp-parser"
import { parseGenialCSV, validateGenialCSV } from "./genial-parser"
import type { RawExecution } from "./types"

export type BrokerName = "CLEAR" | "XP" | "GENIAL"

export interface ParseStatementOptions {
	brokerName: BrokerName
	csvContent: string
	delimiter?: string
}

/**
 * Parse broker statement CSV and return raw executions
 * Delegates to broker-specific parser
 */
export const parseStatementCSV = (
	options: ParseStatementOptions
): RawExecution[] => {
	const { brokerName, csvContent, delimiter } = options

	switch (brokerName) {
		case "CLEAR":
			return parseClearCSV(csvContent, { delimiter })
		case "XP":
			return parseXPCSV(csvContent, { delimiter })
		case "GENIAL":
			return parseGenialCSV(csvContent, { delimiter })
		default:
			throw new Error(`Unknown broker: ${JSON.stringify(brokerName)}`)
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
