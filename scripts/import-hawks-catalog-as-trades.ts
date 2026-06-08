/**
 * import-hawks-catalog-as-trades.ts
 *
 * Replays the user's hand-curated Hawks 90-day backtest catalog
 * (`data/hawks/user-entries/*.json`) as trade rows in a dedicated
 * `Hawks Backtest 2026` trading account so the results show up in
 * the journal UI.
 *
 * Per-trade we compute:
 *   - entry_price  = catalog FECHAMENTO BOX  (closePrice on the JSON entry)
 *   - exit_price   = formulaic from hawks_weekly_oco for WIN:
 *                      ST  → entry ± 200 pts  (1R loss)
 *                      GA  → entry ∓ 600 pts  (3R win)
 *                      BE  → entry            (zero P&L)
 *   - position_size = 2 contracts
 *   - 1R           = 200 pts × R$1.00/pt × 2 contracts × 100 = 40_000 cents
 *
 * Plus exactly 8 indicator tags per trade (curated subset). Each tag is
 * one of a pair (favor/against, aligned/blocked, breach/inside, marked/none)
 * resolved against the brick's JSONB indicators at entry time:
 *   1. vwap_d        (favor / against)
 *   2. ema27_5m      (favor / against)
 *   3. htf_15m_gate  (aligned / blocked) — Hawks Triple Screen 15m gate
 *   4. htf_60m_gate  (aligned / blocked) — Hawks Triple Screen 60m gate
 *   5. macd1         (favor / against)
 *   6. keltner_outer (breach / inside)   — kc2 (outer) Keltner pair
 *   7. topos_fundos  (marked / none)     — recent painted pivot
 *   8. ajuste        (favor / against)   — D-1 settlement bias
 *
 * Idempotent — wipes all trades + trade_tags for the backtest account
 * before re-ingesting. The 16 tags themselves are upserted by name.
 *
 * Usage:
 *   pnpm tsx scripts/import-hawks-catalog-as-trades.ts
 */

import "dotenv/config"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"

const ADMIN_EMAIL = "admin@bravo.com"
const ACCOUNT_NAME = "Hawks Backtest 2026"
const ASSET_SYMBOL = "WIN"
const TIMEFRAME_CODE = "hawk_5m_win"

// WIN futures: 1 pt = R$1.00 per contract. With 2 contracts: 200 cents/pt.
const POSITION_SIZE = 2
const CENTS_PER_POINT = 200 // 1 pt × R$1.00 × 2 contracts × 100 cents
const STOP_POINTS = 200 // 1R
const TARGET_POINTS = 600 // 3R
const ONE_R_CENTS = STOP_POINTS * CENTS_PER_POINT // 40,000

interface CatalogEntry {
	date: string // YYYY-MM-DD (BRT)
	brickIndex: number
	direction: "long" | "short"
	label?: string
	notes?: string
	expectedResult?: "BE" | "GA" | "ST"
	closePrice?: number
}

interface TagDimension {
	name: string // tag dimension stem
	favor: string // tag name applied when the indicator is "in favor"
	against: string // applied when "against"
}

const TAG_DIMS: TagDimension[] = [
	{ name: "vwap_d", favor: "vwap_d_favor", against: "vwap_d_against" },
	{ name: "ema27_5m", favor: "ema27_5m_favor", against: "ema27_5m_against" },
	{
		name: "htf_15m_gate",
		favor: "htf_15m_aligned",
		against: "htf_15m_blocked",
	},
	{
		name: "htf_60m_gate",
		favor: "htf_60m_aligned",
		against: "htf_60m_blocked",
	},
	{ name: "macd1", favor: "macd1_favor", against: "macd1_against" },
	{
		name: "keltner_outer",
		favor: "keltner_outer_breach",
		against: "keltner_outer_inside",
	},
	{
		name: "topos_fundos",
		favor: "topos_fundos_marked",
		against: "topos_fundos_none",
	},
	{ name: "ajuste", favor: "ajuste_favor", against: "ajuste_against" },
]

const ALL_TAG_NAMES = TAG_DIMS.flatMap((d) => [d.favor, d.against])

interface BrickRow {
	id: string
	timestamp: Date
	open: number
	high: number
	low: number
	close: number
	indicators: Record<string, number | null | undefined>
}

const loadCatalog = (): CatalogEntry[] => {
	const dir = resolve(process.cwd(), "data/hawks/user-entries")
	const files = readdirSync(dir).filter((f) => f.endsWith(".json"))
	const out: CatalogEntry[] = []
	for (const f of files) {
		const rows = JSON.parse(
			readFileSync(resolve(dir, f), "utf-8")
		) as CatalogEntry[]
		out.push(...rows)
	}
	return out
}

