import { RENKO_SERIES, type RenkoWeek } from "./data/renko-series"
import type { AssetMap } from "./assets"
import type { SeedSql } from "./helpers/sql"

// Renko calibration + weekly OCO brackets, both derived from the MEASURED
// 134-week series. This replaces a 22-row synthetic table that was fitted
// backwards as a smooth curve from two real anchors: its week-over-week move
// was ±4R (mean 1.5) against reality's −12 to +23R (mean 6.8), and through the
// March 2026 volatility spike it understated the 60min box by about a third.
// Anything that consumed it used stops up to 41R too small.
//
// OCO derivation, and what is doctrine versus what is a placement proxy:
//
//   stopTicks   = 2 * size5m       DOCTRINE. Initial stop is 2 boxes of the
//                                  5min chart, and the stop is ALWAYS placed
//                                  from the 5min regardless of strategy
//                                  (playbook §7, overlay §18.1).
//   beTrigger   = 2 * size5m       DOCTRINE. Break-even when gain ≈ risk, i.e.
//                                  1:1 (playbook §7 Método 3, L657).
//   targetTicks = 6 * size5m       ⚠️ PROXY, NOT DOCTRINE. Método 3's real exit
//                                  is: BE at 1:1, wait for the 76,4% Fibonacci
//                                  EXPANSION zone, then trail 2 boxes behind.
//                                  That zone depends on the measured move and
//                                  cannot be derived from the box size. An OCO
//                                  bracket still needs a far leg, so 3R stands
//                                  in for it and the trail supersedes it.
//
// BOTH ASSETS derive from their own size5m. The previous seed hardcoded WDO at
// stop=8/target=24/be=8 for all 22 weeks while the measured WDO 5min R runs 3
// to 9, so every dollar bracket was wrong except by coincidence.
//
// ⚠️ WDO IS THE EXPENSIVE INSTRUMENT HERE, which the tick counts hide:
//   WIN 1 tick = 5 points   = R$1,00 → median stop 2*14 = 28 ticks = R$28
//   WDO 1 tick = 0.5 points = R$5,00 → median stop 2*5  = 10 ticks = R$50
// The dollar's R is nearly 3x smaller in ticks and its stop costs nearly 2x
// more in money. See playbook §18.9.

const TRAIL_CONFIG = {
	mode: "box_trail" as const,
	boxesBehind: 2,
	// Where the trail arms. Same 3R proxy as targetTicks, for the same reason.
	triggerAtR: 3,
}

const size5mFor = (w: RenkoWeek, asset: "WIN" | "WDO"): number =>
	asset === "WIN" ? w.win[1] : w.wdo[1]

const seedRenkoSizes = async (
	sql: SeedSql,
	assetMap: AssetMap
): Promise<void> => {
	console.log(
		`\n📦 Seeding Hawks Renko sizes (${RENKO_SERIES.length} measured weeks x 2 assets)...`
	)

	for (const w of RENKO_SERIES) {
		for (const asset of ["WIN", "WDO"] as const) {
			const sizes = asset === "WIN" ? w.win : w.wdo
			await sql`
				INSERT INTO hawks_renko_sizes (
					id, asset_id, effective_date, week_number,
					size_1m, size_5m, size_15m, size_60m, size_1d
				) VALUES (
					gen_random_uuid(), ${assetMap[asset]}, ${w.effectiveDate}, ${w.weekNumber},
					${sizes[0]}, ${sizes[1]}, ${sizes[2]}, ${sizes[3]}, ${sizes[4]}
				)
				ON CONFLICT (asset_id, effective_date) DO UPDATE SET
					week_number = EXCLUDED.week_number,
					size_1m = EXCLUDED.size_1m,
					size_5m = EXCLUDED.size_5m,
					size_15m = EXCLUDED.size_15m,
					size_60m = EXCLUDED.size_60m,
					size_1d = EXCLUDED.size_1d
			`
		}
	}

	console.log(`✅ ${RENKO_SERIES.length * 2} Renko rows seeded`)
}

const seedWeeklyOco = async (
	sql: SeedSql,
	accountId: string
): Promise<void> => {
	console.log("\n📦 Seeding Hawks weekly OCO (derived per asset per week)...")

	for (const w of RENKO_SERIES) {
		for (const asset of ["WIN", "WDO"] as const) {
			const s5 = size5mFor(w, asset)
			const stopTicks = 2 * s5
			const targetTicks = 6 * s5
			const pointsPerTick = asset === "WIN" ? 5 : 0.5
			const reaisPerTick = asset === "WIN" ? 1 : 5
			const notes = [
				`Stop=1R (${stopTicks}t / ${stopTicks * pointsPerTick}pts / R$${stopTicks * reaisPerTick} por contrato), BE@+1R.`,
				`Alvo ${targetTicks}t e trail armando em +3R sao PROXY da zona de 76,4%, nao doutrina.`,
				`Derivado de size5m=${s5} (${w.label}).`,
			].join(" ")

			await sql`
				INSERT INTO hawks_weekly_oco (
					id, account_id, effective_date, week_number, asset,
					stop_ticks, target_ticks, breakeven_trigger_ticks,
					trail_config, notes
				) VALUES (
					gen_random_uuid(), ${accountId}, ${w.effectiveDate}, ${w.weekNumber}, ${asset},
					${stopTicks}, ${targetTicks}, ${stopTicks},
					${JSON.stringify(TRAIL_CONFIG)}, ${notes}
				)
				ON CONFLICT (account_id, effective_date, asset) DO UPDATE SET
					week_number = EXCLUDED.week_number,
					stop_ticks = EXCLUDED.stop_ticks,
					target_ticks = EXCLUDED.target_ticks,
					breakeven_trigger_ticks = EXCLUDED.breakeven_trigger_ticks,
					trail_config = EXCLUDED.trail_config,
					notes = EXCLUDED.notes
			`
		}
	}

	console.log(`✅ ${RENKO_SERIES.length * 2} OCO rows seeded`)

	const latest = RENKO_SERIES[RENKO_SERIES.length - 1]
	if (latest) {
		const win = size5mFor(latest, "WIN")
		const wdo = size5mFor(latest, "WDO")
		console.log(
			`   current week ${latest.effectiveDate}: WIN stop ${2 * win}t (R$${2 * win}), WDO stop ${2 * wdo}t (R$${2 * wdo * 5})`
		)
	}
}

export const seedHawksRenkoAndOco = async (
	sql: SeedSql,
	assetMap: AssetMap,
	accountId: string
): Promise<void> => {
	await seedRenkoSizes(sql, assetMap)
	await seedWeeklyOco(sql, accountId)
}
