/**
 * check-dead-axes.ts — STATIC CI gate.
 *
 * Every quality-gate path exposed in `HAWKS_SWEEPABLE_PARAMS` must be
 * referenced by at least one rule in `hawks-quality-rules.ts`. Otherwise,
 * sweeping it is dead (the optimizer wastes refine budget on a knob the
 * engine can't read).
 *
 * This is a pure-source check — no DB, no engine run — so it's safe to wire
 * into `.github/workflows/lint.yml` alongside `pnpm lint` and `tsc --noEmit`.
 *
 * Exit code:
 *   0 — every quality-gates axis has at least one rule referencing it.
 *   1 — one or more axes are DEAD (no rule reads them).
 *
 * Limitations (intentional):
 *   - This is a substring scan. We don't try to parse TypeScript AST. If a
 *     rule references `aggressionMode` via a stringly-typed lookup, the
 *     check passes. The intent is to catch the obvious case where a config
 *     field is exposed in the sweep catalog but no rule ever reads it.
 *   - We only check `qualityGates.*` paths. Non-gate axes (slippageTicks,
 *     stop.breakeven.*, target.levels.*, fireCooldownBricks, etc.) feed
 *     the engine directly via different code paths and are validated by
 *     scripts/sweep-validate.ts at runtime.
 *
 * Re-runnable locally:
 *   pnpm check:dead-axes
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { HAWKS_SWEEPABLE_PARAMS } from "@/lib/backtest/presets/hawks-presets"

const QUALITY_GATES_PREFIX = "entry.config.qualityGates."

// Synthetic / structural paths that don't map to a single QualityGatesConfig key.
const SYNTHETIC_PATHS = new Set<string>([
	`${QUALITY_GATES_PREFIX}__bundle__`, // bundle selector — fans out to many keys
])

// tierThresholds.* keys are read by `scoreToTier`, not by individual rules.
const TIER_THRESHOLD_PREFIX = `${QUALITY_GATES_PREFIX}tierThresholds.`

const RULES_FILE = resolve(
	process.cwd(),
	"src/lib/backtest/modules/entry/hawks-quality-rules.ts"
)

const main = (): void => {
	const rulesSrc = readFileSync(RULES_FILE, "utf8")

	const checks: Array<{
		path: string
		gateKey: string
		referenced: boolean
	}> = []

	for (const param of HAWKS_SWEEPABLE_PARAMS) {
		if (!param.path.startsWith(QUALITY_GATES_PREFIX)) {
			continue
		}
		if (SYNTHETIC_PATHS.has(param.path)) {
			continue
		}
		if (param.path.startsWith(TIER_THRESHOLD_PREFIX)) {
			// tierThresholds.X — read by scoreToTier; check for that helper.
			const referenced = rulesSrc.includes("scoreToTier")
			checks.push({
				path: param.path,
				gateKey: param.path.slice(TIER_THRESHOLD_PREFIX.length),
				referenced,
			})
			continue
		}
		const gateKey = param.path.slice(QUALITY_GATES_PREFIX.length)
		// For nested paths like "keltnerInner.mode", check for the parent key
		// ("keltnerInner") as well as the full nested path in references.
		const isNestedPath = gateKey.includes(".")
		const parentKey = isNestedPath ? gateKey.split(".")[0] : null
		const referenced =
			rulesSrc.includes(`qualityGates?.${gateKey}`) ||
			rulesSrc.includes(`qualityGates.${gateKey}`) ||
			rulesSrc.includes(`[${gateKey}]`) ||
			rulesSrc.includes(`{ ${gateKey} }`) ||
			rulesSrc.includes(`, ${gateKey}`) ||
			rulesSrc.includes(`{${gateKey}`) ||
			rulesSrc.includes(`${gateKey}:`) ||
			// For nested paths, also check the parent key (e.g., "keltnerInner" in "keltnerInner.mode").
			(parentKey !== null &&
				(rulesSrc.includes(`qualityGates?.${parentKey}`) ||
					rulesSrc.includes(`qualityGates.${parentKey}`) ||
					rulesSrc.includes(`[${parentKey}]`) ||
					rulesSrc.includes(`{ ${parentKey} }`) ||
					rulesSrc.includes(`, ${parentKey}`) ||
					rulesSrc.includes(`{${parentKey}`) ||
					rulesSrc.includes(`${parentKey}:`)))
		checks.push({ path: param.path, gateKey, referenced })
	}

	const dead = checks.filter((c) => !c.referenced)
	console.log("── dead-axis static check ──")
	console.log(`paths inspected:  ${checks.length}`)
	console.log(`dead axes:        ${dead.length}`)
	if (dead.length > 0) {
		console.log(
			"\nDEAD axes (no rule in hawks-quality-rules.ts references them):"
		)
		for (const d of dead) {
			console.log(`  ✗ ${d.path}`)
			console.log(`    gate key "${d.gateKey}" never appears in ${RULES_FILE}`)
		}
		console.log("\nFix options:")
		console.log("  - Implement a rule that reads the gate key, OR")
		console.log("  - Remove the axis entry from HAWKS_SWEEPABLE_PARAMS.")
		console.log(
			"\nSee `docs/postMorten/backend.md` [BUG-2026-05-31-3] for context."
		)
		process.exit(1)
	}
	console.log("✓ every quality-gates axis is referenced by at least one rule.")
	process.exit(0)
}

main()
