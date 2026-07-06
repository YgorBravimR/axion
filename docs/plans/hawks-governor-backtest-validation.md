# Hawks Daily Governor — Backtest / Validation Plan

Status: IMPLEMENTED 2026-07-06 on branch `feat/hawks-never-red-governor` (Lanes A–C).
Governor floor generalized (floorR param, default 0); floor sweep (`src/lib/hawks/governor-sweep.ts`)

- parity test; Equity Shield governor mode + sweep table. Reviewed via /plan-eng-review 2026-07-06.
  Depends on the live governor (shipped, commit `93657e8a`).
  Supersedes the backlog stub in `docs/backlog.md` (Backtest/Inspector → "Hawks daily-governor — apply … to backtest").

## Reframe (the decision that shaped this plan)

The governor is a **risk-management system with a tunable floor**, not a "never-red engine."
"Never-red" is the `floorR = 0` setting. The same engine expresses:

```
  floorR = -3R  → daily loss cap        floorR = 0R  → never-red (today's rule)
  floorR = +1R  → lock-in-profit        floorR = +2R → lock-in-more
```

Consequences baked into this plan:

1. Generalize the live governor: hardcoded 0R floor → `governorFloorR` parameter (default 0 = today's behavior, exactly).
2. Validation is a **floor sweep**, not a single baseline-vs-governed: run real trades across floors and see which the data rewards.
3. Judgment is risk-shaped: not "does it profit" but "what expectancy does each floor cost vs. what drawdown / red-days it saves."

## Home: Equity Shield mode selector (not Backtest, not a new view)

Equity Shield already self-describes as "Discipline-based equity curve management," ingests real
trades, builds baseline-vs-intervention equity curves, and computes MDD. It is a risk engine wearing
a simulator's clothes — the right home. To keep it single-purpose (CLAUDE.md rule 1), the governor is
an explicit **mode selector**, not an overload of the existing DD-floor logic:

```
Equity Shield  ▸ shieldMode:
   • "dd-floor"   (today: mddMultiplier / recoveryPercent / cutAtDdLimit)
   • "governor"   (NEW: governorFloorR / dailyTargetR, per-day never-red/lock rule)
```

The two modes share Equity Shield's trade ingestion, equity-curve builder, MDD math, and the existing
original-vs-shielded comparison chart. They do NOT share rule logic.

## Why post-hoc truncation is EQUIVALENT here (not approximate) — [EUREKA]

Proven from code: Hawks trade generation (`HawksPlaybookState` in
`src/lib/backtest/modules/entry/hawks-playbook.ts`) depends ONLY on chart structure
(`priorBricksToday`, `lastFireBrickIndex`) — NOT on prior trade outcomes or PnL. Whether the governor
would have stopped a day does not change which trades the strategy generates. Therefore truncating the
day's trades after `shouldStop` fires yields the identical R distribution to re-simulating with in-loop
enforcement. Cheaper path is also the correct one.

Decided: ship **truncation** + a **parity test** that runs in-loop enforcement on a sample of days and
asserts identical R distributions — equivalence proven empirically, not asserted.

Note: Equity Shield works on your REAL LOGGED trades, so "generation" isn't even in play there — the
trades already exist; the governor just decides which to keep per day. Truncation is exact by
construction for the Equity Shield home. The parity test matters only if/when the governor is also
applied inside the trade-GENERATING Backtest engine (deferred, see NOT in scope).

## Part 1 — Generalize the live governor (touches shipped code)

File: `src/lib/hawks/daily-governor.ts`. This is a deliberate refactor of shipped code; the existing
21 unit tests are the regression net — **floorR=0 must reproduce every current assertion unchanged.**

- Add `floorR: number` to `GovernorParams` (default 0).
- Cushion generalizes: `floor(totalR)` → `floor(totalR - floorR)` (riskable 1R units above the floor).
- Arm threshold generalizes: `totalR >= 1` → `totalR >= floorR + 1` (≥1R of cushion above floor).
  At floorR=0 this is `>= 1` — identical to today.
- Stop-when-`cushion < 1` and Phase B logic unchanged (they already measure against the floor via cushion).
- Rename the exported `ARM_THRESHOLD_R` usage internally; keep the export for back-compat.
- DESIGN NOTE: a NEGATIVE floor (loss-cap semantics) arms below break-even and overlaps Phase 0's
  existing loss cap. Scope the sweep so negative floors are labeled/interpreted as "loss cap" mode and
  not double-counted against the fractal cap. Positive/zero floors are the primary sweep range.

Add tests: floorR ∈ {-1, +1, +2} phase/cushion/stop behavior; floorR=0 parity (re-run the existing grid
via the new signature).

## Part 2 — Governor mode in Equity Shield

Files:

- `src/types/equity-shield.ts` — add `shieldMode: "dd-floor" | "governor"` to `EquityShieldParams`;
  add `governorFloorR: number` and `governorTargetR: number`; add `rOutcome: number` and
  `tradingDay: string` to `TradeForShield` (governor is R-and-day based; existing shield is pnl-and-sequence).
- `src/lib/equity-shield.ts` — branch on `shieldMode`. New `applyGovernorShield(trades, params)`:
  group by `tradingDay`, per day walk trades through `resolveHawksDailyGovernor({trades, dailyTargetR, floorR})`,
  keep trades up to and including the stop trade, drop the rest, build the governed curve from survivors.
  Reuse the existing curve/MDD builder on the survivor list.
- `src/app/actions/equity-shield.ts` — load `rOutcome` + trading day for the trade set (JOIN through
  `tradeHawksMetadata` like cascade.ts when in governor mode); pass mode + params through.
- `src/components/equity-shield/equity-shield-params.tsx` — mode toggle + governorFloorR / target inputs
  (shown only in governor mode). No native dialogs (rule 8).
- `src/components/equity-shield/equity-shield-stats.tsx` — governor-mode deltas (below).

## Part 3 — Floor sweep + the trust deliverable

The output that answers "should I trust this rule, and at what floor":

```
Floor sweep over real logged Hawks trades:

  Floor    TotalR   Expectancy   MaxDD   Red days   Days capped   Avg trades/day
  -----    ------   ----------   -----   --------   -----------   --------------
  none     +142R      +0.31R     -22R      14           —              4.1     ← baseline
  -1R      +138R      +0.30R     -14R       6           9              3.4
   0R      +128R      +0.29R      -9R       0          18              2.7     ← never-red
  +1R      +109R      +0.27R      -4R       0          31              2.1     ← lock +1R
  +2R       +86R      +0.24R      -2R       0          44              1.6
```

- "Days capped" = days the governor ended early. "Red days" = days closing < 0R.
- Metrics reuse Equity Shield's MDD builder + a small R-aggregation over survivors.
- Render as a sweep table + the existing original-vs-governed equity curve for the selected floor.
- This is the artifact for the trust call: the expectancy cost of each floor vs. the drawdown / red-day
  it removes. floor=0 (never-red) is one row, not the only row.

## What already exists (reuse, don't rebuild)

- `resolveHawksDailyGovernor` (`src/lib/hawks/daily-governor.ts`) — the rule; generalize its floor, don't fork it.
- Equity Shield curve builder + MDD (`src/lib/equity-shield.ts`) — reuse for governed curve.
- Equity Shield original-vs-shielded chart — reuse for baseline-vs-governed.
- `tradeHawksMetadata`→`trades` JOIN for rOutcome (cascade.ts / daily-governor-status.ts) — reuse to load R.
- `metrics.ts` (backtest) pattern of recompute-from-trades — same principle: metrics over the survivor list.

## Test plan

- Part 1: floor-parameterized governor cases + floorR=0 regression parity (existing 21 must pass via new signature).
- Part 2: `applyGovernorShield` — per-day grouping, truncation keeps up-to-and-including the stop trade,
  survivors feed the curve; non-Hawks / empty → baseline unchanged; multi-day sequence.
- Part 3: sweep produces one row per floor; deltas computed correctly; "days capped" / "red days" counts.
- Parity (only if governor is later added to the generating Backtest engine): truncation == in-loop on sample days.

## Failure modes

- Missing `rOutcome` on a logged trade → exclude (same filter as cascade `isNotNull(rOutcome)`); log count excluded.
- Day-boundary/timezone: use the same BRT day key as the live governor helper so live and validation agree.
- Negative-floor overlap with fractal loss cap → labeled as loss-cap mode; do not double-apply.

## NOT in scope

- Applying the governor INSIDE the trade-generating Backtest engine (`runBacktest`). Deferred — the
  Equity Shield home answers the trust question on real trades; strategy-level generated-history
  validation is a later, larger piece (needs the parity test + engine hot-path changes).
- Auto-tuning / picking the "best" floor programmatically — the sweep informs a human decision; no optimizer.
- Changing the live governor's default (stays floorR=0 / never-red) until the sweep says otherwise.
- Monte Carlo integration — MC works on abstracted per-trade stats, not intraday R paths; weak fit.

## Parallelization

Lane A: Part 1 (generalize governor + tests) — pure, independent.
Lane B: Part 2 (Equity Shield mode + action) — depends on A's new signature.
Lane C: Part 3 (sweep + UI) — depends on B.
Sequential; shared `daily-governor.ts` + `equity-shield.ts`. Not worth worktree isolation.
