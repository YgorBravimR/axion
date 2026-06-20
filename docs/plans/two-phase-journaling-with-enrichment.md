# Two-Phase Journaling: Thin Daily Entry + Periodic Enrichment

**Status**: Locked spec, not yet built. Filed in `docs/backlog.md` under the same title — that entry references this doc for the full context.
**Owner**: Ygor (one-trader scope today; generalizable later if abstractions hold)
**Filed**: 2026-06-12 — brainstorm session with Arch.
**Sequencing**: do NOT build before the **"Hawks autonomous engine: reproduction 51% → improve via quality gates"** backlog entry lands. Hawks reproduction must exceed ~70% before the tier-classification enrichment pass becomes reliable enough to ship. The non-tier enrichment passes (candle math, indicator readout, orders reconciliation, deterministic SL/target) do **not** depend on engine improvement and could in principle ship earlier, but the chosen sequencing keeps them bundled — one focused build, one focused review, one ship.

---

## The problem this solves

Today journaling a day's trades in Axion is high-friction: every trade requires hand-entering not just the execution facts but also SL, target, BE moment, tier, gate state, MACD/VWAP alignment, AJUSTE, and tags. The mandatory-feeling field count makes daily journaling drag, which kills the discipline, which leaves dashboards data-poor — which is exactly the failure mode this design fixes.

The insight: **execution facts and methodology context have different acquisition times.**

