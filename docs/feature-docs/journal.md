# Journal

> The data spine of Axion. Every analytics view, every report, every tax row reads from here.

**Routes:** `/[locale]/journal`, `/journal/[id]`, `/journal/new`, `/journal/enrich`
**Server actions:** `trades.ts` (72 KB — the largest file in actions), `trade-conditions.ts`, `tags.ts`, `enrichment.ts`, `csv-import.ts`, `nota-import.ts`, `ocr-import.ts`, `coaching.ts`
**Files:** `src/app/[locale]/(app)/journal/**`

---

## Sub-features

### 1. Journal list (`/journal`)

**Purpose:** Timeline of all trades grouped by day, filterable by period, searchable by asset/tag/outcome.

**What lives there:**

- Period filter (Day / Week / Month / All / Custom) — BRT-anchored boundaries.
- Smart search (asset, tag, outcome keyword) — client-side O(N).
- `TradeDayGroup` of `TradeCard`s (direction icon, asset, P&L, R, outcome badge, rating).
- Daily bias panel (Hawks-only): mode + daily ordinal.

**Where it fails:**

- Search lags on 1000+ trades — no server indexing.
- No bulk export — must scroll.
- Custom date ranges silently mis-bucket on DST transitions.
- No "view strategy" shortcut from a trade card.

### 2. Trade detail (`/journal/[id]`)

**Purpose:** Plan vs outcome for one trade. Reflection, condition audit, tag classification.

**What lives there:**

- Header band (direction, asset, side, timeframe, P&L, R, outcome, followed-plan, rating).
- Execution band (entry/exit, size, risk, scaled fills).
- Risk/excursion band (R-multiple bar, MFE/MAE).
- Process band (strategy, conditions checklist, tags).
- Reflection band (pre-trade thoughts, post-trade reflection, lesson, discipline notes).
- Chart view (async candle load with entry/exit markers).

**Where it fails:**

- Chart blank on first visit while candles load; no fallback if candles never populate.
- Conditions snapshot taken at entry — if the strategy was updated mid-trade, displayed names are stale.
- Scaled executions are read-only in detail; you have to leave the page to edit.
- Reflection text is not full-text indexed; can't search across "lesson learned" globally.

### 3. New trade (`/journal/new`)

**Purpose:** Real-time or after-hours trade entry. Four tabs: Single / CSV / Nota / Screenshot (OCR).

**Single mode:** `TradeForm` (simple) or `ScaledTradeForm` (per-fill grid). Toggle keeps shared state.

**Where it fails:**

- B3 futures code resolution is brittle (`WDO` vs `WDOH24`). Error messages are vague ("asset not found").
- Scaled fills have no "duplicate last fill" shortcut — five fills = five hand-entries.
- Pre-trade thoughts are optional; users skip them, which kills coaching signal later.
- Rating is not sticky — users forget; have to edit later.
- `returnTo` query param sometimes loses chart hash fragments.
- Hawks daily-cap warning only shows after you load the form; no preemptive block from CC.

### 4. Enrichment (`/journal/enrich`)

**Purpose:** Post-trade batch review. Fill missing P&L / execution / reflection for `enrichmentStatus = "pending"` trades.

**Flow:** landing (pending count, resume banner, CSV date picker) → review (sidebar of trades, single-trade form) → dry run (preview) → commit. Snapshots stored as `tradeEnrichmentSnapshots` for resume.

**Where it fails:**

- **No auto-save.** Close the tab mid-batch and the draft is abandoned. The resume banner only works if the snapshot status is `"draft"`; nav-away sometimes flips it to `"abandoned"`.
- No bulk-fill (e.g. "tag all of these as scalp, rating B").
- "Replace or keep?" dialog is missing when re-enriching a trade that already has data.
- Reflection text validation is absent — "good trade" passes and produces no signal for coaching.

### 5. CSV import

**Purpose:** Bulk upload from broker export or personal spreadsheet.

**Flow:** file in → encoding detected (UTF-8 → Latin-1 fallback) → preview with validation errors → bulk insert with dedup via `computeTradeHash`.

**Where it fails:**

