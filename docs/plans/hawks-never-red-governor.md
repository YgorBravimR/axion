# Hawks Never-Red Daily Governor — Implementation Plan

Status: reviewed via /plan-eng-review 2026-07-06. Scope: LIVE TRADING STATUS ONLY (backtest deferred, filed in `docs/backlog.md`).
Rule spec: `/tmp/hawks-daily-stop-spec.md` (move here as `hawks-never-red-governor-spec.md` when implementation starts).

## The rule (governing variable = cumulative realized R for the day)

No fixed trade-count limit. Three phases keyed off `totalR = sum(trades.rOutcome)`:

```
        totalR < 1R          1R <= totalR < target        totalR >= target
      ┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
      │   PHASE 0    │     │      PHASE A         │     │     PHASE B      │
      │  not armed   │ ──► │   armed, never-red   │ ──► │  one stop hard   │
      │              │     │                      │     │                  │
      │ normal daily │     │ floor = 0R           │     │ cushion N/A      │
      │ loss cap +   │     │ cushion=floor(totalR)│     │ next -1R ends    │
      │ cascade net  │     │ stop when cushion<1  │     │ the day, hard    │
      └──────────────┘     └──────────────────────┘     └──────────────────┘
       sub-1R win does       winners count only          wins after target
       NOT arm the rule      when >= 1R; frac .5         add profit, don't
                             never risked                buy extra stops
```

Confirmed edge (S8): crossing target TIGHTENS risk (Phase A cushion → Phase B one-stop). Intended.

### Latching + partial-loss rules (from adversarial review, D5/D6)

- **Arm LATCHES (D5, P0 fix):** once `totalR >= 1R` at any point, the 0R floor holds all day.
  A later partial loss dropping `totalR < 1R` does NOT disarm. Implement as a running
  `everArmed` boolean over the replay — NO DB column. Without this, a partial loss silently
  reverts to Phase 0 and reopens the full loss cap below break-even (destroys the guarantee).
- **Phase B "the stop" = ANY losing trade (D6):** any negative-rOutcome trade ends the day
  in Phase B. Do not assume stops are exactly -1R.
- **Partial losses in Phase A:** `cushion = floor(totalR)` handles any loss magnitude; no
  special case. A -0.6R just lowers totalR.
- **Open-trade caveat:** governor reads CLOSED trades only (same as resolveLiveStatus +
  cascade.ts). Live-before-next-trade answer is based on realized R. This is the existing
  system contract, not a new gap. Order-time enforcement is a pre-existing, out-of-scope concern.

## Architecture (decided in review)

- **D1 — separate module** `src/lib/hawks/daily-governor.ts`, R-native pure fn. Mirrors `src/lib/hawks/cascade.ts`. Keeps `resolveLiveStatus` cents-only.
- **D2 — both UI sites honor the stop** (live-trading-status-panel + circuit-breaker-panel).
- **D3 — governor replaces target-stop for Hawks**: `dailyTargetReached` stays a stop for non-Hawks; for Hawks it becomes a non-stopping "target hit" flag and `postTargetStop` is the real post-target stop.
- **D4 — compute in R decimals directly**: sum `rOutcome`, `floor()` for cushion, no cents round-trip.

### Purity resolution (review tension D1×D2)

`resolveLiveStatus` is currently pure (no DB, cents-only). The governor needs per-trade R + Hawks-mode gate (DB). Resolution: the **pure governor** takes `trades[]` + `dailyTargetR` + `dailyLossR`; a **DB helper** loads data and gates on mode; the **action + circuit-breaker route compose** the governor stop into their outputs AFTER `resolveLiveStatus` returns. `resolveLiveStatus` stays pure and untouched in signature.

```
                ┌─────────────────────────────┐
   trades[] ──► │ daily-governor.ts (PURE)    │ ──► { phase, cushion,
 dailyTargetR ► │  totalR, floor, phase logic │      totalR, shouldStop,
  dailyLossR ─► └─────────────────────────────┘      stopReason }
                            ▲
                            │ called by
       ┌────────────────────┴─────────────────────┐
       │                                            │
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ getHawksDailyGovernorStatus() │      │ (same helper — DRY, ONE impl) │
│  DB helper: mode gate + JOIN  │◄─────┤  imported by both call sites  │
│  rOutcome load (like cascade) │      └──────────────────────────────┘
└──────────────────────────────┘
       │                                            │
       ▼ composed into                              ▼ ORed into
 getLiveTradingStatus action              circuit-breaker route
 (merge stop after resolveLiveStatus)     (shouldStopTrading OR governor)
       │                                            │
       ▼                                            ▼
 live-trading-status-panel               circuit-breaker-panel
```

## Files to touch

