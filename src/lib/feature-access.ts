/**
 * Central role-based feature access configuration.
 * Pure computation module — edge-compatible, no DB imports.
 */
import type { NavItem } from "@/lib/navigation"

type UserRole = "admin" | "trader" | "viewer"

interface FeatureConfig {
	requiredRole: UserRole
	description: string
}

/** Role-based limits for features that have tiered access */
interface FeatureLimits {
	monteCarloV1BudgetCap: number
	monteCarloV2BudgetCap: number
}

const ROLE_LIMITS: Record<UserRole, FeatureLimits> = {
	viewer: {
		monteCarloV1BudgetCap: 0,
		monteCarloV2BudgetCap: 0,
	},
	trader: {
		monteCarloV1BudgetCap: 1_500_000, // 50% of admin
		monteCarloV2BudgetCap: 5_000_000, // 50% of admin
	},
	admin: {
		monteCarloV1BudgetCap: 3_000_000,
		monteCarloV2BudgetCap: 10_000_000,
	},
}

const getFeatureLimits = (role: UserRole): FeatureLimits => ROLE_LIMITS[role]

const FEATURE_MAP: Record<string, FeatureConfig> = {
	// Navigation / page-level features
	"/": { requiredRole: "viewer", description: "Dashboard" },
	"/command-center": { requiredRole: "trader", description: "Command Center" },
	"/journal": { requiredRole: "trader", description: "Journal" },
	"/analytics": { requiredRole: "viewer", description: "Analytics" },
	"/monte-carlo": { requiredRole: "trader", description: "Monte Carlo" },
	"/risk-simulation": { requiredRole: "trader", description: "Risk Simulation" },
	"/analytics/account-comparison": { requiredRole: "trader", description: "Account Comparison" },
	"/playbook": { requiredRole: "trader", description: "Playbook" },
	"/reports": { requiredRole: "viewer", description: "Reports" },
	"/monthly": { requiredRole: "trader", description: "Monthly Plan" },
	"/settings": { requiredRole: "viewer", description: "Settings" },

	// Granular component features
	"command-center:monitor-tab": { requiredRole: "admin", description: "Market Monitor tab" },
	"journal:nota-tab": { requiredRole: "admin", description: "Nota de Corretagem tab" },
	"journal:ocr-tab": { requiredRole: "admin", description: "OCR Import tab" },
	"settings:admin-tabs": { requiredRole: "admin", description: "Admin settings tabs" },
	"settings:seed-profiles": { requiredRole: "admin", description: "Seed risk profiles" },
	"settings:data-display": { requiredRole: "admin", description: "Data Display card on profile tab" },
	"settings:data-import": { requiredRole: "admin", description: "Data Import card on account tab" },
	"settings:data-export": { requiredRole: "admin", description: "Data Export card on account tab" },
	"settings:users-tab": { requiredRole: "admin", description: "User management tab" },
	"settings:conditions-tab": { requiredRole: "admin", description: "Trading conditions tab" },
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
	viewer: 0,
	trader: 1,
	admin: 2,
}

const hasAccess = (userRole: UserRole, requiredRole: UserRole): boolean =>
	ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]

const canAccessFeature = (userRole: UserRole, featureKey: string): boolean => {
	const config = FEATURE_MAP[featureKey]
	if (!config) return true // unregistered features default to accessible
	return hasAccess(userRole, config.requiredRole)
}

const getFilteredNavItems = (items: NavItem[], userRole: UserRole): NavItem[] =>
	items.filter((item) => canAccessFeature(userRole, item.href))

export {
	hasAccess,
	canAccessFeature,
	getFilteredNavItems,
	getFeatureLimits,
	ROLE_HIERARCHY,
	FEATURE_MAP,
	type UserRole,
	type FeatureConfig,
	type FeatureLimits,
}