- **Encoding chaos** — if Latin-1 detection misses (rare but happens), Latin chars get silently mangled and stored as garbage.
- **Loose asset resolution** — typo `PERE` for `PETR` may silently fail or import as orphan.
- **No post-insert "X failed" summary** — validation errors in preview can be ignored, then the count of failed rows is invisible.
- **Inline tag creation** — referenced tags auto-create on the fly. Users end up with duplicate tags (`scalp` and `Scalp`).
- **Fee snapshot gaps** — entry dates before fee history → defaults to zero fee → underreported P&L → bad tax row.

### 6. Nota fiscal import (SINACOR)

**Purpose:** Parse Brazilian broker statement PDF, match fills to existing trades, populate execution details and real fees.

**Where it fails:**

- SINACOR format varies per broker sub-version — parser misses fills on Clear, XP, Modal variants.
- ±2-hour matching window misses when the user's clock is in a different TZ from the nota.
- Symbol mismatch (`UFRE` vs `UFRE1`) — too strict.
- Multi-leg trades (spreads) confuse the matcher — sees separate legs as separate trades.

### 7. OCR import

Image of a broker ticket → OCR → suggested form values. **Underbuilt:** OCR library is not yet wired in production. Single-trade workflow takes ~20s per image. Manual correction UX is weak — no side-by-side image-vs-form layout.

### 8. Tags

**Purpose:** User-defined labels (setup / mistake / general) with per-tag performance stats.

**Where it fails:**

- No tag hierarchy — can't group `reversal` + `reversal-low-rsi` under a parent.
- Stats query does full table scan for 5K+ trades (2s+).
- No bulk-apply across selected trades.

### 9. Coaching

**Purpose:** Pattern detection on the last 90 days — win rate by hour, post-loss behavior, tag co-occurrence, discipline breaches.

**Where it fails:**

- Heuristics are keyword-based — `"revenge"` matches, `"I wanted to recoup that loss"` doesn't.
- No TZ-awareness in hour buckets.
- No feedback loop — user can't rate insight quality or mark "already aware".
- Claude API integration is Phase 2; today's "coaching" is a deterministic detector with limited surface.

---

## Outputs (across all sub-features)

- `trades` row (P&L, outcome, R, fees, dates).
- `tradeExecutions` (scaled fills).
- `tradeConditions` (snapshot of entry conditions).
- `tradeTags` (many-to-many to `tags`).
- `tradeEnrichmentSnapshots` (resume state).
- `notaImports` (PDF audit log, dedup by hash).

## Cross-feature integrations

- **Analytics, Reports, Tax Engine, Plan, Playbook, Coaching, Dashboard** all read from `trades`.
- Mutations invalidate `analyticsData`, `tagData`, mark tax ledger dirty.
- Hawks daily ordinal increments here; daily cap is enforced here.

## Hard friction summary

1. Encoding hell on CSV (silent corruption).
2. Asset resolution inconsistency (sometimes strict, sometimes silent).
3. No auto-save on enrichment (lost drafts).
4. Sparse reflections → weak coaching signal.
5. Tag stats slow at scale.
6. Condition snapshots stale on strategy edits.
7. No multi-trade bulk-tag.
8. Nota parser brittle on broker variations.
9. Chart load latency in detail view.
10. No reflection quality validation.

## Power combos

1. **Manual entry → immediate enrich.** Log the trade with bare-minimum data during the session; finish reflection + tags in the evening enrich flow. Snapshot persists across days if you don't commit.
2. **Bulk CSV → tax recompute → Plan.** Upload broker CSV → enrichment fills missing reflection → tax ledger marked dirty → Annual report row updates same day → Plan month view reflects new compliance.
3. **Tag + Coaching loop.** Create `oversize` tag, retroactively apply to outsized losers, coaching detector picks up the new pattern, next session Plan tightens daily cap. Self-correcting loop with a 1-day lag.
4. **Reflection-rich entries → richer Coaching.** Force yourself to type 3+ sentences in `lessonLearned` for every losing trade. Coaching detector starts catching nuance ("uncertainty", "FOMO", "boredom") it can't catch on terse entries.
