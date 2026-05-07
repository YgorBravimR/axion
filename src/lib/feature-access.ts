/**
 * Central role-based feature access configuration.
 * Pure computation module — edge-compatible, no DB imports.
 */
import type { NavItem, NavEntry, NavGroup } from "@/lib/navigation"
import { isGroup } from "@/lib/navigation"

type UserRole = "admin" | "premium" | "trader" | "viewer"

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
	premium: {
		monteCarloV1BudgetCap: 3_000_000,
		monteCarloV2BudgetCap: 10_000_000,
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
	"/command-center": { requiredRole: "viewer", description: "Command Center" },
	"/journal": { requiredRole: "viewer", description: "Journal" },
	"/analytics": { requiredRole: "viewer", description: "Analytics" },
	"/analytics/account-comparison": { requiredRole: "viewer", description: "Account Comparison" },
	"/monte-carlo": { requiredRole: "viewer", description: "Monte Carlo" },
	"/risk-simulation": { requiredRole: "viewer", description: "Risk Simulation" },
	"/equity-shield": { requiredRole: "premium", description: "Equity Shield" },
	"/backtest": { requiredRole: "premium", description: "Backtest" },
	"/backtest/optimize": { requiredRole: "premium", description: "Backtest Optimizer" },
	"/playbook": { requiredRole: "viewer", description: "Playbook" },
	"/reports": { requiredRole: "viewer", description: "Reports" },
	"/monthly": { requiredRole: "trader", description: "Monthly Results" },
	"/plan": { requiredRole: "trader", description: "Fractal Plan" },
	"/settings": { requiredRole: "trader", description: "Settings" },

	// Command Center tabs
	"command-center:plan-tab": { requiredRole: "trader", description: "Monthly Plan tab" },
	"command-center:command-tab": { requiredRole: "trader", description: "Command Center tab" },
	"command-center:monitor-tab": { requiredRole: "premium", description: "Market Monitor tab" },

	// Journal granular
	"journal:new-trade": { requiredRole: "trader", description: "New trade creation" },
	"journal:csv-tab": { requiredRole: "trader", description: "CSV Import tab" },
	"journal:nota-tab": { requiredRole: "premium", description: "Nota de Corretagem tab" },
	"journal:ocr-tab": { requiredRole: "premium", description: "OCR Import tab" },

	// Dashboard granular
	"dashboard:coaching-insights": { requiredRole: "trader", description: "AI coaching insights card" },

	// Settings tabs
	"settings:admin-tabs": { requiredRole: "admin", description: "Admin settings tabs" },
	"settings:accounts-tab": { requiredRole: "admin", description: "Trading accounts tab" },
	"settings:tags-tab": { requiredRole: "admin", description: "Tags management tab" },
	"settings:conditions-tab": { requiredRole: "admin", description: "Trading conditions tab" },
	"settings:indicators-tab": { requiredRole: "admin", description: "Indicators tab" },
	"settings:assets-tab": { requiredRole: "admin", description: "Assets tab" },
	"settings:timeframes-tab": { requiredRole: "admin", description: "Timeframes tab" },
	"settings:users-tab": { requiredRole: "admin", description: "User management tab" },
	"settings:bugs-tab": { requiredRole: "admin", description: "Bug reports tab" },
	"settings:seed-profiles": { requiredRole: "admin", description: "Seed risk profiles" },
	"settings:data-display": { requiredRole: "admin", description: "Data Display card on profile tab" },
	"settings:data-import": { requiredRole: "admin", description: "Data Import card on account tab" },
	"settings:data-export": { requiredRole: "admin", description: "Data Export card on account tab" },
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
	viewer: 0,
	trader: 1,
	premium: 2,
	admin: 3,
}

const hasAccess = (userRole: UserRole, requiredRole: UserRole): boolean =>
	ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]

const normalizeFeatureKey = (key: string): string => {
	// Dynamic plan hrefs (/plan/2026, /plan/2026/2/5) collapse to a single gate.
	if (key.startsWith("/plan/")) return "/plan"
	return key
}

const canAccessFeature = (userRole: UserRole, featureKey: string): boolean => {
	const config = FEATURE_MAP[normalizeFeatureKey(featureKey)]
	if (!config) return true // unregistered features default to accessible
	return hasAccess(userRole, config.requiredRole)
}

const getFilteredNavItems = (items: NavItem[], userRole: UserRole): NavItem[] =>
	items.filter((item) => canAccessFeature(userRole, item.href))

const getFilteredNavStructure = (entries: NavEntry[], userRole: UserRole): NavEntry[] =>
	entries
		.map((entry): NavEntry | null => {
			if (isGroup(entry)) {
				const allowed = entry.items.filter((item) => canAccessFeature(userRole, item.href))
				if (allowed.length === 0) return null
				const filtered: NavGroup = { ...entry, items: allowed }
				return filtered
			}
			return canAccessFeature(userRole, entry.href) ? entry : null
		})
		.filter((entry): entry is NavEntry => entry !== null)

export {
	hasAccess,
	canAccessFeature,
	getFilteredNavItems,
	getFilteredNavStructure,
	getFeatureLimits,
	ROLE_HIERARCHY,
	FEATURE_MAP,
	type UserRole,
	type FeatureConfig,
	type FeatureLimits,
}
