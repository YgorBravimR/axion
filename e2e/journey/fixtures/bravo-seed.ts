import fs from "node:fs"
import path from "node:path"

/**
 * Bravo persona — the canonical journey-suite test user.
 *
 * Each project (Stage 0, Stage 1, ...) runs in its own worker process, so a
 * module-level `Date.now()` would diverge across stages. To keep the persona
 * stable across the chain, the FIRST stage that calls `getBravo()` writes the
 * persona to `e2e/.auth/bravo.json`; subsequent stages read it back.
 *
 * Reset the chain by deleting that file. A fixed-email + per-chain DB
 * seeder reset alternative is tracked in `docs/backlog.md`.
 */

const PERSONA_PATH = path.join("e2e", ".auth", "bravo.json")

interface BravoPersona {
	readonly email: string
	readonly password: string
	readonly name: string
	readonly accountName: string
	readonly runId: number
}

const buildFreshPersona = (): BravoPersona => {
	const runId = Date.now()
	return {
		email: `bravo-${runId}@axion-demo.com`,
		password: "BravoTrader2026!",
		name: "Bravo Trader",
		accountName: "Bravo's Main Account",
		runId,
	}
}

const loadOrCreatePersona = (): BravoPersona => {
	try {
		const raw = fs.readFileSync(PERSONA_PATH, "utf-8")
		return JSON.parse(raw) as BravoPersona
	} catch {
		const persona = buildFreshPersona()
		fs.mkdirSync(path.dirname(PERSONA_PATH), { recursive: true })
		fs.writeFileSync(PERSONA_PATH, JSON.stringify(persona, null, 2))
		return persona
	}
}

export const BRAVO: BravoPersona = loadOrCreatePersona()
