import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"

dotenv.config()

/**
 * Ordered test execution via project dependencies.
 *
 * Data flow: settings (assets/timeframes) → playbook (strategies) → journal (trades)
 * → dashboard/analytics/reports/etc. (read trade data)
 *
 * Phase 1 — Foundation:  auth → navigation (no data needed)
 * Phase 2 — Data setup:  settings → playbook → journal (sequential, each creates data)
 * Phase 3 — Validation:  all data-dependent pages (parallel, just read data)
 */

const authState = { storageState: "e2e/.auth/user.json" }

interface PhaseDef {
	name: string
	testMatch: RegExp
}

/** Sequential test phases — order matters for data dependencies */
const orderedPhases: readonly [PhaseDef, ...PhaseDef[]] = [
	{ name: "auth", testMatch: /auth\.spec\.ts/ },
	{ name: "navigation", testMatch: /navigation\.spec\.ts/ },
	{ name: "settings", testMatch: /settings\.spec\.ts/ },
	{ name: "playbook", testMatch: /playbook\.spec\.ts/ },
	{ name: "journal", testMatch: /journal\.spec\.ts/ },
]

/** Data-dependent tests — run in parallel after journal completes */
const dataPhases = [
	{ name: "dashboard", testMatch: /dashboard\.spec\.ts/ },
	{ name: "analytics", testMatch: /analytics\.spec\.ts/ },
	{ name: "holding-period", testMatch: /holding-period\.spec\.ts/ },
	{ name: "reports", testMatch: /reports\.spec\.ts/ },
	{ name: "annual-reporting", testMatch: /annual-reporting\.spec\.ts/ },
	{ name: "monthly", testMatch: /monthly\.spec\.ts/ },
	{ name: "command-center", testMatch: /command-center\.spec\.ts/ },
	{ name: "monthly-plan", testMatch: /monthly-plan\.spec\.ts/ },
	{ name: "tax-engine", testMatch: /tax-engine\.spec\.ts/ },
	{ name: "yearly-plan", testMatch: /yearly-plan\.spec\.ts/ },
	{ name: "monte-carlo", testMatch: /monte-carlo\.spec\.ts/ },
	{ name: "market-monitor", testMatch: /market-monitor\.spec\.ts/ },
]

/** Self-seeding tests — seed their own DB data, only need auth (setup) */
const selfSeedingPhases = [
	{ name: "live-trading-status", testMatch: /live-trading-status\.spec\.ts/ },
	{ name: "auth-security", testMatch: /auth-security\.spec\.ts/ },
]

/**
 * Journey suite stages — ordered, each depends on the previous so that
 * storageState handoff works in PR-mode (project dependencies guarantee
 * Stage N completes before Stage N+1 starts).
 *
 * Tagged @journey in spec files so they can be filtered with --grep.
 * Phase 1: only Stages 0+1. Phases 2-3 will append more entries.
 *
 * @see docs/design/zero-to-hero-e2e.md
 */
interface JourneyStage {
	name: string
	testMatch: RegExp
}

const journeyStages: readonly JourneyStage[] = [
	{ name: "journey-00-welcome", testMatch: /journey\/00-welcome\.spec\.ts/ },
	{
		name: "journey-01-foundation",
		testMatch: /journey\/01-foundation\.spec\.ts/,
	},
	{
		name: "journey-02-fractal-plan",
		testMatch: /journey\/02-fractal-plan\.spec\.ts/,
	},
	{
		name: "journey-03-pressure-test",
		testMatch: /journey\/03-pressure-test\.spec\.ts/,
	},
	{
		name: "journey-04-daily-loop",
		testMatch: /journey\/04-daily-loop\.spec\.ts/,
	},
	{
		name: "journey-05-weekly",
		testMatch: /journey\/05-weekly\.spec\.ts/,
	},
	{
		name: "journey-06-monthly",
		testMatch: /journey\/06-monthly\.spec\.ts/,
	},
]

/**
 * Build journey projects for a given profile (ci vs demo).
 *
 * CI profile: headless, default speed, no video, parallel where possible.
 * Demo profile: headed, slowMo, video on, serial (workers:1 via top-level config).
 */
const buildJourneyProjects = (
	profile: "ci" | "demo"
): Array<{
	name: string
	testMatch: RegExp
	use: Record<string, unknown>
	dependencies?: string[]
}> => {
	const baseUse =
		profile === "demo"
			? {
					...devices["Desktop Chrome"],
					headless: false,
					launchOptions: { slowMo: 400 },
					video: "on" as const,
					screenshot: "on" as const,
				}
			: { ...devices["Desktop Chrome"] }

	let prev: string | undefined
	return journeyStages.map((stage) => {
		const name = `${stage.name}-${profile}`
		const project = {
			name,
			testMatch: stage.testMatch,
			use: baseUse,
			...(prev ? { dependencies: [prev] } : {}),
		}
		prev = name
		return project
	})
}

interface DeviceConfig {
	[key: string]: unknown
}

const buildDeviceProjects = (device: string, deviceUse: DeviceConfig) => {
	const use = { ...deviceUse, ...authState }
	const prefix = (name: string) => `${device}-${name}`

	// Sequential chain: setup → auth → navigation → settings → playbook → journal
	let prevDependency = "setup"
	const sequential = orderedPhases.map((phase) => {
		const name = prefix(phase.name)
		const project = {
			name,
			testMatch: phase.testMatch,
			use,
			dependencies: [prevDependency],
		}
		prevDependency = name
		return project
	})

	// Parallel fan-out: all depend on journal completing.
	// `prevDependency` now holds the prefixed last sequential name.
	const lastOrdered = prevDependency
	const parallel = dataPhases.map((phase) => ({
		name: prefix(phase.name),
		testMatch: phase.testMatch,
		use,
		dependencies: [lastOrdered],
	}))

	// Self-seeding tests: seed their own DB data. They share the admin account
	// with the sequential phases (notably journal, which inserts many trades),
	// so they must wait for the entire ordered chain on this device to finish
	// before seeding. Non-chromium devices additionally wait for chromium's
	// self-seeding run to avoid cross-device races on the same admin account.
	const selfSeeding = selfSeedingPhases.map((phase) => ({
		name: prefix(phase.name),
		testMatch: phase.testMatch,
		use,
		dependencies:
			device === "chromium"
				? ["setup", lastOrdered]
				: ["setup", lastOrdered, `chromium-${phase.name}`],
	}))

	return [...sequential, ...parallel, ...selfSeeding]
}

export default defineConfig({
	testDir: "./e2e",
	globalSetup: "./e2e/global.teardown.ts",
	globalTeardown: "./e2e/global.teardown.ts",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["html", { open: "never" }], ["list"]],
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3003",
		launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "on-first-retry",
	},
	projects: [
		{
			name: "setup",
			testMatch: /global\.setup\.ts/,
		},
		...buildDeviceProjects("chromium", devices["Desktop Chrome"]),
		...buildDeviceProjects("mobile", devices["iPhone 14"]),
		...buildJourneyProjects("ci"),
		...buildJourneyProjects("demo"),
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3003",
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
})