/**
 * For SHORT entries: indicators that suggest downward bias = "favor".
 * For LONG entries: indicators that suggest upward bias = "favor".
 * Returns null when there's not enough data on the brick to tag this
 * dimension (we then skip the tag entirely rather than guessing).
 */
const resolveTag = (
	dim: TagDimension,
	direction: "long" | "short",
	entryPrice: number,
	ind: Record<string, number | null | undefined>
): string | null => {
	const v = (k: string): number | null => {
		const x = ind[k]
		return typeof x === "number" && Number.isFinite(x) ? x : null
	}
	const cmpPriceVs = (refKey: string): "favor" | "against" | null => {
		const ref = v(refKey)
		if (ref === null) {
			return null
		}
		if (direction === "short") {
			return entryPrice < ref ? "favor" : "against"
		}
		return entryPrice > ref ? "favor" : "against"
	}
	switch (dim.name) {
		case "vwap_d":
			return pickTag(dim, cmpPriceVs("vwap_d"))
		case "ema27_5m":
			return pickTag(dim, cmpPriceVs("ema27"))
		case "ajuste":
			return pickTag(dim, cmpPriceVs("ajuste"))
		case "htf_15m_gate": {
			const ema = v("mme27_15m")
			const open = v("prev_15m_open")
			const close = v("prev_15m_close")
			if (ema === null || open === null || close === null) {
				return null
			}
			const aligned =
				direction === "short"
					? open < ema && close < ema
					: open > ema && close > ema
			return pickTag(dim, aligned ? "favor" : "against")
		}
		case "htf_60m_gate": {
			const ema = v("mme27_60m")
			const open = v("prev_60m_open")
			const close = v("prev_60m_close")
			if (ema === null || open === null || close === null) {
				return null
			}
			const aligned =
				direction === "short"
					? open < ema && close < ema
					: open > ema && close > ema
			return pickTag(dim, aligned ? "favor" : "against")
		}
		case "macd1": {
			const hist = v("macd1_histo")
			if (hist === null) {
				return null
			}
			if (direction === "short") {
				return pickTag(dim, hist < 0 ? "favor" : "against")
			}
			return pickTag(dim, hist > 0 ? "favor" : "against")
		}
		case "keltner_outer": {
			const sup = v("kc2_sup")
			const inf = v("kc2_inf")
			if (sup === null || inf === null) {
				return null
			}
			const breached =
				direction === "short" ? entryPrice < inf : entryPrice > sup
			return pickTag(dim, breached ? "favor" : "against")
		}
		case "topos_fundos": {
			// tbd1/2/3 default to 0 when no pivot is painted on the brick.
			// We treat "marked" as any non-zero value across the three.
			const t1 = v("tbd1") ?? 0
			const t2 = v("tbd2") ?? 0
			const t3 = v("tbd3") ?? 0
			const marked = t1 !== 0 || t2 !== 0 || t3 !== 0
			return pickTag(dim, marked ? "favor" : "against")
		}
		default:
			return null
	}
}

const pickTag = (
	dim: TagDimension,
	side: "favor" | "against" | null
): string | null => {
	if (side === null) {
		return null
	}
	return side === "favor" ? dim.favor : dim.against
}

interface ExitMath {
	exitPrice: number
	stopLoss: number
	takeProfit: number
	pnlCents: number
	rOutcome: number
	outcome: "win" | "loss" | "breakeven"
}

