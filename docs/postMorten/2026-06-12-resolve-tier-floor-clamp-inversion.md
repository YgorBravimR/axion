# 2026-06-12 — `resolveTier` returned highest tier for sub-floor capital

## Symptom

On Hawk T2 Live the current-month cockpit card showed:

- `+ proj fim mês: R$ 130k +2503.4%` (with hero `R$ 6.878,40 +37.6%`)
- `+ proj restante: +35.2R · R$ 127k`

R$130k end-of-month from a R$6.9k start is impossible — Ygor flagged it immediately.

## Root cause

Two compounding bugs in the page-side "current month remainder" projection (`src/app/[locale]/(app)/plan/[year]/page.tsx:387-407`).

### 1. `resolveTier` floor-clamp inversion

`src/lib/fractal-plan/capital-ladder.ts` iterates the ladder; if no rule matches it falls through and returns the **highest** tier. The comment said "Above the top band: clamp to highest tier", but the same code path also caught capital that was **below** the lowest tier's floor — and returned the **most aggressive** tier (`oneR = R$5,000`), which is the worst possible answer for risk sizing. The existing test suite always defined a tier 0 starting at `minCapitalCents: 0`, so the gap was never exercised.

Hawk T2 Live's ladder starts at `minCapitalCents: 500_000` (R$5,000). Capital below that (e.g. `R$3,379`, see bug #2) fell through to the fallback and got `oneR = R$5,000`.

### 2. Stale monthly snapshot used as month-start capital

The current-month projection block used `monthlyPlan.snapshotCapitalCents` (R$1,500 — the old yearly `initialCapitalCents`, frozen when the plan tree was seeded) as the month-start capital. The grid (`annual-cockpit-grid.tsx`) only trusts the snapshot when `snapshotReason === "manual"`, otherwise it uses the running capital chain that starts from the account's `startingBalanceCents` (R$5,000). The two code paths diverged.

### Combined effect

- Page used monthly snapshot → `monthStartCapital = 150_000` cents (R$1,500)
- `realEnd = 150_000 + 187_904 = 337_904` cents (R$3,379)
- `resolveTier(337_904, ladder)` → **last tier** (`oneR = 500_000` = R$5,000) instead of tier 0 (`oneR = 10_000` = R$100). That's a **50× risk amplification**.
- `addedGross = 35.2R × R$5,000 = R$176,000`; after 20% IR + 10% withdrawal → R$127k net
- `projectedEndBalance ≈ R$130k` → `+2503%`

After the fix:

- Page uses `initialCapitalCents = 500_000` (account starting balance) for non-manual snapshots, matching the grid.
- `resolveTier` clamps sub-floor capital to tier 0.
- Even if the page bug recurred, `resolveTier(337_904) = oneR R$100` (not R$5,000), so the blast radius is capped.

## Fix

1. **`src/lib/fractal-plan/capital-ladder.ts`** — added explicit floor-clamp branch:

   ```ts
   if (capitalCents < bottom.minCapitalCents) {
   	return { tierIndex: 0, oneRCents: bottom.oneRCents }
   }
   ```

   _before_ the existing "above the top band" fallback.

2. **`src/app/[locale]/(app)/plan/[year]/page.tsx`** — current-month-remainder block now uses `initialCapitalCents` unless the monthly snapshot reason is `"manual"`, matching `annual-cockpit-grid.tsx:127`.

3. **`src/__tests__/lib/fractal-plan/capital-ladder.test.ts`** — added a regression test using a gapped ladder (lowest tier starts at R$5,000) and asserts that R$1,000 capital resolves to tier 0, not the top tier.

## Detection

Manual visual catch: the "+ proj fim mês" value was four orders of magnitude beyond plausibility for the hero start balance. Without that, the bug would have silently kept overstating the projected end-of-month figure for any account whose monthly snapshots were below the ladder's lowest floor.

## Prevention ideas

- **Invariant test in `resolveTier`**: for any `capitalCents < rules[0].minCapitalCents`, returned tier MUST be `0`. Covered by the new test.
- **Property test**: for random ladders + random capitals, returned `oneRCents` ≤ `max(rules[0].oneRCents, rules.find(r => r.minCapitalCents <= capital)?.oneRCents)`. Would have caught the inversion immediately.
- **Cross-component consistency**: extract a single `getMonthStartCapital(monthRow, runningOrInitial)` helper so the page and the grid can't drift in how they choose between snapshot and running capital. Filed as a small refactor in `docs/backlog.md` (TODO if it doesn't exist).
- **Sanity guard in the card**: if `endBalanceCents > startBalanceCents × 5`, render with an explicit "verify ladder" warning rather than silently displaying nonsense. Worth considering — large but real wins (e.g. compounding over months) could trip it, so this is more aesthetic than safety.

## Files touched

- `src/lib/fractal-plan/capital-ladder.ts`
- `src/app/[locale]/(app)/plan/[year]/page.tsx`
- `src/__tests__/lib/fractal-plan/capital-ladder.test.ts`
