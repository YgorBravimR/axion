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

const FEATURE_MAP: Record<string, FeatureConfig> = {
	// Navigation / page-level features
	"/": { requiredRole: "viewer", description: "Dashboard" },
	"/command-center": { requiredRole: "trader", description: "Command Center" },
	"/journal": { requiredRole: "trader", description: "Journal" },
	"/analytics": { requiredRole: "viewer", description: "Analytics" },
	"/monte-carlo": { requiredRole: "admin", description: "Monte Carlo" },
	"/risk-simulation": { requiredRole: "admin", description: "Risk Simulation" },
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
	ROLE_HIERARCHY,
	FEATURE_MAP,
	type UserRole,
	type FeatureConfig,
}
