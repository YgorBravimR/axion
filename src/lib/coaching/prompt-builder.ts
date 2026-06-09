/**
 * Constructs LLM-ready prompts from aggregated trade data.
 * Phase 1: builds and returns the prompt structure.
 * Phase 2: will send to Claude API and return natural language coaching.
 */

import { formatFinite } from "@/lib/formatting"
import type { CoachingInsight } from "./pattern-detector"
import type { OverallStats } from "@/types"

// ============================================================================
// TYPES
// ============================================================================

interface CoachingPrompt {
	systemPrompt: string
	userPrompt: string
	dataContext: CoachingDataContext
}

interface CoachingDataContext {
	stats: OverallStats | null
	insights: CoachingInsight[]
	tradeCount: number
	periodDays: number
	accountType: string
	topAssets: Array<{ asset: string; tradeCount: number; winRate: number }>
}

interface BuildPromptInput {
	stats: OverallStats | null
	insights: CoachingInsight[]
	tradeCount: number
	periodDays: number
	accountType: string
	topAssets: Array<{ asset: string; tradeCount: number; winRate: number }>
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are an elite trading performance coach. You analyze trade data with the precision of a quantitative analyst and communicate with the authority of a seasoned mentor.

Your role:
- Identify the 3 most impactful areas for improvement
- Be specific and data-driven — reference actual numbers from the trader's data
- Prioritize actionable advice over general wisdom
- Be direct and confident, not hedging or overly diplomatic
- Focus on patterns the trader can change, not market conditions they can't

Format:
- Lead with the most important finding
- Each point: one clear observation + one specific action
- Keep it concise — traders have limited attention before market open

Tone: Professional, confident, precise. Like a cockpit pre-flight briefing — essential information only.`

// ============================================================================
// BUILD PROMPT
// ============================================================================

const buildCoachingPrompt = (input: BuildPromptInput): CoachingPrompt => {
	const { stats, insights, tradeCount, periodDays, accountType, topAssets } =
		input

	// Build the data summary section
	const dataSummary = buildDataSummary({
		stats,
		tradeCount,
		periodDays,
		accountType,
		topAssets,
	})

	// Build the insights section
	const insightsSummary = buildInsightsSummary(insights)

	const userPrompt = `Here is my trading data for the last ${periodDays} days (${tradeCount} trades):

## Performance Summary
${dataSummary}

## Detected Patterns
${insightsSummary}

Based on this data, what are the top 3 things I should focus on to improve my trading performance? Be specific and reference the numbers.`

	return {
		systemPrompt: SYSTEM_PROMPT,
		userPrompt,
		dataContext: {
			stats,
			insights,
			tradeCount,
			periodDays,
			accountType,
			topAssets,
		},
	}
}

// ============================================================================
// HELPERS
// ============================================================================

const buildDataSummary = ({
	stats,
	tradeCount,
	periodDays,
	accountType,
	topAssets,
}: Omit<BuildPromptInput, "insights">): string => {
	if (!stats) {
		return "No statistics available yet."
	}

	const lines = [
		`- Account type: ${accountType}`,
		`- Period: ${periodDays} days, ${tradeCount} trades`,
		`- Win rate: ${stats.winRate.toFixed(1)}%`,
		`- Profit factor: ${formatFinite(stats.profitFactor, 2)}`,
		`- Average R: ${stats.averageR >= 0 ? "+" : ""}${stats.averageR.toFixed(2)}R`,
		`- Gross P&L: ${stats.grossPnl >= 0 ? "+" : ""}${stats.grossPnl.toFixed(2)}`,
	]

	if (topAssets.length > 0) {
		lines.push(
			`- Top assets: ${topAssets.map((a) => `${a.asset} (${a.tradeCount} trades, ${a.winRate.toFixed(0)}% WR)`).join(", ")}`
		)
	}

	return lines.join("\n")
}

const buildInsightsSummary = (insights: CoachingInsight[]): string => {
	if (insights.length === 0) {
		return "No significant patterns detected yet. Need more trade data."
	}

	return insights
		.map((insight, index) => {
			const severity =
				insight.severity === "warning"
					? "[WARNING]"
					: insight.severity === "attention"
						? "[ATTENTION]"
						: "[INFO]"

			const paramsStr = Object.entries(insight.params)
				.map(([key, value]) => `${key}: ${value}`)
				.join(", ")

			return `${index + 1}. ${severity} ${insight.id}: ${paramsStr} (confidence: ${(insight.confidence * 100).toFixed(0)}%)`
		})
		.join("\n")
}

export {
	buildCoachingPrompt,
	SYSTEM_PROMPT,
	type CoachingPrompt,
	type CoachingDataContext,
	type BuildPromptInput,
}
