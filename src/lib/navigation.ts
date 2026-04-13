import {
	LayoutDashboard,
	BookOpen,
	BarChart3,
	FileText,
	FileBarChart,
	CalendarDays,
	Settings,
	Target,
	Dices,
	FlaskConical,
	FlaskRound,
	type LucideIcon,
} from "lucide-react"

interface NavItem {
	labelKey:
		| "dashboard"
		| "journal"
		| "analytics"
		| "playbook"
		| "reports"
		| "monthly"
		| "commandCenter"
		| "monteCarlo"
		| "riskSimulation"
		| "backtest"
		| "settings"
	href:
		| "/"
		| "/journal"
		| "/analytics"
		| "/playbook"
		| "/reports"
		| "/monthly"
		| "/command-center"
		| "/monte-carlo"
		| "/risk-simulation"
		| "/backtest"
		| "/settings"
	icon: LucideIcon
}

const navItems: NavItem[] = [
	{ labelKey: "dashboard", href: "/", icon: LayoutDashboard },
	{ labelKey: "commandCenter", href: "/command-center", icon: Target },
	{ labelKey: "journal", href: "/journal", icon: BookOpen },
	{ labelKey: "analytics", href: "/analytics", icon: BarChart3 },
	{ labelKey: "monteCarlo", href: "/monte-carlo", icon: Dices },
	{
		labelKey: "riskSimulation",
		href: "/risk-simulation",
		icon: FlaskConical,
	},
	{ labelKey: "backtest", href: "/backtest", icon: FlaskRound },
	{ labelKey: "playbook", href: "/playbook", icon: FileText },
	{ labelKey: "reports", href: "/reports", icon: FileBarChart },
	{ labelKey: "monthly", href: "/monthly", icon: CalendarDays },
	{ labelKey: "settings", href: "/settings", icon: Settings },
]

export { navItems, type NavItem }
