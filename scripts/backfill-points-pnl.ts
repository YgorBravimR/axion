/**
 * One-time backfill for `trades.points_pnl`.
 *
 * Scans every trade with NULL `pointsPnl`, computes the points-equivalent
 * from financial P&L using the regulated point-value table for B3 mini-
 * contracts (WIN: 20 cents/pt, WDO: 1000 cents/pt), and writes the result
 * to the column. Trades on assets without a known point-value mapping are
 * left NULL — the UI treats NULL as "not applicable" rather than zero.
 *
 * Run: `bun run scripts/backfill-points-pnl.ts`
 */
import { config } from "dotenv"
config({ path: ".env" })

import { isNull, eq } from "drizzle-orm"

// Cents per 1 point per 1 contract. Regulated by B3 — not user-configurable.
// (Mirror of POINT_VALUES in src/lib/contracts/point-values.ts, expressed
// in cents to avoid floating drift on the integer-cents path.)
const POINT_VALUE_CENTS: Record<string, number> = {
	WIN: 20,
	WDO: 1000,
}

interface ComputePointsPnlInput {
	financialPnlCents: number
	asset: string
	contracts: number
}

const computePointsPnl = ({
	financialPnlCents,
	asset,
	contracts,
}: ComputePointsPnlInput): number | null => {
	const pv = POINT_VALUE_CENTS[asset.toUpperCase()]
	if (!pv || contracts <= 0) return null
	return financialPnlCents / (pv * contracts)
}

const runBackfill = async (): Promise<void> => {
	console.log("[backfill-points-pnl] Starting...")

	// Dynamic imports keep the DB driver out of module scope so the pure
	// `computePointsPnl` helper can be unit-tested without a live DB connection.
	const { db } = await import("../src/db/drizzle")
	const { trades } = await import("../src/db/schema")

	// positionSize is the contracts-held count we need (text-encoded integer);
	// contractsExecuted is the leg count (typically 2× position) and would
	// halve the resulting points figure.
	const rows = await db.query.trades.findMany({
		where: isNull(trades.pointsPnl),
		columns: { id: true, pnl: true, asset: true, positionSize: true },
	})

	console.log(`[backfill-points-pnl] Found ${rows.length} trades with NULL pointsPnl`)

	let updated = 0
	let skipped = 0

	for (const trade of rows) {
		const financialPnlCents = Number(trade.pnl ?? 0)
		const contracts = Number(trade.positionSize ?? 1) || 1
		const pointsPnl = computePointsPnl({ financialPnlCents, asset: trade.asset, contracts })

		if (pointsPnl === null) {
			skipped++
			continue
		}

		await db
			.update(trades)
			.set({ pointsPnl: String(pointsPnl) })
			.where(eq(trades.id, trade.id))

		updated++
	}

	console.log(`[backfill-points-pnl] Done. Updated: ${updated}, Skipped (unknown asset): ${skipped}`)
}

export { computePointsPnl }

// Run when invoked directly (bun executes top-level module body)
if (import.meta.main) {
	runBackfill()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}