1. `src/lib/hawks/daily-governor.ts` (NEW) — pure `resolveHawksDailyGovernor({ rOutcomes: number[], outcomes, dailyTargetR, dailyLossR }) → GovernorResult`.
2. `src/lib/hawks/daily-governor-status.ts` (NEW) — DB helper `getHawksDailyGovernorStatus(accountId, date)`: mode gate + `tradeHawksMetadata`→`trades` JOIN for `rOutcome` (reuse cascade.ts query pattern), returns `GovernorResult | null` (null when not Hawks). This is the DRY seam both call sites use.
3. `src/app/actions/live-trading-status.ts` — after `resolveLiveStatus`, call the helper; if Hawks, merge governor stop into `status` (override `dailyTargetReached` → non-stopping per D3; set `stopReason` to `neverRedFloor`/`postTargetStop` when governor stops).
4. `src/app/api/arch/command-center/circuit-breaker/route.ts` — OR governor stop into `shouldStopTrading` (line ~219), alongside existing `hawksCascadeTriggered`.
5. `src/types/live-trading-status.ts` — extend `stopReason` union with `"neverRedFloor" | "postTargetStop"`; add optional governor fields (phase, cushion, totalR) for panel display.
6. Tests (below).

No schema change (recompute-from-trades pattern holds).

## What already exists (reuse, don't rebuild)

- `src/lib/hawks/cascade.ts` — exact query pattern for per-trade `rOutcome` summed per day, Hawks-mode-gated via `accountModes`. **Copy the JOIN + gate; do not reinvent.**
- `resolveDay` (`src/lib/fractal-plan/resolver.ts`) — already resolves `dailyTargetR` and `dailyLossR`. Feed both into the governor.
- `resolveLiveStatus` — recompute-from-trades replay + `stopReason` emission. Governor composes onto it, doesn't duplicate it.

## Test plan (17 unit + 3 integration — all ship in this PR)

Unit (`daily-governor.test.ts`), pure fn, from the spec scenario matrix:
Phase 0: S1 (first -1R → loss cap), S13 (+0.7R no-arm; +0.7R,-1R → -0.3R).
Phase A: S2 (+1,-1→0R), S3 (+1×3,-1×3→0R), S4 (+1.5,-1→+0.5R end), S5 (floor(3.0)=3), cushion-exact-to-0 boundary.
Phase B: S6 (+1×5,-1→+4R), S7 (wins don't buy stops), S8 (boundary tighten), S9 (+2R overshoot).
Edge: S12 (breakeven no-consume), non-Hawks → null, empty trades → no stop.
LATCH/PARTIAL (from adversarial review — the 17-case grid missed these):

- S16 [P0]: +1.5R (arm) → -0.7R → +0.8R still armed, floor 0R holds (no disarm).
- S17: +1.5R → -0.9R → clamp to 0R, day ends (never red on partial loss).
- S18: five +0.99R wins → totalR 4.95, floor=4 cushion (running-total arms; no per-trade cliff).
- S19 [D6]: target hit → -0.4R partial loss in Phase B → day ends (any losing trade).
- S20: +2R (cushion 2) → +1R → +3R (cushion 3), cushion grows cleanly (hole 1).
  Integration: helper mode-gate + JOIN; action merges governor stop; circuit-breaker ORs governor.

Now 22 unit + 3 integration.

## Failure modes

- **Governor query fails / times out** → helper returns null (fail-open to existing cascade+cap), logs error. Test: helper swallows DB error → null. No silent wrong-stop.
- **rOutcome null on an open trade** → cascade already filters `isNotNull(rOutcome)`; governor reuses that filter. Test: open trade excluded.
- **Two panels disagree** → mitigated by D2 (both honor) + DRY helper (one source). Test: both call sites return same stop for same day.

## NOT in scope

- Backtest application of the governor — deferred, filed in `docs/backlog.md` (Backtest/Inspector, P2).
- Non-Hawks accounts — governor returns null; their behavior unchanged.
- New DB columns / day-state table — recompute pattern makes it unnecessary.
- Trailing floor variant — user chose fixed 0R floor; revisit only if requested.

## Parallelization

Lane A: `daily-governor.ts` + its unit tests (pure, independent).
Lane B: `daily-governor-status.ts` helper (depends on A's type export).
Lane C: action + route wiring + integration tests (depends on B).
Execution: A first (or A alongside B's type stub), then B, then C. Mostly sequential — shared `src/lib/hawks/` module. Not worth worktree isolation.

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status       | Findings                                                                                                                                                                                                                                                  |
| ------------- | --------------------- | ------------------------------- | ---- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 0    | —            | not run (config change, not product pivot)                                                                                                                                                                                                                |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | CLEAR        | 8 issues raised, 0 critical gaps remaining; 4 arch decisions + 2 correctness decisions resolved                                                                                                                                                           |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 0    | —            | not run (two panels reflect stop; copy-only)                                                                                                                                                                                                              |
| Outside Voice | adversarial subagent  | Independent challenge           | 1    | issues_found | Codex hit usage limit; Claude adversary ran. Surfaced P0 disarm bug (fixed via D5 latch) + P1 Phase-B partial-stop def (fixed via D6). 2 overreaches rebutted (open-trade contract is pre-existing; +0.99R pathology dissolved by running-total cushion). |

- **CROSS-MODEL:** Codex unavailable (usage limit); single-model adversary used. Its two P0/P1 correctness findings were accepted and fixed; two findings rebutted with code-grounded reasoning.
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED — architecture + tests locked. Ready to implement on a feature branch (do NOT implement on `main`).