const computeExitMath = (
	direction: "long" | "short",
	entryPrice: number,
	expected: "BE" | "GA" | "ST"
): ExitMath => {
	const sign = direction === "short" ? -1 : 1
	const stopLoss = entryPrice - sign * STOP_POINTS
	const takeProfit = entryPrice + sign * TARGET_POINTS
	let exitPrice: number
	let pnlCents: number
	let rOutcome: number
	let outcome: "win" | "loss" | "breakeven"
	if (expected === "GA") {
		exitPrice = takeProfit
		pnlCents = TARGET_POINTS * CENTS_PER_POINT // +120,000
		rOutcome = 3
		outcome = "win"
	} else if (expected === "ST") {
		exitPrice = stopLoss
		pnlCents = -STOP_POINTS * CENTS_PER_POINT // -40,000
		rOutcome = -1
		outcome = "loss"
	} else {
		exitPrice = entryPrice
		pnlCents = 0
		rOutcome = 0
		outcome = "breakeven"
	}
	return { exitPrice, stopLoss, takeProfit, pnlCents, rOutcome, outcome }
}

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = postgres(databaseUrl, { max: 4, idle_timeout: 30 })

	// ─── Resolve user, asset, timeframe ───────────────────────────────────
	const users = (await sql`
		SELECT id FROM users WHERE email = ${ADMIN_EMAIL} LIMIT 1
	`) as { id: string }[]
	const userId = users[0]?.id
	if (!userId) {
		throw new Error(`User ${ADMIN_EMAIL} not found`)
	}

	const assetsRes = (await sql`
		SELECT id FROM assets WHERE symbol = ${ASSET_SYMBOL} LIMIT 1
	`) as { id: string }[]
	const assetId = assetsRes[0]?.id
	if (!assetId) {
		throw new Error(`Asset ${ASSET_SYMBOL} not found`)
	}

	const tfRes = (await sql`
		SELECT id FROM timeframes WHERE code = ${TIMEFRAME_CODE} LIMIT 1
	`) as { id: string }[]
	const timeframeId = tfRes[0]?.id
	if (!timeframeId) {
		throw new Error(
			`Timeframe ${TIMEFRAME_CODE} not found — run materialize-hawks-timeframes.ts`
		)
	}

	// ─── Create/find the dedicated backtest account ───────────────────────
	const accountRes = (await sql`
		INSERT INTO trading_accounts (user_id, name, description, account_type, default_asset_id)
		VALUES (
			${userId}, ${ACCOUNT_NAME},
			'Imported from data/hawks/user-entries/ — Hawks 90-day backtest catalog (Jan–May 2026)',
			'personal', ${assetId}
		)
		ON CONFLICT (user_id, name) DO UPDATE SET
			updated_at = NOW()
		RETURNING id
	`) as { id: string }[]
	const accountId = accountRes[0]!.id
	console.log(`Account: ${ACCOUNT_NAME} (${accountId})`)

	await sql`
		INSERT INTO account_assets (account_id, asset_id, is_enabled)
		VALUES (${accountId}, ${assetId}, true)
		ON CONFLICT (account_id, asset_id) DO NOTHING
	`
	await sql`
		INSERT INTO account_timeframes (account_id, timeframe_id, is_enabled)
		VALUES (${accountId}, ${timeframeId}, true)
		ON CONFLICT (account_id, timeframe_id) DO NOTHING
	`

	// ─── Upsert the 16 indicator tags (user-level) ────────────────────────
	const tagIdByName = new Map<string, string>()
	for (const name of ALL_TAG_NAMES) {
		const row = (await sql`
			INSERT INTO tags (user_id, name, type)
			VALUES (${userId}, ${name}, 'general')
			ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
			RETURNING id
		`) as { id: string }[]
		tagIdByName.set(name, row[0]!.id)
	}
	console.log(`Tags ready: ${tagIdByName.size} indicator tag(s)`)

	// ─── Wipe existing trades for this account (idempotent re-runs) ───────
	const wiped = (await sql`
		DELETE FROM trades WHERE account_id = ${accountId} RETURNING id
	`) as { id: string }[]
	console.log(`Wiped ${wiped.length} existing trade row(s)`)

	// ─── Load catalog + brick rows ────────────────────────────────────────
	const catalog = loadCatalog()
	console.log(
		`Catalog: ${catalog.length} entries across ${new Set(catalog.map((e) => e.date)).size} day(s)`
	)
	if (catalog.length === 0) {
		console.warn("No catalog entries to import — done")
		await sql.end()
		return
	}

	// Pull every needed brick in one query (date + candle_index per entry).
	// The user catalog uses 1-indexed BOX which is exactly the candle_index
	// the loader wrote.
	const dates = [...new Set(catalog.map((e) => e.date))]
	const allBricks = (await sql`
		SELECT id, timestamp, open::float8 AS open, high::float8 AS high,
		       low::float8 AS low, close::float8 AS close,
		       candle_index, indicators
		FROM price_candles
		WHERE asset_id = ${assetId}
		  AND timeframe_id = ${timeframeId}
		  AND (timestamp AT TIME ZONE 'America/Sao_Paulo')::date = ANY(${dates}::date[])
	`) as Array<{
		id: string
		timestamp: string | Date
		open: number
		high: number
		low: number
		close: number
		candle_index: number | null
		indicators: Record<string, number | null | undefined> | null
	}>

	// Daily session anchors (ajuste etc.) moved out of candle JSONB —
	// fetch them per-day and merge into each brick's indicators in memory
	// so the existing tag-generation logic sees a unified shape.
	const anchorRows = (await sql`
		SELECT date::text AS date, payload
		FROM asset_session_anchors
		WHERE asset_id = ${assetId}
		  AND date = ANY(${dates}::date[])
	`) as Array<{ date: string; payload: Record<string, number> }>
	const anchorByDate = new Map<string, Record<string, number>>()
	for (const a of anchorRows) {
		anchorByDate.set(a.date, a.payload ?? {})
	}
	console.log(`Loaded ${anchorRows.length} session anchor day(s)`)

	const brickByKey = new Map<string, BrickRow>()
	for (const r of allBricks) {
		if (r.candle_index === null) {
			continue
		}
		const ts = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)
		// Group by BRT-day + candle_index.
		const brtDate = new Date(ts.getTime() - 3 * 60 * 60 * 1000)
		const dayKey = brtDate.toISOString().slice(0, 10)
		const key = `${dayKey}:${r.candle_index}`
		const indicators = { ...(r.indicators ?? {}) }
		// Merge anchor payload so resolveTag can read ind["ajuste"] etc.
		const anchorPayload = anchorByDate.get(dayKey)
		if (anchorPayload) {
			for (const [k, v] of Object.entries(anchorPayload)) {
				if (!(k in indicators) && typeof v === "number") {
					indicators[k] = v
				}
			}
		}
		brickByKey.set(key, {
			id: r.id,
			timestamp: ts,
			open: Number(r.open),
			high: Number(r.high),
			low: Number(r.low),
			close: Number(r.close),
			indicators,
		})
	}
	console.log(`Loaded ${brickByKey.size} brick row(s) for matched days`)

	// ─── Build trade + tag rows ───────────────────────────────────────────
	let inserted = 0
	let skipped = 0
	const tagCounts = new Map<string, number>()
	for (const entry of catalog) {
		const key = `${entry.date}:${entry.brickIndex}`
		const brick = brickByKey.get(key)
		const expected = entry.expectedResult ?? "BE"
		const entryPrice = entry.closePrice ?? brick?.close
		if (!brick || entryPrice === undefined) {
			skipped++
			continue
		}
		const math = computeExitMath(entry.direction, entryPrice, expected)
		const entryDate = brick.timestamp
		// Approximate exit time: 30 minutes after entry brick. Catalog doesn't
		// record exit times; this gives analytics a sensible duration without
		// pretending we know the exact exit brick.
		const exitDate = new Date(entryDate.getTime() + 30 * 60 * 1000)

		const tradeRows = (await sql`
			INSERT INTO trades (
				account_id, asset, direction, timeframe_id,
				entry_date, exit_date,
				entry_price, exit_price, position_size,
				stop_loss, take_profit,
				planned_risk_amount, planned_r_multiple,
				pnl, realized_r_multiple,
				one_r_snapshot_cents, r_outcome, outcome,
				followed_plan, source
			) VALUES (
				${accountId}, ${ASSET_SYMBOL}, ${entry.direction}, ${timeframeId},
				${entryDate.toISOString()}, ${exitDate.toISOString()},
				${String(entryPrice)}, ${String(math.exitPrice)}, ${String(POSITION_SIZE)},
				${String(math.stopLoss)}, ${String(math.takeProfit)},
				${String(ONE_R_CENTS)}, ${String(3)},
				${String(math.pnlCents)}, ${math.rOutcome.toFixed(2)},
				${ONE_R_CENTS}, ${math.rOutcome.toFixed(2)}, ${math.outcome},
				true, 'csv'
			)
			RETURNING id
		`) as { id: string }[]
		const tradeId = tradeRows[0]!.id

		// Resolve + insert exactly 8 tags (or fewer if a dimension has no data).
		const tagsForTrade: string[] = []
		for (const dim of TAG_DIMS) {
			const tagName = resolveTag(
				dim,
				entry.direction,
				entryPrice,
				brick.indicators
			)
			if (tagName) {
				tagsForTrade.push(tagName)
				tagCounts.set(tagName, (tagCounts.get(tagName) ?? 0) + 1)
			}
		}
		for (const tagName of tagsForTrade) {
			const tagId = tagIdByName.get(tagName)
			if (!tagId) {
				continue
			}
			await sql`
				INSERT INTO trade_tags (trade_id, tag_id)
				VALUES (${tradeId}, ${tagId})
			`
		}
		inserted++
	}

	console.log("")
	console.log("=== IMPORT SUMMARY ===")
	console.log(`Trades inserted:  ${inserted}`)
	console.log(`Skipped (no brick or no price): ${skipped}`)
	console.log("")
	console.log("Tag distribution:")
	for (const dim of TAG_DIMS) {
		const f = tagCounts.get(dim.favor) ?? 0
		const a = tagCounts.get(dim.against) ?? 0
		console.log(
			`  ${dim.name.padEnd(15)}  ${dim.favor.padEnd(28)} ${f.toString().padStart(4)}    ${dim.against.padEnd(28)} ${a.toString().padStart(4)}`
		)
	}

	await sql.end()
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
