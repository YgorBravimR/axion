import {
	LayoutDashboard,
	BookOpen,
	BarChart3,
	FileText,
	FileBarChart,
	CalendarDays,
	CalendarRange,
	Settings,
	Target,
	Dices,
	FlaskConical,
	FlaskRound,
	Shield,
	GitCompareArrows,
	Calendar,
	CalendarClock,
	Sparkles,
	type LucideIcon,
} from "lucide-react"

type NavLabelKey =
	| "dashboard"
	| "journal"
	| "analytics"
	| "playbook"
	| "reports"
	| "monthlyPlan"
	| "quarterlyPlan"
	| "yearlyPlan"
	| "commandCenter"
	| "monteCarlo"
	| "riskSimulation"
	| "backtest"
	| "equityShield"
	| "backtestOptimize"
	| "settings"

type NavGroupKey = "plans" | "simulation" | "reportsGroup"

interface NavItem {
	kind?: "item"
	labelKey: NavLabelKey
	href: string
	icon: LucideIcon
}

interface NavGroup {
	kind: "group"
	groupKey: NavGroupKey
	icon: LucideIcon
	items: NavItem[]
}

type NavEntry = NavItem | NavGroup

/** Sentinel to block new-trade creation for roles below trader */
const NEW_TRADE_FEATURE_KEY = "journal:new-trade"

/**
 * Build the nav structure for a given moment. Plans group items use
 * the supplied date so links jump straight into the current year/quarter/month
 * fractal-plan rows. Compute on the server once per request to avoid
 * SSR/CSR hydration drift across midnight boundaries.
 */
const buildNavStructure = (now: Date): NavEntry[] => {
	const year = now.getFullYear()
	const month = now.getMonth() + 1
	const quarter = Math.ceil(month / 3)

	return [
		{ labelKey: "dashboard", href: "/", icon: LayoutDashboard },
		{ labelKey: "commandCenter", href: "/command-center", icon: Target },
		{ labelKey: "journal", href: "/journal", icon: BookOpen },
		{ labelKey: "analytics", href: "/analytics", icon: BarChart3 },
		{
			kind: "group",
			groupKey: "plans",
			icon: CalendarClock,
			items: [
				{
					labelKey: "yearlyPlan",
					href: `/plan/${year}`,
					icon: CalendarRange,
				},
				{
					labelKey: "quarterlyPlan",
					href: `/plan/${year}/${quarter}`,
					icon: Calendar,
				},
				{
					labelKey: "monthlyPlan",
					href: `/plan/${year}/${quarter}/${month}`,
					icon: CalendarDays,
				},
			],
		},
		{
			kind: "group",
			groupKey: "simulation",
			icon: Sparkles,
			items: [
				{ labelKey: "monteCarlo", href: "/monte-carlo", icon: Dices },
				{
					labelKey: "riskSimulation",
					href: "/risk-simulation",
					icon: FlaskConical,
				},
				{ labelKey: "backtest", href: "/backtest", icon: FlaskRound },
				{
					labelKey: "backtestOptimize",
					href: "/backtest/optimize",
					icon: GitCompareArrows,
				},
				{ labelKey: "equityShield", href: "/equity-shield", icon: Shield },
			],
		},
		{ labelKey: "playbook", href: "/playbook", icon: FileText },
		{ labelKey: "reports", href: "/reports", icon: FileBarChart },
		{ labelKey: "settings", href: "/settings", icon: Settings },
	]
}

const isGroup = (entry: NavEntry): entry is NavGroup => entry.kind === "group"

const buildNavItems = (structure: NavEntry[]): NavItem[] =>
	structure.flatMap((entry) => (isGroup(entry) ? entry.items : [entry]))

export {
	buildNavStructure,
	buildNavItems,
	isGroup,
	NEW_TRADE_FEATURE_KEY,
	type NavItem,
	type NavGroup,
	type NavEntry,
	type NavGroupKey,
	type NavLabelKey,
}
