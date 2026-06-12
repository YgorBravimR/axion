# 2026-06-12 — Quarterly cockpit showed stale `snapshotOneRCents`

## Symptom

During smoke testing after merging PR #15 (cockpit/ladder fixes), the quarterly
plan page (`/plan/2026/2`) showed `T0 · 1R R$ 80,00` for every month of Q2 2026
on Hawk T2 Live, while:

- The **yearly cockpit** for the same account showed `1R R$ 100,00` for the same
  months.
- The **monthly plan page** for June 2026 showed `T0 · 1R R$ 100` in the caps
  strip.

Three pages on the same plan, two different answers.

## Root cause

`src/components/fractal-plan/cockpit/quarter-report.tsx` was reading the per-
month 1R / tier values **directly from `monthlyPlan.snapshotOneRCents` /
`snapshotTierIndex`** in the DB:

```ts
tierIndex: row?.snapshotTierIndex ?? 0,
oneRCents: row?.snapshotOneRCents ?? 0,
```

Those snapshots are frozen at plan-seed time from `yearlyPlans.initialCapitalCents`.
For the Hawk T2 Live plan that value is `150_000` cents (R$ 1.500) — the stale
seed value from before the account's `startingBalanceCents` was set to R$ 5.000.

R$ 1.500 falls **below** the ladder's bottom floor (`minCapitalCents: 500_000`),
and `resolveTier` was previously returning the _highest_ tier as a fallback
(that's the bug fixed in PR #15: `resolve-tier-floor-clamp-inversion`). After
the floor-clamp fix `resolveTier(150_000)` correctly returns tier 0 — but the
snapshot value of R$ 80 (computed by an older path) was already persisted to
the DB and the quarterly page didn't re-derive it.

The **yearly** and **monthly** cockpits already had a fix for this class of bug:

- `annual-cockpit-grid.tsx` re-resolves the tier from the running compound
  capital via `resolveTier(startBalanceCents, ladderRules)`, only using the
  snapshot when `snapshotReason === "manual"`.
- `month-report.tsx` prefers `account.startingBalanceCents` over
  `yearRow.initialCapitalCents` and computes `effectiveCapitalCents` via a
  forward compound loop, then derives tier/1R from that.

The quarterly cockpit was left behind.

## Fix

`src/components/fractal-plan/cockpit/quarter-report.tsx`:

1. Fetch `tradingAccounts.startingBalanceCents` alongside the rest of the
   account row.
2. Compute `effectiveInitialCapitalCents` with the same rule as `month-report`
   (account starting balance preferred over yearly plan seed when the account
   starts in the same year).
3. Hoist a `compoundCapitalAtMonth(targetMonth)` helper that walks the same
   compound loop used in `month-report` and `compound-projection`.
4. For each month in the quarter, derive display `tierIndex` via
   `resolveTier(compoundCapitalAtMonth(m), ladderRules)` and `oneRCents` via
   the existing `computeProjectedOneRCents` call (re-pointed at
   `effectiveInitialCapitalCents`).

After the fix the quarterly cards on Hawk T2 Live agree with both the yearly
cockpit and the monthly page:

- Q1 (Hawk BT) — Jan/Fev/Mar: `T0 · 1R R$ 100,00`
- Q2 (Hawk T2 Live) — Abr/Mai/Jun: `T0 · 1R R$ 100,00`
- Q3 (Hawk T2 Live) — Jul/Ago `T0 · 1R R$ 100,00`, Set `T1 · 1R R$ 265,00`
  (tier escalates as capital crosses R$ 15.000)

## Prevention ideas

- **Single helper.** All three cockpit layers (yearly, quarterly, monthly) now
  duplicate the same "prefer account.startingBalanceCents → run a compound
  loop → resolveTier" logic. Extract a single
  `getEffectiveMonthSnapshot(accountId, year, month, { yearRow, ladderRules })`
  helper used by all three. Filed in `docs/backlog.md`.
- **Snapshot drift test.** A property test that loads any seeded plan and asserts
  that for every month, the displayed `oneRCents` on yearly / quarterly /
  monthly pages agree (or are all explicitly `manual`). This bug would have
  been caught at PR-time instead of in smoke testing.
- **Schema-level guard.** When `yearlyPlans.initialCapitalCents` is updated
  (or the account's `startingBalanceCents` changes), invalidate
  `monthlyPlan.snapshot*` rows whose `snapshotReason !== "manual"` — or move
  to derived-on-read so there's no snapshot to go stale. Larger refactor;
  also in `docs/backlog.md`.

## Files touched

- `src/components/fractal-plan/cockpit/quarter-report.tsx`
- `docs/postMorten/2026-06-12-quarterly-cockpit-stale-snapshot.md` (new)
- `docs/gotchas.md` (appended)
