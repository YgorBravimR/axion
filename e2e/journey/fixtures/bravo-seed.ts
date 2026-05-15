/**
 * Bravo persona — the canonical journey-suite test user.
 *
 * The persona is a fixed constant (no timestamp). A clean DB slot is
 * guaranteed by `e2e/global.teardown.ts`, which runs as BOTH Playwright
 * `globalSetup` AND `globalTeardown` (see `playwright.config.ts`):
 *   - On start: cascade-delete any prior `bravo@axion-demo.com` user
 *     and purge the `login:<email>` rate-limit slot.
 *   - On end:   same cleanup, so the staging DB stays empty between runs.
 *
 * The fixed email gives the showcase video a recognizable identity for
 * sales / marketing pickup; the per-chain reset replaces the older
 * timestamped-email workaround that used to dodge the login rate-limit.
 */

interface BravoPersona {
	readonly email: string
	readonly password: string
	readonly name: string
	readonly accountName: string
}

export const BRAVO: BravoPersona = {
	email: "bravo@axion-demo.com",
	password: "BravoTrader2026!",
	name: "Bravo Trader",
	accountName: "Bravo's Main Account",
}
