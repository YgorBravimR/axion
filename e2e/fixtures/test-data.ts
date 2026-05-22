export const TEST_USER = {
	email: "test@example.com",
	password: "TestPassword123",
	name: "Test User",
}

export const NEW_USER = {
	email: `test-${Date.now()}@example.com`,
	password: "NewPassword123",
	name: "New Test User",
}

export const TEST_TRADE = {
	asset: "WIN",
	direction: "long" as const,
	entryPrice: "100.00",
	exitPrice: "105.00",
	positionSize: "10",
	stopLoss: "98.00",
	takeProfit: "110.00",
	riskAmount: "20.00",
}

export const TEST_TRADE_SHORT = {
	asset: "WIN",
	direction: "short" as const,
	entryPrice: "100.00",
	exitPrice: "95.00",
	positionSize: "10",
	stopLoss: "102.00",
	takeProfit: "90.00",
	riskAmount: "20.00",
}

export const TEST_TRADE_LOSS = {
	asset: "WIN",
	direction: "long" as const,
	entryPrice: "100.00",
	exitPrice: "95.00",
	positionSize: "10",
	stopLoss: "98.00",
	riskAmount: "20.00",
}

export const TEST_STRATEGY = {
	code: "TSTSTR",
	name: "Test Strategy",
	description: "A test strategy for E2E testing",
	entryCriteria: "Entry when RSI < 30",
	exitCriteria: "Exit when RSI > 70",
	targetRMultiple: "2.0",
	maxRiskPerTrade: "2",
}

export const TEST_ASSET = {
	code: "TSTE2E",
	symbol: "TEST",
	name: "Test Asset E2E",
	type: "future",
	tickSize: "0.5",
	tickValue: "10",
}

export const TEST_TIMEFRAME = {
	code: "5M",
	name: "5 Minutes",
	type: "time",
	value: "5",
	unit: "minutes",
}

export const ROUTES = {
	home: "/en",
	login: "/en/login",
	register: "/en/register",
	selectAccount: "/en/select-account",
	journal: "/en/journal",
	journalNew: "/en/journal/new",
	analytics: "/en/analytics",
	playbook: "/en/playbook",
	playbookNew: "/en/playbook/new",
	reports: "/en/reports",
	monthly: "/en/monthly",
	yearlyPlan: "/en/yearly-plan",
	settings: "/en/settings",
	commandCenter: "/en/command-center",
	monteCarlo: "/en/monte-carlo",
	monitor: "/en/monitor",
	painel: "/en/painel",
	riskSimulation: "/en/risk-simulation",
	// Phase 4b: Monthly plan moved to standalone route (year/quarter/month parameters)
	monthlyPlan: (): string => {
		const now = new Date()
		const year = now.getFullYear()
		const month = now.getMonth() + 1
		const quarter = Math.ceil(month / 3)
		return `/en/plan/${year}/${quarter}/${month}`
	},
}

export const TEST_CHECKLIST = {
	name: "E2E Morning Routine",
	items: ["Check economic calendar", "Review pre-market levels", "Set alerts"],
}

export const TEST_MONTHLY_PLAN = {
	accountBalance: "50000",
	riskPerTrade: "1",
	dailyLoss: "3",
	monthlyLoss: "6",
}
