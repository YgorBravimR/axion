# 2026-06-22 — Hawks trade detail chart renders only one renko brick

## Symptom

On a hawks-mode trade detail page (`/journal/<id>`), the chart shows a single
red brick at the exit price with the SL / Entry / Exit / TP lines hanging in
empty space. Trade `bba5f502-…-055a8e` (WIN short, 2026-06-16, ~3-minute trade)
reproduced it cleanly.

## Root cause

Two compounding issues:

1. **Arbitrary timeframe fallback.** Hawks-mode trades were created with
   `trades.timeframe_id = NULL`. `getCandleDataForAsset(symbol)` in
   `src/app/actions/candle-query.ts` did
   `db.query.priceDataVersions.findFirst({ where: assetId })` — no
   `orderBy`, no preference. For WIN that returned **Renko 36R** (175-point
   bricks). The day's parquet only had **one** R36 brick that intersected
   the trade's 09:00–18:00 BRT window, so only one brick rendered.

2. **UTC date-slicing bug.** `getCandlesForTrade` built the window from
   `entryTime.toISOString().slice(0, 10)`. For a late-BRT entry that crosses
   midnight UTC, the slice picks the _next_ day, shifting the entire query
   window off the actual trading day.

The chart itself was fine — `fitContent()` honestly fits the data it has.

## Fix

`src/app/actions/candle-query.ts`:

- `getCandleDataForAsset` now prefers `hawk_5m_win` when the active account
  is in hawks mode (mirrors the same precedent in
  `src/lib/enrichment/actions/start-dry-run-impl.ts`).
- `getCandlesForTrade` now resolves the BRT calendar date via
  `getBrtDateParts(entryTime)` instead of slicing the UTC ISO string.

`src/app/[locale]/(app)/journal/[id]/page.tsx`:

- Page now honors `trade.timeframeId` when present, falling back to the
  asset-level default.

`src/app/actions/trades.ts`:

- New trades created under hawks mode now always get
  `timeframe_id = hawk_5m_win`, regardless of what the form sent. If the
  timeframe row is missing, creation fails with `HAWKS_TIMEFRAME_MISSING`
  (new i18n key `actions.hawksTimeframeMissing`).

## Backfill

239 existing trades on the two active hawks-mode accounts had
`timeframe_id = NULL`. One-shot SQL on Neon:

```sql
UPDATE trades
SET timeframe_id = '9de0232d-d242-4749-809a-1f8d600d9be1'  -- hawk_5m_win
WHERE account_id IN (
  SELECT account_id FROM account_modes
   WHERE mode = 'hawks' AND deactivated_at IS NULL
)
  AND is_archived = FALSE
  AND (timeframe_id IS NULL
       OR timeframe_id <> '9de0232d-d242-4749-809a-1f8d600d9be1');
```

239 rows updated.

## How we'd catch it next time

- `getCandleDataForAsset` returning the first `priceDataVersions` row is a
  smell whenever the asset has many timeframes (WIN has ~40). Future
  defaults should always go through an explicit preference order.
- Anywhere we slice `toISOString()` to derive a trading-day key for a BRT
  asset, prefer `getBrtDateParts()` instead.