- **Execution facts** (entry, exit, qty, prices, side, asset) the trader knows the moment the trade closes — but typing them is mechanical and shouldn't take more than 30 seconds.
- **Methodology context** (indicator alignment at entry brick, tier classification, SL/target distances per the playbook's rules, MFE/MAE relative to brick movement) is **derivable from candles + the trade timestamps + the user's playbook**. It requires zero new typing if the data is available — but the candles need to be loaded first, and that happens in batches, not in real-time.

Two-phase journaling separates these. Trader enters facts daily (cheap). Axion enriches with methodology context periodically (one-shot weekly ritual after candle ingestion). Each phase optimizes for its own constraint: daily flow optimizes for _speed_; weekly enrichment optimizes for _correctness and review_.

---

## Decisions locked in this session (2026-06-12)

### 1. Daily form = whatever the Zod schema declares mandatory

The "minimal daily trade" is exactly the set of fields the existing Zod schema marks non-optional. **There is no separate "simplified form."** The daily form _is_ the existing form.

- Schema home: [`src/lib/validations/trade.ts`](../../src/lib/validations/trade.ts)
- Form component: [`src/components/journal/trade-form.tsx`](../../src/components/journal/trade-form.tsx)

**Rationale**: any field worth enforcing as "you cannot save a trade without this" already lives in the Zod schema. Anything optional is optional precisely because enrichment can fill it later, or because the trader sometimes legitimately doesn't have it. No new minimum to define — Zod already encodes the truth.

**Implication for implementation**: the daily form and the post-enrichment trade form share one source of truth. If a Zod field changes from optional → required (or vice versa), both flows update simultaneously. **Do not fork the form** into a "quick-add" variant. One form, one schema.

### 2. Playbook field is optional at entry time, optional at enrichment time

The playbook (which Hawks tier T1/T2/T3/T4, or some other named playbook) is the only field that carries pure intent — no data source can reconstruct what the trader _meant_ to do.

Three valid states for any trade:

- **Entered at daily time**: trader picks playbook during quick-add.
- **Filled at enrichment time**: trader skips it daily, fills it during weekly review.
- **Left empty**: trader doesn't remember or doesn't want to classify. Trade is journaled without a playbook tag. Dashboards count it as "untagged."

Trader can also **change** the playbook during enrichment review. Daily-time entry is provisional; enrichment-time edit is canonical.

### 3. Stop loss: deterministic, one global rule (per OCO methodology)

The trader never moves the stop. Therefore SL = pure function of `(entry brick, side, brick size for that day)` per the OCO methodology rule.

- Hawks methodology: SL = entry ± `2 × brickSize` on favorable-direction entries, ± `1 × brickSize` on against-direction entries (per the catalog parity calibration; see `src/lib/backtest/modules/entry/user-catalog.ts`).
- Target: deterministic 3R extension from SL distance.

**One global rule, not per-playbook.** If a future methodology violates "never move stop," the trader will add the per-playbook indirection then (YAGNI). For now: one formula, applied to every trade, no human input, no boletas dependency.

**Boletas (`test.csv`) is dropped from the design.** Originally considered as the source for SL/target placement — unnecessary because the deterministic rule recovers it, AND blocked because trader's profitONE prop firm accounts don't export boletas.

### 4. `orders.csv` is the source of truth for executed-trade numbers

The Profit Pro operations CSV (`orders.csv`, one row per round-trip with columns: Ativo / Abertura / Fechamento / Qtd / Preço Compra / Preço Venda / Res. Operação / Drawdown / Ganho Max / Perda Max / Número Operação / etc.) is **authoritative** for:

- Entry/exit timestamps
- Quantity
- Entry/exit prices
- Realized P&L
- Realized MFE (`Ganho Max`)
- Realized MAE (`Perda Max`)
- Realized intra-trade drawdown

Axion-side calculations (P&L from prices × qty × point-value, MFE/MAE from candle replay) are treated as **derived sanity-check values**, not source-of-truth. If Axion's derivation disagrees with Profit's number, **Profit wins**.

**Reasoning**: the real trade is what cleared on the broker. Anything Axion computes from candles is a model of that reality. Models drift; reality doesn't. The trader has been bitten by this before — keep the broker numbers as the spine.

This means the enrichment review screen needs to surface, per trade, both Axion's derived numbers and Profit's reported numbers, with a clear visual when they disagree (slippage, point-value config drift, partial-fill accounting, holiday session adjustments, etc.). Disagreements get logged for later investigation; the saved trade row keeps Profit's numbers.

### 5. Hawks "engine" in the enrichment context = indicator readout, not state-machine replay

The Hawks engine has two distinct capabilities:

- **Wave-detection state machine** (currently ~51% reproduction vs catalog) — classifies what tier an entry would have been if the engine had been driving. Unreliable today.
- **Indicator readout** at any timestamp — pulls the 15m gate, 60m gate, MACD 5m histogram, VWAP D/M/S, AJUSTE for a given brick. Deterministic, 100% reliable, no pattern matching.

The enrichment pass uses **only the indicator readout**. For each trade's entry brick it records, per indicator:

- The indicator's value at entry
- Whether the value was **favorable** (✓) or **contrary** (✗) to the trade's direction
- A count of how many indicators were favorable (the AAA / AA / A tier-quality tag from the existing P2 backlog "Hawks engine: quality multiplier tier-tagging")

The wave-detection pass (which would auto-classify T1/T2/T3/T4) is **deferred** until Hawks reproduction exceeds ~70%. Until then, tier comes from the trader (entry-time or enrichment-time) per decision #2.

### 6. Review UX: stepped, trade-by-trade, day-grouped

After a dry-run enrichment completes, the trader walks one trade at a time. Trades are visually grouped under their day's date header (so the trader sees session context — "this was the Tuesday with the big drawdown"). Per-trade card shows every enriched field with its source, confidence, and an inline edit. Prev / next keyboard shortcuts for fast clicking. Bulk "accept all fields with confidence ≥ high" button to skip past the obviously-correct ones.

No "approve entire day at once" mode — too risky for a single bad autofill to silently land across multiple trades.

### 7. Re-runnable enrichment with version history

Every enrichment pass writes both the value and the metadata: `{ source, sourceVersion, confidence, conflictsWithPriorValue, enrichedAt }`.

**Trigger options**:

- **Bulk by date range**: "enrich trades from 2026-06-01 to 2026-06-07."
- **Single trade**: "re-enrich this one trade" from the trade detail page.
- **All pending**: "enrich every trade that has `enrichmentStatus = pending`."

**State per trade**:

- `enrichmentStatus`: `pending` (never enriched) | `enriched` (review complete) | `partial` (some fields enriched, some still pending — e.g. candles weren't loaded for that day)
- `enrichmentVersion`: incremented every time enrichment is re-run on this trade
- `enrichmentSnapshots`: optional table storing the full dry-run output of each enrichment run for diffing. **Decision: keep snapshots.** Disk is cheap, audit is valuable, and the trader will want to see "what did enrichment v3 change vs v2?" when Hawks engine improves.

**Re-running**:

- When the trader re-runs enrichment on an already-enriched trade, the review screen shows a **diff view**: "tier was T2, now we'd say T3 — accept change?"
- Accepting overwrites the field, increments `enrichmentVersion`, snapshots the prior values.
- Rejecting keeps the current value but records the dry-run output for future reference.

### 8. Trader will follow the ritual

The trader's stated commitment (2026-06-12): the entire reason for the procedure is to enable religious weekly review. Free-flow journaling failed; explicit procedure will succeed. **Design assumption: the weekly ritual happens.** Daily form is kept minimal accordingly; no defensive padding to compensate for skipped weeks.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DAILY (post-session)                          │
│  Trader → /journal/new (or quick-add route)                         │
│  Form = existing trade-form.tsx with Zod schema validation          │
│  Saved as: trades row, enrichmentStatus='pending'                   │
│  Time per trade: ~30s                                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (later, weekly)
┌─────────────────────────────────────────────────────────────────────┐
│              PRE-REQUISITE — CANDLE INGESTION                       │
│  Existing scripts: load-hawks-bricks-by-size,                       │
│                    materialize-hawks-timeframes                     │
│  Trader runs / has run these for the week's trading days.           │
│  If candles missing for a date, enrichment for that day             │
│  stays partial — engine readout pass skips it.                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ENRICH (weekly ritual)                           │
│  Route: /journal/enrich                                             │
│  Inputs:                                                            │
│    - Date range (default: last 7 days)                              │
│    - Profit operations CSV upload (orders.csv style)                │
│    - (No boletas, no candle upload — candles loaded separately)     │
│                                                                     │
│  Dry-run engine runs 4 passes per pending trade:                    │
│    1. Operations reconciler                                         │
│         from orders.csv → entry/exit times, qty, prices, P&L,       │
│         MFE/MAE/drawdown                                            │
│         SOURCE OF TRUTH for these fields                            │
│         confidence: high (whenever CSV match found)                 │
│    2. Candle math                                                   │
│         from candles → holding period in bricks, brick-relative     │
│         MFE/MAE, day-classification (NR4/NR7),                      │
│         opening-range position                                      │
│         confidence: high                                            │
│    3. Hawks indicator readout                                       │
│         at entry brick → 15m gate, 60m gate, MACD,                  │
│         VWAP, AJUSTE; each tagged favorable/contrary;               │
│         quality tier (AAA/AA/A)                                     │
│         confidence: high                                            │
│    4. Deterministic SL/target                                       │
│         from entry brick + side + brickSize per OCO rule            │
│         confidence: high                                            │
│                                                                     │
│  Output: dryRunResult blob per trade (not yet committed)            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       REVIEW (stepped)                              │
│  Route: /journal/enrich/review                                      │
│  Trader steps through trades, day-grouped headers.                  │
│  Per-trade card shows every enriched field with source +            │
│  confidence + inline edit + accept/skip.                            │
│  Prev/next keyboard shortcuts.                                      │
│  Conflict banners when orders.csv numbers ≠ Axion's derivation.     │
│  Tier classification (Hawks state-machine pass) is BLANK            │
│  until engine reproduction > 70% — trader fills manually.           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (on save)
┌─────────────────────────────────────────────────────────────────────┐
│                          COMMIT                                     │
│  Update trades row with enriched fields.                            │
│  Set enrichmentStatus='enriched', enrichedAt=now(),                 │
│      enrichmentVersion++                                            │
│  Append snapshot row to trade_enrichment_snapshots                  │
│  Dashboards reload with the enriched picture                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Open questions to resolve at build time

These weren't locked in the brainstorm — flag them at build kickoff:

1. **Enrichment-snapshots table schema**. Probably `(trade_id, version, dryRunOutput jsonb, enrichedAt, acceptedFields text[])`. Keep simple; the audit value is in being able to re-render any past dry-run, not in indexing inside the JSON.
2. **Conflict resolution UX for orders.csv vs hand-entered execution facts**. The daily form captures entry/exit/qty/price by hand. Then orders.csv enrichment shows the broker's truth. When they disagree (slippage, typo, contract rollover confusion), what's the default? Recommendation: **always overwrite with orders.csv values** (since it's source-of-truth by decision #4), but log the diff for the trader to review one-time on the review screen.
3. **Partial enrichment state**. If candles for one day in the date range haven't been loaded, do we still enrich the operations / SL / target for that day and mark indicator-readout as `pending`? Recommendation: **yes** — enrichment is multi-pass and each pass tracks its own status. A trade can be `partial` (operations + SL enriched, indicator readout pending) and still be useful in dashboards.
4. **Idempotency of orders.csv upload**. If trader uploads the same `orders.csv` twice, second pass produces zero new trades and zero updates (since values match). Key on `(account, date, Número Operação)`. Already correct, but call it out.
5. **profitONE accounts**. profitONE doesn't emit boletas, but it does emit operations CSV. So those accounts are fully supported by this design (orders.csv reconciler works, candles work, indicator readout works, SL/target works — nothing in this design requires boletas).
6. **Daily-form playbook tag** — UI affordance. The existing trade-form has a tier/playbook selector; just confirm it's optional in the Zod schema (per decision #2) and not required. If currently required, change the schema.
7. **Where the "Enrich" button lives in the app**. Probably a top-level item under `/journal`, plus a per-trade "Re-enrich" action in the trade detail view. Decision: `/journal/enrich` is the canonical landing surface; trade detail gets a small re-enrich link only.
8. **Account scoping**. Multi-account users (Ygor has multiple prop firms + personal) — does the orders.csv upload come tagged with an account, or do we infer it from the `Conta:` header in the CSV? Recommendation: parse the `Conta:` header in the CSV's preamble and route to the right Axion account. Trader can override if mis-matched.

---

## What is explicitly out of scope

- **Boletas (`test.csv`) parsing.** Dropped. SL is deterministic, BE doesn't exist (trader never moves stop), profitONE accounts don't export boletas.
- **Profit DLL live-capture bridge.** Costs R$4k/month; revisit when revenue justifies.
- **Audio annotation during session.** Too weak — trader doesn't always have full context to verbalize.
- **Real-time enrichment during the trading session.** Enrichment is a deliberate offline activity, not a live feed.
- **Auto-tier classification via Hawks state machine.** Deferred until Hawks reproduction > 70%. Trader hand-tags tier until then; design lets state-machine pass slot in later without restructuring.
- **Multi-trader / multi-tenant features.** Single-trader scope. Generalize later only if abstractions hold.
- **"Quick-add" simplified form variant.** Daily form = full form = Zod-mandatory fields only. One form, one schema.

---

## Effort estimate

Rough, assuming Hawks engine is at 70%+ reproduction when this lands:

- **Daily-form path**: 0 days. Already exists.
- **Orders CSV parser** (Latin-1 encoding, ; separator, Brazilian number format, 4-line header, idempotent on `Número Operação`): 0.5 day.
- **Enrichment engine** — 4 passes wired up: 1.5 days.
- **Review UI** — stepped, day-grouped, diff view, accept/reject per field, keyboard nav: 1.5 days.
- **Snapshots table + Drizzle migration**: 0.5 day. (Schema change → requires explicit user approval per CLAUDE.md protected paths.)
- **Tests** — orders.csv parser unit tests with fixture, enrichment engine integration tests against a known trade-day fixture, review UI e2e: 1 day.

**Total: ~5 days (M effort).** Sequencing-blocked behind Hawks engine improvement, so realistic shipping window is post-engine-v1.

---

## Success criteria

- Trader's average time-to-journal-a-trading-day drops from current (hand-typing everything, ~15-20 min/day) to: ~2 min/day (daily entry) + ~10 min/week (enrichment review) = **~25 min/week** vs ~100 min/week today.
- All trades carry full methodology context (SL, target, MFE, MAE, indicator quality tier) without manual typing.
- `orders.csv` numbers and Axion's stored numbers match within tolerance for ≥95% of trades after enrichment.
- Trader does the weekly enrichment ritual at least 3 weeks in a row without missing one. (If this fails, design needs revisiting — but per decision #8, the design assumes ritual discipline.)
- Hawks engine reproduction improvement, when shipped, can re-enrich historic trades and the diff view shows expected changes (tier reclassifications, etc.) without data corruption.

---

## Cross-references

- [`docs/backlog.md`](../backlog.md) — entry "Two-phase journaling: thin daily entry + periodic enrichment" references this doc.
- [`docs/ideas.md`](../ideas.md) — "Broker / Profit Pro integration — pull executed orders instead of hand-input" (parent idea, this plan is its V2).
- [`docs/backlog.md`](../backlog.md) — "Hawks autonomous engine: reproduction 51% → improve via quality gates" (P1, blocks this plan).
- [`docs/backlog.md`](../backlog.md) — "Hawks engine: quality multiplier tier-tagging (AAA/AA/A)" (P2, absorbed into this plan's enrichment pass #3).
- [`src/lib/validations/trade.ts`](../../src/lib/validations/trade.ts) — Zod schema, source of truth for daily-form mandatory set.
- [`src/components/journal/trade-form.tsx`](../../src/components/journal/trade-form.tsx) — form component used by both daily and enrichment-review flows.
- [`src/lib/backtest/modules/entry/user-catalog.ts`](../../src/lib/backtest/modules/entry/user-catalog.ts) — OCO/Hawks SL/target rule reference, the formula enrichment uses.

---

## Decision log (so a future agent knows what's debate vs locked)

| #   | Decision                                                                                     | Locked              |
| --- | -------------------------------------------------------------------------------------------- | ------------------- |
| 1   | Daily mandatory set = Zod schema mandatory set, no new minimum                               | ✅                  |
| 2   | Playbook field optional at entry-time, editable at enrichment-time, can be empty             | ✅                  |
| 3   | SL deterministic, one global formula per OCO rule, no per-playbook branching                 | ✅                  |
| 4   | `orders.csv` is source of truth for execution numbers; Axion derivations are sanity checks   | ✅                  |
| 5   | Hawks "engine" in enrichment = indicator readout only (not state-machine classification)     | ✅                  |
| 6   | Wave-detection / tier auto-classification deferred until Hawks reproduction > 70%            | ✅                  |
| 7   | Review UX = stepped, trade-by-trade, day-grouped headers, prev/next keyboard                 | ✅                  |
| 8   | Enrichment is re-runnable; snapshots kept for diffing across engine versions                 | ✅                  |
| 9   | Boletas (`test.csv`) dropped entirely                                                        | ✅                  |
| 10  | DLL bridge / audio capture / real-time enrichment — out of scope                             | ✅                  |
| 11  | One trade form (no fork) shared between daily and enrichment-review flows                    | ✅                  |
| 12  | Sequencing: this plan blocks behind Hawks engine improvement                                 | ✅                  |
| 13  | Conflict resolution default when orders.csv ≠ Axion derivation: orders.csv wins, diff logged | 🟡 confirm at build |
| 14  | Enrichment-snapshots table shape (`trade_enrichment_snapshots`)                              | 🟡 confirm at build |
| 15  | Where the Enrich button lives in nav (`/journal/enrich` proposed)                            | 🟡 confirm at build |
| 16  | Account scoping from `Conta:` header in orders.csv                                           | 🟡 confirm at build |

✅ = locked in this brainstorm. 🟡 = call out at build kickoff.

---

# Appendix A — Phase 1: Database Schema (locked 2026-06-12)

## Status of existing `trades` table

The `trades` table already carries most of what enrichment needs. Existing columns reused as-is by the four enrichment passes:

| Existing column                                                                                 | Written by which enrichment pass                                      |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `stopLoss`, `takeProfit`                                                                        | Deterministic SL/Target pass                                          |
| `mfe`, `mae`, `mfeR`, `maeR`                                                                    | Candle math pass (Axion's derivation)                                 |
| `setupRank`                                                                                     | Indicator readout pass (overwrites; see locked decision A.4)          |
| `pnl`, `pointsPnl`, `realizedRMultiple`, `outcome`, `rOutcome`                                  | Operations CSV pass (orders.csv source of truth)                      |
| `contractsExecuted`, `totalEntryQuantity`, `totalExitQuantity`, `avgEntryPrice`, `avgExitPrice` | Operations CSV pass                                                   |
| `entryDate`, `exitDate`, `entryPrice`, `exitPrice`, `positionSize`, `asset`, `direction`        | Daily form (written at quick-add time; reconciled against orders.csv) |
| `strategyId`, `strategyVersionId`                                                               | Playbook reference (set by trader at entry-time or enrichment-time)   |
| `source` (varchar, default `'manual'`)                                                          | Extended with new values; see below                                   |

## Zod-mandatory daily-form set (locked, confirmed against `src/lib/validations/trade.ts`)

The daily form's minimum is exactly **5 fields**:

1. `asset` — string, ≤20 chars, uppercased on save
2. `direction` — enum `long | short`
3. `entryDate` — BRT-coerced timestamp
4. `entryPrice` — positive number
5. `positionSize` — positive number

Everything else in the form (exit data, SL, target, P&L, MFE/MAE, tags, narrative, strategy, etc.) is Zod-optional. This is the ~30-second-per-trade daily flow.

## New schema additions (one Drizzle migration, atomic)

### A.1 New enum types

```ts
export const enrichmentStatusEnum = pgEnum("enrichment_status", [
	"pending", // never enriched
	"partial", // some passes ran, others skipped (e.g. candles not loaded)
	"enriched", // all applicable passes complete and reviewer accepted
])

export const enrichmentPassStatusEnum = pgEnum("enrichment_pass_status", [
	"skipped", // pass didn't run (missing prerequisite)
	"succeeded", // pass ran, reviewer accepted output
	"failed", // pass threw or errored
	"rejected", // pass ran but reviewer rejected output
])
```

### A.2 New columns on `trades`

```ts
// Enrichment rollup state
enrichmentStatus: enrichmentStatusEnum("enrichment_status")
  .default("pending")
  .notNull(),
enrichmentVersion: integer("enrichment_version").default(0).notNull(),
enrichedAt: timestamp("enriched_at", { withTimezone: true }),

// Per-pass status (locked decision A.2 / Grill 2: Option B — granular)
enrichmentOpsStatus: enrichmentPassStatusEnum("enrichment_ops_status"),
enrichmentCandleStatus: enrichmentPassStatusEnum("enrichment_candle_status"),
enrichmentIndicatorStatus: enrichmentPassStatusEnum("enrichment_indicator_status"),
enrichmentSlTargetStatus: enrichmentPassStatusEnum("enrichment_sl_target_status"),

// Indicator readout (locked decision A.1 / Grill 1: JSON blob)
indicatorReadout: jsonb("indicator_readout"),

// Profit Pro reconciliation values stored ALONGSIDE Axion's derivation
// (locked decision A.5 / Grill 5: Option A — store both, dashboards default to Profit)
profitOperationNumber: integer("profit_operation_number"),
profitDrawdown: decimal("profit_drawdown", { precision: 18, scale: 4 }),
profitGanhoMax: decimal("profit_ganho_max", { precision: 18, scale: 4 }),
profitPerdaMax: decimal("profit_perda_max", { precision: 18, scale: 4 }),
```

### A.3 New table — `trade_enrichment_snapshots`

```ts
export const tradeEnrichmentSnapshots = pgTable(
	"trade_enrichment_snapshots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tradeId: uuid("trade_id")
			.notNull()
			.references(() => trades.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		dryRunOutput: jsonb("dry_run_output").notNull(),
		acceptedFields: text("accepted_fields").array(),
		rejectedFields: text("rejected_fields").array(),
		enrichedAt: timestamp("enriched_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		enrichmentEngineVersion: varchar("enrichment_engine_version", {
			length: 32,
		}).notNull(),
		candleDataLoadedAt: timestamp("candle_data_loaded_at", {
			withTimezone: true,
		}),
	},
	(table) => [
		index("trade_enrichment_snapshots_trade_idx").on(table.tradeId),
		index("trade_enrichment_snapshots_trade_version_idx").on(
			table.tradeId,
			table.version
		),
	]
)
```

Retention: **keep all snapshots forever** (locked decision A.3 / Grill 3: Option A). Revisit if total volume crosses 5GB.

### A.4 New indexes on `trades`

```ts
index("trades_enrichment_status_idx").on(table.enrichmentStatus),
index("trades_profit_operation_number_idx").on(
  table.accountId,
  table.entryDate,
  table.profitOperationNumber
),
```

The composite index supports idempotent orders.csv ingestion (lookup: "have we already enriched a trade matching this `(account, date, operationNumber)`?").

### A.5 `source` column convention extension

`trades.source` (varchar, existing column) gets two new accepted values:

- `'profit-pro-enriched'` — trade was entered manually, then enriched via the orders.csv flow
- `'profit-pro-imported'` — reserved for a future v2 that auto-creates trades from orders.csv. **Not used in v1.** v1 always requires manual entry first.

No schema migration needed (it's a varchar).

## Indicator readout JSON shape (locked)

Stored in `trades.indicator_readout` as a JSONB blob:

```json
{
	"engineVersion": "hawks-vX.Y",
	"computedAt": "2026-06-12T19:24:00Z",
	"indicators": {
		"gate15m": { "direction": "long", "favorable": true, "value": null },
		"gate60m": { "direction": "none", "favorable": null, "value": null },
		"macd5m": { "state": "green-expanding", "favorable": true, "value": 142.3 },
		"vwapDaily": { "side": "above", "favorable": true, "value": 170280 },
		"vwapMonthly": { "side": "below", "favorable": false, "value": 168900 },
		"vwapSession": { "side": "above", "favorable": true, "value": 170200 },
		"ajuste": { "position": "above", "favorable": false, "value": 170500 }
	},
	"favorableCount": 4,
	"totalCount": 7,
	"qualityScore": "AAA"
}
```

`qualityScore` is the aggregate (AAA / AA / A) — this is also written to the existing `trades.setupRank` column (Grill 4: Option A — overwrite). When trader hand-entered a `setupRank` before enrichment, the review screen shows a diff and asks for confirmation before overwriting.

Schema is intentionally open-shape: when Hawks v0.7+ adds new indicators (divergence detection, multi-TF MACD, opening-range position), they slot into `indicators.{name}` without a migration. Old trades stay readable.

## Migration plan

**One migration, atomic, generated via `pnpm db:generate`** (NOTE: `src/db/schema.ts` is a CLAUDE.md-protected path — build agent must surface the schema diff and get explicit user approval before running `pnpm db:generate`).

Migration order inside the SQL:

1. `CREATE TYPE enrichment_status AS ENUM (...)`
2. `CREATE TYPE enrichment_pass_status AS ENUM (...)`
3. `ALTER TABLE trades ADD COLUMN ...` × all new columns (with defaults so existing rows backfill silently)
4. `CREATE TABLE trade_enrichment_snapshots (...)`
5. `CREATE INDEX trades_enrichment_status_idx ...`
6. `CREATE INDEX trades_profit_operation_number_idx ...`
7. `CREATE INDEX trade_enrichment_snapshots_trade_idx ...`
8. `CREATE INDEX trade_enrichment_snapshots_trade_version_idx ...`

Backfill behavior: all pre-existing `trades` rows get `enrichmentStatus = 'pending'` automatically (column default). Per-pass status columns stay `NULL`. No values are mutated. Trader can choose to bulk-mark legacy trades as `'enriched'` from a settings action if they want a clean dashboard (out of scope for v1 — they just live alongside as "pending forever").

## Locked Phase 1 decisions

| #   | Decision                        | Choice                                                |
| --- | ------------------------------- | ----------------------------------------------------- |
| A.1 | Indicator readout storage       | JSON blob (`jsonb`)                                   |
| A.2 | Enrichment status granularity   | Rollup status + 4 per-pass status columns             |
| A.3 | Snapshot retention              | Keep all forever                                      |
| A.4 | Indicator-derived quality score | Overwrite existing `setupRank` (diff shown in review) |
| A.5 | Profit reconciliation values    | Store alongside Axion derivation (both kept)          |

> **AMENDMENT after Phase 2 brainstorm (2026-06-12)**: `profitDrawdown`, `profitGanhoMax`, `profitPerdaMax` are **moved from real columns into the `profit_metadata` JSONB blob** (see Appendix B / Grill B.11 — Option C). They remain stored for sanity comparison, but Axion's candle-derived values are the system of record. The only **real columns** added to `trades` by this plan are:
>
> - `enrichment_status`, `enrichment_version`, `enriched_at`
> - `enrichment_ops_status`, `enrichment_candle_status`, `enrichment_indicator_status`, `enrichment_sl_target_status`
> - `indicator_readout` (jsonb)
> - `profit_operation_number` (integer — kept as a real column because it backs the idempotency index)
> - `profit_metadata` (jsonb)
>
> Composite index becomes `(account_id, entry_date, profit_operation_number)` instead of the original `(account_id, entry_date, profit_drawdown...)` shape (which was never actually proposed).

---

# Appendix B — Phase 2: Profit Pro CSV Parser (locked 2026-06-12)

## TL;DR

The parser already exists. Real work is **additive only** — extend the existing `parseProfitChartContent` in `src/lib/csv-parser.ts` to surface columns it currently drops, and bridge a richer output type alongside the existing `CsvTradeInput[]` shape. **2–3 hours of work**, not the half-day originally scoped.

## What's already in production (no work needed)

`src/lib/csv-parser.ts` ships `parseProfitChartContent` which already handles:

- ✅ Profit Pro Portuguese headers with Latin-1 mojibake fallbacks (`preco`, `preo`, `pre_o`, etc.)
- ✅ Brazilian number parsing (via `src/lib/csv-parsers/parse-utils.parseBrazilianNumber`)
- ✅ Brazilian date parsing (via the same module's `parseBrazilianDateTime`)
- ✅ Header-row auto-detection (skips the `Conta: / Titular: / Data:` preamble — `findHeaderRow`)
- ✅ Side derivation (`C = long, V = short` — `parseProfitChartSide`)
- ✅ Price-by-direction assignment (buy=entry if long, sell=entry if short)
- ✅ MFE/MAE extraction from `Ganho Max.` / `Perda Max.`
- ✅ `[R]` replay-mode prefix stripping
- ✅ B3 asset normalization (`WINM26` → `WIN` via `normalizeB3Asset`)
- ✅ Per-row error/warning collection
- ✅ Required-field validation for ProfitChart shape

The existing daily-entry CSV-import flow (`src/app/actions/csv-import.ts`) consumes this and creates `trades` rows. **This flow is not broken.** Phase 2 is strictly additive on top of it.

## What's missing (the gap)

The current parser drops columns that carry value for **both** the daily CSV-import flow (richer trade rows on import) and the enrichment flow (reconciliation against existing hand-entered trades):

| Profit column                              | Decision                                                    | Destination                                               |
| ------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------- |
| `Número Operação`                          | **Keep** as idempotency anchor                              | `trades.profit_operation_number` (real column)            |
| `Drawdown` (BRL)                           | **Keep as comparable** (Grill 11 → C)                       | `trades.profit_metadata.profitDrawdown`                   |
| `Ganho Max.` (BRL)                         | **Keep as comparable** (Grill 11 → C)                       | `trades.profit_metadata.profitGanhoMax`                   |
| `Perda Max.` (BRL)                         | **Keep as comparable** (Grill 11 → C)                       | `trades.profit_metadata.profitPerdaMax`                   |
| `MEP` (points)                             | **Keep as comparable**                                      | `trades.profit_metadata.profitMep`                        |
| `MEN` (points)                             | **Keep as comparable**                                      | `trades.profit_metadata.profitMen`                        |
| `Preço de Mercado` (close-time mid)        | **Keep** (slippage analytics)                               | `trades.profit_metadata.marketPriceAtClose`               |
| `Médio: Sim/Não`                           | **Keep** as metadata flag                                   | `trades.profit_metadata.wasAveraged`                      |
| `Res. Operação` (net P&L BRL)              | **Discard from CSV write** — Axion does the math (Grill 11) | (computed in Axion from prices × qty × pointValue − fees) |
| `Res. Intervalo Bruto` (gross BRL)         | **Discard** — derivable from same formula minus fees        | —                                                         |
| `Res. Intervalo (%)` / `Res. Operação (%)` | **Discard** — derivable from pnl/capital                    | —                                                         |
| `TET` (time-between-trades)                | **Discard** — trivially computable in Axion                 | —                                                         |
| `Ag. Compra` / `Ag. Venda` (broker codes)  | **Discard** — no value                                      | —                                                         |
| `Total` (running daily P&L)                | **Discard** — derivable                                     | —                                                         |
| `Conta:` (preamble account number)         | **Discard** — personal Profit data, not Axion's concern     | —                                                         |
| `Titular:` (preamble holder name)          | **Discard** — personal data                                 | —                                                         |
| `Data:` (preamble date header)             | **Discard** — every row carries full timestamp; redundant   | —                                                         |

## Locked Phase 2 decisions

| #    | Decision                                                | Choice                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B.1  | Parser approach                                         | **Extend existing** `parseProfitChartContent`; one parser, richer output (Option A from gap analysis)                                                                                                                                                                          |
| B.2  | Idempotency key                                         | `(accountId, entryDate.dateOnly, profitOperationNumber)`, preferred when `profitOperationNumber` is present. Fall back to existing `deduplicationHash` for legacy / non-Profit imports.                                                                                        |
| B.3  | `Médio: Sim` handling                                   | Store `wasAveraged: true` in `profit_metadata`. Treat as **one row = one trade**. User can later promote into a scaled position manually.                                                                                                                                      |
| B.4  | Encoding                                                | Use the existing parser's mojibake-fallback header mappings — no new work, no `iconv-lite` dependency                                                                                                                                                                          |
| B.5  | Number / date parsing                                   | Reuse `src/lib/csv-parsers/parse-utils` — no new utilities                                                                                                                                                                                                                     |
| B.6  | Account from `Conta:` preamble                          | **Discard.** Account routing comes from the importing user's selected Axion trading account, not from the CSV.                                                                                                                                                                 |
| B.7  | Dropped Profit columns benefit BOTH flows               | The richer output ships through the existing daily-entry CSV-import flow too — trades created from CSV today gain `profit_operation_number`, `profit_metadata.marketPriceAtClose`, etc. immediately, without waiting for enrichment.                                           |
| B.8  | Schema addition                                         | One JSONB column `trades.profit_metadata` (replaces the originally-proposed `profitDrawdown`/`profitGanhoMax`/`profitPerdaMax` real columns). Plus `profit_operation_number` integer (with composite index).                                                                   |
| B.9  | Multi-day CSV support                                   | **Yes.** The existing parser already handles per-row dates implicitly; build-time chore is to confirm a multi-day fixture exists in the test suite, add one if not.                                                                                                            |
| B.10 | Open positions (`Fechamento` blank)                     | **Reject row** at importer level (`MALFORMED_ROW` warning). Trader closes the position before exporting. Closed-only policy.                                                                                                                                                   |
| B.11 | Intra-trade extremes (Drawdown / MFE / MAE / MEP / MEN) | **Option C** — Axion's candle-derived values are the system of record (written to `mfe`, `mae`, `mfeR`, `maeR`). Profit's tick-derived values are kept as comparables in `profit_metadata` for the slippage / precision debug case. **Dashboards default to Axion's numbers.** |
| B.12 | Net P&L / Gross P&L                                     | **Discard from CSV** — Axion computes from `(exitPrice - entryPrice) × side × qty × pointValue − fees`. Profit gives us the fills; we do the math.                                                                                                                             |
| B.13 | Legacy CSV-import behavior for `mfe`/`mae`              | **Pragmatic** — current parser keeps populating `mfe`/`mae` from CSV at import-time (better-than-null). Enrichment pass overwrites when run with candles. No regression for existing users.                                                                                    |
| B.14 | Cumulative `Total` integrity check                      | **Skip in v1**, defer indefinitely. Add only if CSV tampering is ever suspected.                                                                                                                                                                                               |

## Public API extension contract

```ts
// extension to src/lib/csv-parser.ts

export interface ProfitChartOperation extends CsvTradeInput {
	// Idempotency anchor (real column on trades)
	operationNumber: number

	// JSONB metadata blob (written to trades.profit_metadata)
	profitMetadata: {
		marketPriceAtClose: number | null
		wasAveraged: boolean
		profitDrawdown: number | null
		profitGanhoMax: number | null
		profitPerdaMax: number | null
		profitMep: number | null // MFE in points (Profit tick-derived)
		profitMen: number | null // MAE in points (Profit tick-derived)
	}
}

// Existing CsvParseResult extended (additive; no breaking change)
export interface CsvParseResult {
	success: boolean
	trades: CsvTradeInput[] // unchanged
	profitOperations?: ProfitChartOperation[] // NEW — present when isProfitChart === true
	errors: Array<{ row: number; field: string; message: string }>
	warnings: Array<{ row: number; message: string }>
}
```

## Daily-entry CSV-import flow change

`src/app/actions/csv-import.ts` already iterates `result.trades` to create `trades` rows. The change: when `result.profitOperations` is present, the importer uses **that** richer payload instead, and writes the additional columns (`profitOperationNumber`, `profitMetadata`). Existing field writes stay unchanged. **Pure upgrade — no regression path.**

## Idempotency upgrade (real value, day one)

Current behavior uses `deduplicationHash` = SHA-256 of `accountId|asset|direction|entryDate|entryPrice|exitPrice|positionSize` — collides when two genuinely-different trades have identical fills, and breaks when a trade is edited then re-imported.

New behavior: when `profitOperationNumber` is present on an import row, the importer looks up `(accountId, entryDate.dateOnly, profitOperationNumber)` first. Exact match = no duplicate. Profit's own ID is authoritative per-account-per-day. Falls back to `deduplicationHash` only for legacy / non-Profit imports.

## Schema delta (consolidates Phase 1 + Phase 2)

**Final list of new columns on `trades`** (replaces the Phase 1 list with the JSONB rollup):

```ts
// Enrichment rollup
enrichmentStatus: enrichmentStatusEnum("enrichment_status").default("pending").notNull(),
enrichmentVersion: integer("enrichment_version").default(0).notNull(),
enrichedAt: timestamp("enriched_at", { withTimezone: true }),

// Per-pass status
enrichmentOpsStatus: enrichmentPassStatusEnum("enrichment_ops_status"),
enrichmentCandleStatus: enrichmentPassStatusEnum("enrichment_candle_status"),
enrichmentIndicatorStatus: enrichmentPassStatusEnum("enrichment_indicator_status"),
enrichmentSlTargetStatus: enrichmentPassStatusEnum("enrichment_sl_target_status"),

// Hawks indicator readout JSON
indicatorReadout: jsonb("indicator_readout"),

// Profit reconciliation
profitOperationNumber: integer("profit_operation_number"),
profitMetadata: jsonb("profit_metadata"),
```

**Indexes** (unchanged from Phase 1):

```ts
index("trades_enrichment_status_idx").on(table.enrichmentStatus),
index("trades_profit_operation_number_idx").on(
  table.accountId,
  table.entryDate,
  table.profitOperationNumber
),
```

**Removed from Phase 1 spec** (now JSONB fields, not columns):

- ~~`profitDrawdown` decimal~~ → `profit_metadata.profitDrawdown`
- ~~`profitGanhoMax` decimal~~ → `profit_metadata.profitGanhoMax`
- ~~`profitPerdaMax` decimal~~ → `profit_metadata.profitPerdaMax`

`trade_enrichment_snapshots` table and the two enrichment enums are unchanged from Phase 1.

---

# Appendix C — Phase 3: Enrichment Pass Architecture (locked 2026-06-12)

## Module layout

```
src/lib/enrichment/
├── types.ts                        ← EnrichmentPass, EnrichmentContext, EnrichmentDelta, DryRunResult
├── run-dry-run.ts                  ← orchestrator (public entry point, pure function)
├── delta-merge.ts                  ← composes EnrichmentDelta[] into one DryRunResult
├── passes/
│   ├── operations.ts               ← Pass 1: orders.csv reconciliation
│   ├── candle-math.ts              ← Pass 2: brick replay → MFE/MAE/holding period
│   ├── indicator-readout.ts        ← Pass 3: Hawks engine indicator snapshot at entry brick
│   └── deterministic-sl-target.ts  ← Pass 4: OCO formula SL/target
└── __tests__/                      ← unit tests per pass + orchestrator integration

src/app/actions/enrichment.ts       ← server-action thin layer: auth, DB I/O, snapshot writes
```

**Pure-functions-in-lib, side-effects-in-actions.** Every `passes/*.ts` is a pure `(trade, ctx) → delta`. No DB calls, no fetches. Trivially unit-testable.

## Shared types

```ts
// src/lib/enrichment/types.ts

export type EnrichmentSource =
	| "ops-csv"
	| "candle-math"
	| "indicator-readout"
	| "deterministic-sl"

export type EnrichmentField<T = unknown> = {
	value: T
	source: EnrichmentSource
	confidence: "high" | "medium" | "low"
	conflictsWithCurrent: boolean
	derivation?: string
}

export type EnrichmentDelta = {
	trade: { id: string }
	fields: Partial<Record<string, EnrichmentField>>
	passStatus: "succeeded" | "skipped" | "failed"
	skipReason?: string
	errorMessage?: string
}

export type EnrichmentContext = {
	candles: CandleStream | null
	profitOperation: ProfitChartOperation | null
	hawksEngine: HawksEngineSnapshot | null
	brickSize5m: number | null // looked up from hawks_renko_sizes by ISO week
	pointValue: number
}

export type EnrichmentPass = (
	trade: Trade,
	ctx: EnrichmentContext
) => EnrichmentDelta

export type DryRunResult = {
	trade: Trade
	passes: {
		operations: EnrichmentDelta
		candleMath: EnrichmentDelta
		indicatorReadout: EnrichmentDelta
		deterministicSlTarget: EnrichmentDelta
	}
	mergedFields: Record<
		string,
		EnrichmentField & { winningPass: EnrichmentSource }
	>
	computedStatus: "ready-to-commit" | "partial" | "no-changes"
}
```

## Public API

```ts
// src/lib/enrichment/run-dry-run.ts

export type DryRunInput = {
	tradeId: string
	parsedOperations?: ProfitChartOperation[] // from CSV upload
	candleStream?: CandleStream // pre-loaded for the day
	hawksEngineVersion: string // pinned for reproducibility
}

export async function runDryRun(input: DryRunInput): Promise<DryRunResult>

export async function runDryRunBatch(
	tradeIds: string[],
	context: SharedBatchContext
): Promise<DryRunResult[]>
```

```ts
// src/app/actions/enrichment.ts (server-action layer)

export async function commitEnrichment(
	dryRunResult: DryRunResult,
	acceptedFields: string[],
	rejectedFields: string[]
): Promise<{ snapshotId: string; tradeId: string }>
```

## Locked Phase 3 decisions

| #    | Decision                                | Choice                                                                                                                                                                                                                                                                                                     |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C.13 | Pass execution model                    | **Sequential.** Easier to reason about; perf gain of parallel is marginal at typical volumes (~10s vs ~2.5s for a 25-trade batch). Swap to parallel later if needed.                                                                                                                                       |
| C.14 | Indicator readout ↔ Hawks engine bridge | **Extract a shared `getHawksIndicatorsAt(candles, timestamp)` function.** Both the backtest engine and the enrichment pass call it. Small engine refactor (~1h) is an accepted blocker. Prevents drift between engine and enrichment readout.                                                              |
| C.15 | Snapshot persistence timing             | **On commit only.** Snapshots are an audit of _decisions_, not of every keystroke. Dry-run output stays in-memory until user clicks "save trade." Cleaner table, same audit value (dry-runs are reproducible from pinned inputs).                                                                          |
| C.16 | Conflict resolution UX                  | **Enrichment wins by default, banner the conflict.** UI shows both values: "you typed 170,900; engine says 170,940 — click to keep your value." One click reverts to user's value.                                                                                                                         |
| C.17 | Brick-size lookup                       | **From `hawks_renko_sizes` table** (ISO-week-keyed). Pass 4 (deterministic SL/target) computes the Monday of the trade's entry-date ISO week, looks up `(effective_date = Monday).size_5m`, applies `SL = entry ± 2 × size5m × pointValue`. If lookup misses → pass skips with `noBrickSizeConfig` reason. |

## Pass independence

The four passes have **zero output-dependencies on each other**:

- `operations` reads `ctx.profitOperation`
- `candle-math` reads `ctx.candles`
- `indicator-readout` reads `ctx.hawksEngine` (which itself was built from `ctx.candles`)
- `deterministic-sl-target` reads `trade.entryPrice` + `ctx.brickSize5m`

Sequential execution is for log clarity. If a future enrichment requires chaining (e.g. MFE-in-R needs SL computed first), that's a v2 redesign, not a v1 corner.

## Skip / fail / reject semantics

Three pass-time outcomes (written to `enrichment_*_status` columns):

- **`succeeded`** — pass ran, produced fields, ready for review
- **`skipped`** — prerequisite missing (no candles loaded, no CSV uploaded, no brick size for the week) — not an error
- **`failed`** — pass threw or returned invalid output (a bug) — surface as error banner; trade can still save with other passes' values

One commit-time outcome:

- **`rejected`** — reviewer ran the pass but said "no" — recorded in snapshot's `rejectedFields`, not in the dry-run output

## Dependency on prerequisite engine refactor

Phase 3 has one outside dependency:

- **Extract `getHawksIndicatorsAt(candles, timestamp): HawksIndicatorSnapshot`** from the existing Hawks engine code (`src/lib/backtest/modules/entry/hawks-triple-screen.ts` and friends). The function reads indicator state at a single brick — no state machine, no entry detection. Both the engine (refactored to call it during replay) and the enrichment pass (calling it once per trade) share it.
- **Cost**: ~1 hour of refactoring. Must land before this plan ships, alongside the broader Hawks engine improvement work.
- **Why locked here**: the alternative (build parallel implementation in enrichment) guarantees drift the first time engine indicator logic changes. Pay the refactor cost once.

---

# Appendix D — Phase 4: Review UI Flow (locked 2026-06-12)

## Why this design

The trader's main concern: **don't lose 20/25 trades of review work to a refresh or crash.** Three failure modes need separate protection:

| Failure mode                                                          | Protection                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Browser refresh / tab close mid-review                                | Per-trade commit (saves go to DB immediately) + server-side dry-run blob (review-state survives refresh) |
| Trade modified by another agent during review                         | Field-scoped merge — commit only writes accepted fields, never touches untouched ones                    |
| Trade's current value drifted between dry-run and "Save & next" click | Per-field staleness detection at commit — drifted fields banner a conflict; trader decides               |

## Routes

```
/journal/enrich
    ↳ Landing: pending count, last run, date-range picker, CSV upload, candle status,
      "Run dry-run enrichment" button
    ↳ If a draft run exists for the user (status='draft' rows in the snapshot table):
      banner "You have N draft trades from <date>. [Resume] [Abandon]"

/journal/enrich/review/[runId]
    ↳ Stepped trade-by-trade review. Sidebar with day-grouped trade list + status
      icons. Main pane shows current trade with 4 pass cards (Operations, Candle math,
      Indicator readout, Deterministic SL/target). Per-field accept/conflict/edit.
    ↳ "Save & next" commits THIS trade immediately, advances to next.
    ↳ Last trade saved → success screen.
```

## Locked Phase 4 decisions

| #     | Decision                           | Choice                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D.18a | Commit timing                      | **Per-trade**, on "Save & next" click. Each save = one `trades` UPDATE + one snapshot status flip (`draft` → `committed`). Trades 1–20 are safe even if the app crashes on trade 21.                                                                                                                                                                              |
| D.18b | Dry-run blob storage during review | **Server-side, in `trade_enrichment_snapshots` with `status` enum (`draft \| committed \| abandoned`)**. One row per trade per dry-run. Drafts auto-cleaned (status flipped to `abandoned`, payload nulled) after 72 hours of inactivity via a cron-style task. Refresh-safe, multi-device-safe, no separate table needed.                                        |
| D.19  | Stale-state handling at commit     | **Field-scoped merge + per-field staleness check.** Commit only writes the trade's `acceptedFields[]` from the snapshot. For each accepted field, compare current DB value vs the snapshot's recorded "current" baseline; if drifted, surface a conflict banner at commit-time and pause for trader decision (keep edit / use enrichment / use current DB value). |

## Schema amendment for `trade_enrichment_snapshots`

Adds `status`, `runId`, `expiresAt` columns + a new enum:

```ts
export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "draft",       // dry-run computed, not yet reviewed; survives refresh
  "committed",   // reviewer accepted; audit record
  "abandoned",   // expired or explicitly discarded; payload nulled
]);

// Added to the table definition in Appendix A:
status: snapshotStatusEnum("status").default("draft").notNull(),
runId: uuid("run_id").notNull(),
expiresAt: timestamp("expires_at", { withTimezone: true }),
```

New indexes:

```ts
index("trade_enrichment_snapshots_run_idx").on(table.runId, table.status),
index("trade_enrichment_snapshots_status_expiry_idx").on(table.status, table.expiresAt),
```

## Landing screen mock

```
┌────────────────────────────────────────────────────────────────────┐
│  Enrich Journal                                                    │
├────────────────────────────────────────────────────────────────────┤
│  Pending trades to enrich:  17                                     │
│  Last enrichment run:        2026-06-05 (5 trades enriched)        │
│                                                                    │
│  Date range:     [ 2026-06-06 ] → [ 2026-06-12 ]   (last 7 days)   │
│                                                                    │
│  Profit Pro Operações CSV (optional):                              │
│  [ ⬆ Upload CSV ]  orders-2026-06-12.csv  12 operations            │
│                                                                    │
│  Candle data status:                                               │
│   • WIN (5m) — loaded through 2026-06-12  ✓                        │
│   • WIN (15m) — loaded through 2026-06-12  ✓                       │
│   • WDO (5m) — last load 2026-05-30  ⚠ stale (13 days)             │
│                                                                    │
│  Enrichment passes that will run:                                  │
│   ✓ Operations CSV reconciliation (12 trades matched)              │
│   ✓ Candle math (17 trades — candles loaded)                       │
│   ✓ Indicator readout (17 trades — Hawks engine ready)             │
│   ✓ Deterministic SL/target (17 trades — brick sizes available)    │
│                                                                    │
│           [ Run dry-run enrichment ]   [ Cancel ]                  │
└────────────────────────────────────────────────────────────────────┘
```

If `status='draft'` rows exist for the user from a previous incomplete session, a top-banner appears:

```
You have 5 trades pending review from 2026-06-11.   [ Resume ]   [ Abandon ]
```

## Review screen mock

```
┌─────────────────────────────────────────────────────────────────────┐
│  Review enrichment  ·  Trade 3 of 17                                │
│  ┌─── Sidebar ─────────┬─── Trade card ──────────────────────────┐  │
│  │                     │                                          │  │
│  │ ▼ 2026-06-08        │  WIN  ·  LONG  ·  qty 5                  │  │
│  │   ✓ 09:03 (saved)   │  09:03:23 → 09:20:02   (-71,675 BRL)     │  │
│  │   ✓ 09:20 (saved)   │  Playbook: T1 Hawks  [edit]              │  │
│  │   ► 09:22 (review)  │                                          │  │
│  │                     │  ┌─ Operations CSV (high) ──────────────┐ │  │
│  │ ▼ 2026-06-09        │  │ entryPrice:  171,140 → 171,140  ✓    │ │  │
│  │   • 10:15           │  │ exitPrice:   170,681 → 170,681  ✓    │ │  │
│  │   • 11:02           │  │ qty:         5 → 5              ✓    │ │  │
│  │                     │  └──────────────────────────────────────┘ │  │
│  │ ▼ 2026-06-10        │  ┌─ Candle math (high) ─────────────────┐ │  │
│  │   • 09:45           │  │ mfe:         (null) → 384.49 pts  ✓  │ │  │
│  │   …                 │  │ mae:         (null) → -905.51 pts ✓  │ │  │
│  │                     │  │ holdingMs:   (null) → 999,000ms   ✓  │ │  │
│  │                     │  └──────────────────────────────────────┘ │  │
│  │                     │  ┌─ Deterministic SL/target (high) ─────┐ │  │
│  │                     │  │ stopLoss:    (null) → 170,740      ✓ │ │  │
│  │                     │  │   ↳ entry 171,140 − 2×200(size5m)    │ │  │
│  │                     │  │ takeProfit:  (null) → 171,940      ✓ │ │  │
│  │                     │  │   ↳ 3R extension                     │ │  │
│  │                     │  └──────────────────────────────────────┘ │  │
│  │                     │  ┌─ Indicator readout (high) ───────────┐ │  │
│  │                     │  │ gate15m:     long          ✓ favor   │ │  │
│  │                     │  │ gate60m:     none            (n/a)   │ │  │
│  │                     │  │ macd5m:      green-expand  ✓ favor   │ │  │
│  │                     │  │ vwapD:       above         ✓ favor   │ │  │
│  │                     │  │ vwapM:       below         ✗ contra  │ │  │
│  │                     │  │ vwapS:       above         ✓ favor   │ │  │
│  │                     │  │ ajuste:      above         ✗ contra  │ │  │
│  │                     │  │ setupRank:   AAA (5/7)             ✓ │ │  │
│  │                     │  └──────────────────────────────────────┘ │  │
│  │                     │                                          │  │
│  │                     │  [ Save & next ]   [ Skip ]   [ ← Prev ] │  │
│  └─────────────────────┴──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

Per-field states:

- **Accepted** (default for high-confidence, no-conflict fields): green check
- **Conflict**: yellow banner, click to keep current value
- **Edit**: pencil icon → inline input, custom value overrides both

Per-pass card shows pass name + confidence, each field as `current → proposed`, accept toggle, derivation tooltip. Pass-level "accept all" / "reject all" buttons.

Sidebar status icons:

- `►` current
- `✓` saved (committed)
- `⊘` skipped
- `•` not yet visited

Click any trade in sidebar to jump. Draft state preserved (no data loss; current trade's pending toggles persist until commit or abandon).

## Keyboard shortcuts

| Key                 | Action                                                    |
| ------------------- | --------------------------------------------------------- |
| `j` / `↓`           | Next trade                                                |
| `k` / `↑`           | Previous trade                                            |
| `enter`             | Save current trade + advance                              |
| `s`                 | Skip current trade                                        |
| `a`                 | Accept all high-confidence fields in current trade        |
| `r`                 | Reject all changes in current trade (keep current values) |
| `e` then field name | Edit field inline (autocomplete on field names)           |
| `?`                 | Show shortcut overlay                                     |

## Bulk actions

- **Landing screen** — "Bulk accept high-confidence" opt-in: auto-commits all fields with `confidence='high'` AND no conflicts, then drops the trader into review for the remainder. **Default OFF** — short-circuits the very review the design is built around; only useful when trader trusts a particular run completely.
- **Review screen end** — "Mark remaining N trades as 'enrichment-skipped'": flips their status to `partial` so they don't reappear in next run's pending count. For trades enrichment genuinely can't help with.

## Success screen

```
✓ Enriched 14 trades   ⊘ Skipped 3 trades
   Snapshot saved (enrichmentVersion 1)
   Dashboards now reflect the enriched data.

   [ View dashboard ]   [ Back to journal ]
```

## Cleanup task

A cron-style scheduled task (`scripts/cleanup-abandoned-enrichments.ts`, or a server-action invoked from a Vercel cron) runs daily:

1. Find all `trade_enrichment_snapshots` where `status='draft' AND expiresAt < now()`.
2. Set `status='abandoned'`, null the `dryRunOutput` payload (keep the row for version tracking).
3. Optionally email the user "your draft enrichment from <date> expired."

## Command center FAB + simplified-trade modal

The daily-entry path doesn't only live at `/journal/new`. The trader's natural context for "add a trade I just took" is `/command-center` — the pre/post-session dashboard. A floating action button on that page opens a modal that creates a trade in <30 seconds without leaving the page.

### Locked decisions

| #    | Decision                              | Choice                                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D.20 | FAB scope                             | **Command-center page only.** Not global app-wide. Avoids visual noise on pages where adding a trade isn't the natural action. If trader wants it elsewhere later, that's a 30-min follow-up.                                                                                             |
| D.21 | Modal default values                  | **Smart defaults.** `entryDate = now()`. `asset` + `direction` prefill from most recent trade in the current session day (or empty if first trade of day). Trader can override any of them.                                                                                               |
| D.22 | Existing full-form trade-create route | **Keep both.** FAB modal is the fast path (mandatory fields only). The existing full-form route stays for the legacy "fill everything at create-time" workflow, for the trade-detail edit page, and for non-Hawks trades where enrichment doesn't apply. Don't burn working surface area. |
| D.23 | Post-save behavior                    | **Modal closes by default + `router.refresh()` + toast "Trade saved."** Includes a "Save and add another" secondary action that saves, refreshes the command center data in the background, clears the form, and keeps the modal open for rapid-succession entries.                       |

### Surface

- **Floating action button**: bottom-right of `/command-center`, hovers above content, respects mobile safe area, stays visible during scroll. Icon = `+` from `lucide-react`. z-index above content but below modal overlay.
- **Modal**: shows **only the 5 Zod-mandatory fields** — `asset`, `direction`, `entryDate`, `entryPrice`, `positionSize`. No other fields, not even commonly-optional ones like `exitDate`/`exitPrice`. The whole design relies on enrichment filling the rest.
- **Buttons**: `Save trade` (primary) · `Save and add another` (secondary) · `Cancel` (tertiary).
- **After save**: modal closes, `router.refresh()` invalidates the command-center server-rendered data so the new trade shows up in current-day P&L / day-count / etc., toast confirms.

### Backend reuse

Calls the **same** trade-create server action that the existing full-form route uses (`createTrade` in `src/app/actions/trades.ts` or equivalent). Same Zod schema enforcement at `src/lib/validations/trade.ts`. The modal is a different presentation surface, not a different backend path. If the Zod schema's mandatory set ever changes, this modal adapts automatically.

### Component layout

```
src/components/journal/quick-add-trade-modal.tsx        ← the modal
src/app/[locale]/(app)/command-center/command-center-content.tsx
  └─ renders <QuickAddTradeFab /> which renders the FAB + lazily-mounts the modal
```

### "Save and add another" implementation note

Sequence:

1. Submit form → call server action → await result
2. On success: call `router.refresh()` (does NOT close modal)
3. Reset form fields (preserving the smart defaults pattern — `entryDate` updates to `now()`, `asset`/`direction` re-read from the just-saved trade)
4. Focus first input
5. Toast confirms

Realistic ceiling: 5–10 rapid-succession entries. Not designed for bulk entry — that's what the CSV import path is for.

---

# Appendix E — Phase 5: Build Sequence (locked 2026-06-12)

This plan ships as one PR. No incremental rollout, no feature flags — `main` auto-deploys, so the whole feature lands together once Hawks engine improvement is complete. This appendix locks the build order that minimizes dead ends.

## Critical prerequisites (NOT part of this plan's build)

Two pieces of upstream work must land before this plan starts:

1. **Hawks engine improvement** — existing P1 backlog entry. Reproduction rate must exceed ~70%. This unblocks the indicator-readout pass quality.
2. **Extract `getHawksIndicatorsAt(candles, timestamp): HawksIndicatorSnapshot`** as a shared function — see Appendix C / C.14. Both the backtest engine and the enrichment pass call it. ~1 hour of refactoring. Should land alongside the Hawks engine improvement session.

When both are done, this plan starts. The future agent picks up `docs/plans/two-phase-journaling-with-enrichment.md`, reads the locked decisions, and walks the build order below.

## Build order

### Step 1 — Schema migration (~0.5 day)

Touch `src/db/schema.ts` (**PROTECTED PATH** per CLAUDE.md — surface schema diff for explicit user approval before running `pnpm db:generate`):

- Add enums: `enrichmentStatusEnum`, `enrichmentPassStatusEnum`, `snapshotStatusEnum`
- Add columns to `trades`:
  - Enrichment rollup: `enrichmentStatus`, `enrichmentVersion`, `enrichedAt`
  - Per-pass status: `enrichmentOpsStatus`, `enrichmentCandleStatus`, `enrichmentIndicatorStatus`, `enrichmentSlTargetStatus`
  - `indicatorReadout` (jsonb)
  - `profitOperationNumber` (integer)
  - `profitMetadata` (jsonb)
- Add table `trade_enrichment_snapshots` with `status`, `runId`, `expiresAt`
- Add indexes per Appendix A.4 + D
- Run `pnpm db:generate`, review SQL, run `pnpm db:migrate` against local DB

**Done when**: schema diff approved, migration runs clean, lint passes, type errors zero.

### Step 2 — Parser extension (~0.5 day)

Touch `src/lib/csv-parser.ts`:

- Extend `parseProfitChartContent` to also populate `result.profitOperations: ProfitChartOperation[]`
- Add `ProfitChartOperation` type to exports
- Add a multi-day fixture per B.9 if one doesn't exist
- Reject rows with blank `Fechamento` per B.10
- Update `src/app/actions/csv-import.ts` to write the new columns when `profitOperations` is present (additive to existing write path)

**Done when**: parser unit tests pass, daily-entry CSV import still works (regression check on a non-Profit format), new fields appear on trades created via CSV.

### Step 3 — Enrichment library (~2 days)

Build `src/lib/enrichment/`:

- `types.ts` first (defines the contract)
- Four pure-function passes in `passes/`, each with its own unit-test file:
  - `operations.ts` — reads `ctx.profitOperation`, writes ops-reconciled fields
  - `candle-math.ts` — reads `ctx.candles`, computes MFE/MAE/holding-period
  - `indicator-readout.ts` — calls `getHawksIndicatorsAt`, writes indicator blob + `setupRank`
  - `deterministic-sl-target.ts` — looks up `hawks_renko_sizes` by ISO week, applies formula
- `delta-merge.ts` — composes deltas
- `run-dry-run.ts` — orchestrator (sequential per C.13)
- One integration test that builds a known trade + context fixture and asserts the full `DryRunResult`

**Done when**: all unit tests pass, integration test passes against a fixture with all 4 passes succeeding AND a fixture with each pass independently skipping.

### Step 4 — Server-action layer (~0.5 day)

Build `src/app/actions/enrichment.ts`:

- `startDryRun(input)` — auth check, run orchestrator, persist draft snapshots, return `runId`
- `getDryRun(runId)` — fetch all snapshots for a runId, return hydrated `DryRunResult[]`
- `commitTrade(runId, tradeId, acceptedFields, rejectedFields)` — apply enrichment to one trade, flip snapshot to `committed`, run per-field staleness check (D.19)
- `abandonDryRun(runId)` — flip all draft snapshots to `abandoned`

**Done when**: actions have auth checks, return typed results, integration tests cover happy path + staleness conflict path + auth-denied path.

### Step 5 — Review UI (~2 days)

Build:

- `src/app/[locale]/(app)/journal/enrich/page.tsx` — landing
- `src/app/[locale]/(app)/journal/enrich/review/[runId]/page.tsx` — stepped review
- Components: `enrich-landing.tsx`, `enrich-review.tsx`, `enrich-trade-card.tsx`, `enrich-pass-card.tsx`, `enrich-field-row.tsx`, `enrich-sidebar.tsx`
- Keyboard shortcut hook (`useEnrichShortcuts`)
- i18n strings: `enrichment.*` namespace in `messages/en.json` and `messages/pt-BR.json`
- Resume banner on `/journal/enrich` when draft exists

**Done when**: full flow (upload CSV → run dry-run → walk 3 trades → success screen) works against local dev with a real Profit Pro CSV. Refresh mid-flow correctly resumes.

### Step 5b — Command-center FAB + simplified-trade modal (~0.5 day)

- Add floating action button to `src/app/[locale]/(app)/command-center/command-center-content.tsx` (renders a `<QuickAddTradeFab />`)
- New modal component `src/components/journal/quick-add-trade-modal.tsx`
  - Uses the existing trade-create server action and Zod schema (the **minimal** subset — only the 5 mandatory fields)
  - Smart defaults: `entryDate = now()`, last-used `asset` + `direction` (read from most recent trade in current session day, fallback to localStorage, fallback to empty)
  - `Save trade`, `Save and add another`, `Cancel`
  - On save: `router.refresh()` + toast + close (or stay open for "add another")
- i18n strings: `quickAdd.*` namespace

**Done when**: FAB visible on command center, clicking opens modal, saving creates trade visible in current-day stats without page reload, "Save and add another" works.

### Step 6 — Cleanup job (~0.5 day)

- `scripts/cleanup-abandoned-enrichments.ts` (or Vercel cron route)
- Flips `draft` snapshots past `expiresAt` to `abandoned`, nulls payload, keeps row for version tracking
- One unit test for the time math

**Done when**: scheduled in `vercel.json` (or wherever cron lives), runs against local DB and produces expected updates.

### Step 7 — E2E tests (~1 day)

`e2e/tests/enrichment.spec.ts`:

- Upload CSV → run dry-run → review → per-trade commit → verify trades table state
- Refresh mid-review → confirm draft resumable
- Per-field staleness conflict scenario (modify trade between dry-run and commit, confirm banner)
- Abandon a run, confirm cleanup behavior
- Command-center FAB → quick-add → verify command center refreshes

**Done when**: e2e suite passes both locally and in CI.

## Total estimate

**~7.5 days** (Steps 1–7 with 5b inserted).

Originally estimated at 5 days; bumped because (a) per-trade-commit + draft-persistence wiring is more than a batch-commit, (b) cleanup job + per-field staleness handling weren't in the original price-in, (c) the command-center FAB is a real piece of UI that needed its own step.

---

# Appendix F — Phase 6: Definition of Done / Ship Gate (locked 2026-06-12)

When this plan is shipped, **all of the following must be true**. The shipping PR's checklist mirrors this section.

## Functional acceptance

- [ ] Trader can create a trade via the command-center FAB modal with only the 5 Zod-mandatory fields (asset, direction, entryDate, entryPrice, positionSize). Time-to-create <30 seconds. Trade lands with `enrichmentStatus='pending'`. Command-center stats reflect the new trade without page reload.
- [ ] "Save and add another" creates trade, refreshes command-center data, clears form, keeps modal open.
- [ ] Trader can upload a Profit Pro Operações CSV to `/journal/enrich`, select a date range, and run a dry-run enrichment. The dry-run produces one snapshot row per pending trade with `status='draft'`.
- [ ] Review screen shows 4 pass cards per trade (Operations, Candle math, Indicator readout, Deterministic SL/target). Each field shows `current → proposed`, accept toggle, derivation tooltip.
- [ ] "Save & next" commits the current trade's accepted fields to `trades`, flips its snapshot to `committed`, advances. Trades already committed survive a refresh / tab close / app crash.
- [ ] Closing the browser mid-review and reopening `/journal/enrich` shows a "you have N trades pending review" banner. "Resume" returns the trader to the next unreviewed trade in the same run.
- [ ] A trade modified between dry-run start and the trader's "Save & next" click surfaces a per-field staleness banner. Trader picks per case.
- [ ] An untouched trade can be re-enriched: a second dry-run produces a new snapshot at `enrichmentVersion + 1`. Diff view against the previous committed snapshot shows which fields would change. Trader accepts or rejects.

## Quality gates

- [ ] `pnpm lint` passes — 0 errors.
- [ ] `pnpm lint:strict` passes — 0 new errors (existing ~900 warnings unchanged or fewer).
- [ ] All unit tests pass (`pnpm test`).
- [ ] E2E suite passes (`pnpm test:e2e`).
- [ ] Manual smoke against trader's real Profit Pro CSV from a recent session: full FAB-add + weekly enrich flow completes without errors.

## Data fidelity gates

- [ ] Re-importing the same orders.csv twice produces zero duplicate trades (`profitOperationNumber` idempotency works per B.2).
- [ ] Re-enriching a trade produces a snapshot at `version+1`; previous snapshot stays accessible.
- [ ] Daily-entry CSV import (the existing path) still works against a non-Profit-Pro CSV (legacy format) without regression.
- [ ] Cleanup job successfully transitions `draft` → `abandoned` after 72 hours; payload nulled, row retained for version-tracking.
- [ ] `profit_metadata` JSONB columns populate with Profit's tick-level intra-trade extremes (Drawdown, Ganho Max, Perda Max, MEP, MEN) when CSV is uploaded; these are kept as comparables, not source-of-truth (B.11 → C).

## Documentation gates

- [ ] [`docs/gotchas.md`](../gotchas.md) updated with any non-obvious things discovered during build (encoding edge cases, `hawks_renko_sizes` ISO-week edge cases on year boundaries, Profit Pro CSV quirks).
- [ ] Backlog entry in [`docs/backlog.md`](../backlog.md) deleted in the shipping PR per CLAUDE.md conventions (no parallel DONE register).
- [ ] This plan doc updated with a "**Shipped on YYYY-MM-DD** (commit `<sha>`, PR #N)" note at the top.

## Performance gates

- [ ] Dry-run of 25 trades over 7 days completes in <5s on local dev.
- [ ] Review screen renders trade cards in <100ms after navigation.
- [ ] No N+1 queries in `getDryRun` (single query loads all snapshots + their trades).
- [ ] Command-center FAB modal opens in <100ms.

## Out-of-scope confirmations

These are explicitly NOT shipped in v1 (deferred or out-of-scope per locked decisions):

- [ ] Hawks state-machine tier auto-classification (deferred until Hawks v0.7+ reproduction > 70%; tier remains hand-tagged in the meantime per locked decision #5)
- [ ] Boletas (`test.csv`) parsing (dropped — see decision #3 + Appendix B)
- [ ] DLL bridge for real-time capture (R$4k/mo paywall — see "What is out of scope" in main doc)
- [ ] Audio annotation (weak — see "What is out of scope")
- [ ] Multi-tenant features (single-trader scope)
- [ ] "Quick-add" simplified form as a SEPARATE FORK (decision #11 — there is one form, but the command-center FAB modal is a PRESENTATION variant of it, not a fork; both surfaces hit the same Zod schema and server action)
- [ ] Backfill / migration of historical hand-entered trades (forward-looking only)

## Ship-day checklist

1. All checkboxes above ticked.
2. Manual end-to-end: open `/command-center`, click FAB, add 3 trades, verify they appear in current-day stats.
3. Manual end-to-end: load candles for the week, upload Profit CSV at `/journal/enrich`, walk all trades in review, commit each, verify trades table state and enrichment_status='enriched'.
4. Confirm cron job runs (or schedule it).
5. Update plan doc with shipped-on date + commit SHA.
6. Delete backlog entry in the shipping PR.

---

# End of plan

Everything above is locked. Future agent picks up this doc + the locked backlog entry and walks Steps 1–7 in order. No design decisions remain. Open questions, if any, will be the ones marked 🟡 in any decision-log section — and those are minor implementation details, not strategic forks.

Plan filed 2026-06-12. Shipping window: post-Hawks-engine-improvement.
