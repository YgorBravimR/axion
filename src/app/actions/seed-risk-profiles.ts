"use server"

import { db } from "@/db/drizzle"
import { riskManagementProfiles } from "@/db/schema"
import { eq } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { requireRole } from "@/lib/auth-utils"
import { RISK_PROFILE_TEMPLATES } from "@/lib/risk-profile-templates"

// ==========================================
// BUILT-IN PROFILE NAME MAP
// ==========================================

/**
 * Hardcoded display names for the 5 built-in templates.
 * We avoid i18n here because DB rows need a stable, language-agnostic name
 * that works regardless of the user's locale when displayed in dropdowns.
 */
const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
	"fixed-fractional": "Fixed Fractional (Van Tharp)",
	"fixed-ratio": "Fixed Ratio (Ralph Vince)",
	"institutional": "Institutional (CTA/Quant Funds)",
	"r-multiples": "R-Multiples (Van Tharp / Larry Williams)",
	"kelly-fractional": "Kelly Fractional (Kelly / Shannon)",
}

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
	"fixed-fractional": "Risk a fixed % of current balance per trade. Conservative position sizing with drawdown protection.",
	"fixed-ratio": "Scale position size based on accumulated profit. Aggressive non-linear growth.",
	"institutional": "Conservative risk with 3-tier drawdown controls. Extremely stable.",
	"r-multiples": "Clean R-based risk framework. Fixed risk per trade measured in R units.",
	"kelly-fractional": "Mathematically optimal sizing divided by safety factor. Maximum theoretical growth.",
}

// ==========================================
// SEED ACTION
// ==========================================

/**
 * Idempotent seeder: inserts the 5 professional risk management models as real DB profiles.
 * Checks for existing profiles by name to avoid duplicates.
 * Safe to call on every page load — becomes a no-op after first successful run.
 *
 * @returns List of newly created profile names (empty array if all already exist)
 */
const seedBuiltInRiskProfiles = async (): Promise<string[]> => {
	const { userId } = await requireAuth()

	// Only admins can seed system-level risk profiles — silently skip for non-admin users
	const adminId = await requireRole("admin").catch(() => null)
	if (!adminId) {
		return []
	}

	// Fetch all existing active profile names in one query
	const existingRows = await db.query.riskManagementProfiles.findMany({
		where: eq(riskManagementProfiles.isActive, true),
		columns: { name: true },
	})
	const existingNames = new Set(existingRows.map((row) => row.name))

	const createdNames: string[] = []

	for (const template of RISK_PROFILE_TEMPLATES) {
		const displayName = TEMPLATE_DISPLAY_NAMES[template.id] ?? template.id
		if (existingNames.has(displayName)) continue

		await db.insert(riskManagementProfiles).values({
			name: displayName,
			description: TEMPLATE_DESCRIPTIONS[template.id] ?? null,
			createdByUserId: userId,
			isActive: true,
			baseRiskCents: template.defaults.baseRiskCents,
			dailyLossCents: template.defaults.dailyLossCents,
			weeklyLossCents: template.defaults.weeklyLossCents ?? null,
			monthlyLossCents: template.defaults.monthlyLossCents,
			dailyProfitTargetCents: template.defaults.dailyProfitTargetCents ?? null,
			decisionTree: JSON.stringify(template.defaults.decisionTree),
		})

		createdNames.push(displayName)
	}

	return createdNames
}

export { seedBuiltInRiskProfiles }
