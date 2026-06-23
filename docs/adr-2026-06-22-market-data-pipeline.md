# ADR — Market Data Pipeline (Manual CSV)

**Date:** 2026-06-22
**Status:** Accepted
**Owner:** Ygor

## Context

Axion's Hawks/TAT engines need WIN/WDO Renko bricks. Current pipeline: manually export CSV from Profitchart → `scripts/load-hawks-bricks-by-size.ts` → `priceCandles` → engine + lightweight-charts. The manual export is the only human-in-the-loop step. We investigated whether to automate it.

## Decision

**Stay on manual Profitchart CSV export.** No new ingestion code. No second data source. No paid API. Revisit only when one of the conditions in "When to Revisit" below is met.

## Options Considered

### Option A — MT5 + Python sidecar (REJECTED)

Genial MT5 + `MetaTrader5` Python package + `renkodf` + Postgres writer. Live ticks for WIN$ confirmed working.

**Why rejected:** Genial MT5 exposes **only 30 days of historical data**. Hawks/TAT backtests routinely span months to years. A 30-day source cannot feed a multi-month backtest engine.

### Option B — MT5 (live, 30d) + CSV (deep history) hybrid (REJECTED)

Two sources, partitioned by age — MT5 for rolling window, CSV for everything older.

**Why rejected:** Two sources = two truths. Silent drift between Profitchart's tick aggregation and MT5's would corrupt backtests in undetectable ways. Single-source data integrity > automation convenience.

### Option C — AutoHotkey automation of Profitchart export (REJECTED)

Windows Task Scheduler triggers AutoHotkey to drive Profitchart's export menu via keystrokes. Standard pattern in BR retail trading community.

**Why rejected:**

- Brittle to Profitchart updates, popups, focus changes, session expiry.
- Failure mode is silent (wrong CSV exported, focus on wrong window).
- Maintenance cost over 12 months > cost of paid API alternative.
- Net engineering cost (~2–3 days build + ongoing maintenance) doesn't beat manual click.

### Option D — Profit DLL / Nelogica (REJECTED)

Programmatic access to the same data Profitchart shows.

**Why rejected:** R$4k/month. Not justified at current scale.

### Option E — Cedro Market Data Cloud (DEFERRED)

Authoritative B3 redistributor. REST + WebSocket + Socket APIs. Real-time + tick-by-tick.

**Why deferred:** ~R$300–500/mo entry tier (estimate, quote-only). Cost is justifiable but not yet justified. Documented for future revisit.

### Option F — Stay manual (CHOSEN)

Status quo. Manual CSV export → existing loader. Zero cost, zero new code, zero new failure surface.

**Why chosen:** The pain is "have to click once per session," not "the data is wrong." Manual click is reliable and cheap. Engineering effort better spent elsewhere.

## Consequences

### Accepted

- **Daily/weekly manual export remains required.** If Ygor doesn't export, `priceCandles` doesn't update.
- **No real-time charting from a live feed.** Chart shows what's in the DB at the time of last CSV import.
- **Cannot trade off real-time signals automatically.** The pipeline serves backtesting + journaling, not live execution.

### Avoided

- Two-source drift risk.
- AutoHotkey maintenance burden.
- Recurring API cost without a clear ROI case.
- Building infrastructure that would be unused if the strategy doesn't warrant live signals.

## What Was Built / Changed

**Nothing.** This ADR is the only artifact. No code, schema, dependency, or doc change.

The existing pipeline (Profitchart manual export → `scripts/load-hawks-bricks-by-size.ts` → `priceCandles`) remains the production path.

## When to Revisit

Re-open this decision when **any** of the following becomes true:

1. **Manual export becomes a real bottleneck.** E.g., need data from >1 instrument per session, or need fresh data multiple times per day.
2. **Live execution becomes in-scope.** The moment Axion needs to act on signals as they form (not after-the-fact journaling), Cedro becomes mandatory.
3. **MT5 brokers reopen with deeper history.** If Genial or another broker exposes >6 months of MT5 history for free, Option A becomes viable.
4. **Profitchart breaks or changes export format.** Forces re-evaluation regardless.
5. **Budget for ~R$300–500/mo opens up.** Cedro entry tier becomes the obvious upgrade.

## Research Provenance

Decision is anchored in a deep-research pass run on 2026-06-22 (102-agent workflow, 81 claims extracted, 17 confirmed, 8 refuted). Verified claims:

- Cedro Technologies is the authoritative B3 redistributor (REST + WebSocket + Socket + FIX). [marketdatacloud.com.br](https://www.marketdatacloud.com.br/)
- Genial MT5 exposes WIN$/WDO$ symbols but with shallow historical depth (30 days at time of probe).
- `renkodf` library accepts tick DataFrames; would be the Renko builder if MT5 path were viable.
- `rb3` (R package) is webscraping-based and broke in April 2026 — not production-grade.
- LSEG/Refinitiv and Databento serve B3 at higher cost than Cedro for redistribution-licensed data.

Full report retained in conversation transcript; key sources cited inline above.

## Related Files

- `scripts/load-hawks-bricks-by-size.ts` — the CSV loader (system of record for ingest).
- `data/hawks/renko-sizes.csv` — human-curated weekly R-size config.
- `src/db/schema.ts` — `priceCandles`, `hawksRenkoSizes`, `assetPivots` (all reusable if/when this decision is revisited).
- `docs/gotchas.md` — log any new findings about Profitchart export quirks here.
