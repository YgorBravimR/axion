# Backend Post-Mortem Log

---

## [BUG-2026-05-15-1] Hawks `dailyTradeOrdinal` race condition — concurrent inserts collide on unique index

**Severity:** Medium (low probability, high correctness impact) | **Affected:** `src/app/actions/trades.ts`, `src/db/schema.ts`, `src/db/migrations/0005_boring_wasp.sql`

**Cause:** The Hawks v0 sidecar computes `dailyTradeOrdinal = COUNT(*) + 1` on the trades table before insert. Two concurrent requests (e.g., from two browser tabs) both observe `count=0`, compute `ordinal=1`, and attempt to insert. The second insert violates a unique constraint (once added) with error code `23505` (Postgres). No unique constraint existed until this fix, so the collision silently created two trades with `ordinal=1` on the same `(accountId, tradingDay)`.

The race window is narrow (requires submissions within milliseconds) but achievable. While rare in practice, the ordinal is an analytics signal expected to be monotonic per day; duplicates confuse the Hawks scoring detector.

**Effect:**

- Two trades logged concurrently on the same day could both receive `ordinal=1`
- Detector queries expecting `dailyTradeOrdinal` to uniquely order trades within a day would encounter ambiguity
- No user-facing crash; silent data inconsistency that breaks downstream analytics

**Solution:**

1. **Schema change**: Added `accountId` (uuid FK) and `tradingDay` (date) columns to `trade_hawks_metadata`. Previously these were "derived from parent trade by detector pipeline"; now they're explicit, denormalized columns populated by the action.
   - Added unique index `thm_account_day_ordinal_idx` on `(accountId, tradingDay, dailyTradeOrdinal)` to enforce ordinal monotonicity per day per account.
   - Migration backfills columns from parent `trades` table, then makes columns NOT NULL.

2. **Action change**: Wrapped Hawks sidecar insert in a retry loop (max 3 attempts) that:
   - Catches Postgres error code `23505` (unique constraint violation)
   - Recomputes `dailyTradeOrdinal` with a fresh `COUNT(*)` query
   - Retries the insert with the new ordinal
   - Throws with cause chain after max retries exhausted

3. **Test**: Added unit test `hawks-ordinal-race-condition.test.ts` validating the schema constraint and retry logic.

**Prevention:**

- **Read-then-write race: add constraints, not just sequences.** Sequences (`nextval()`) prevent collisions only if the sequence is central. When you compute a value client-side from a read (`count()`), the window between read and write is vulnerable. Add a unique constraint on the computed value to catch and recover from collisions.
- **Retry transactional writes on constraint violations.** PostgreSQL error code `23505` is retriable: recompute the conflicting value and retry. This is cheaper than a two-phase lock or a distributed sequence.
- **Denormalize for enforcement.** If an attribute like `tradingDay` is "derived from parent," and you need to enforce uniqueness on it, make it an explicit column. Computed columns in constraints are not portable; explicit columns + FK to parent are.
- **Test concurrency separately from unit tests.** Manual testing with two browser tabs hitting the same endpoint within milliseconds is the easiest way to verify a retry loop works; unit mocks can only simulate the failure path.

**Related Files:** `src/app/actions/trades.ts`, `src/db/schema.ts`, `src/db/migrations/0005_boring_wasp.sql`, `src/__tests__/actions/hawks-ordinal-race-condition.test.ts`

---

## [BUG-2026-05-15] Hawks backtest stop reference was 1 brick back instead of 2 — R-multiples silently inflated 2×

**Severity:** High (silent correctness) | **Affected:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts`, `src/lib/backtest/engine.ts`, `src/lib/backtest/presets/hawks-presets.ts`, `src/types/backtest.ts`, `src/__tests__/lib/backtest/hawks-engine.test.ts`

**Cause:** The Hawks v0 entry module set `signal.stopReference = candle.open` for both long and short signals. The author's mental model was "Renko geometry: open = previous brick's close = 1 brick back, no lookup needed." But the Hawks methodology defines 1R as **2 Renko boxes against** — geometrically the price distance to "one reversal Renko closing against" is two brick bodies (1 body to retrace the entry brick + 1 body to print the reversal brick). The implementation captured half the intended risk.

**Effect:** Every Hawks backtest run since v0 shipped:

- Reported R-multiples that were **2× inflated** (e.g. a "1.7R win" was actually 0.85R of true Hawks risk).
- Sized positions **2× too large** under monetary-risk sizing — stop distance flows into `monetary-risk.ts:16` as `floor(riskAmountCents / (stopDistance × valuePerPointCents))`; doubling the stop halves the lots.
- Hit-rate for `r_multiple` targets was unaffected (the multiplier scales with whatever stop we feed in), but the _interpretation_ was wrong: "2R target" was effectively 4 brick bodies, not the methodology's true 2R.

Real-trade journal data was NOT corrupted: `tradeHawksMetadata` stores only categorical conditions (vwapRespected, ajusteRespected, scenarioId, biasAtEntry, etc.), and trade R-multiples on real trades come from user-entered entry/stop/exit on the `trades` table — methodology code never wrote there.

**Solution:**

1. Changed `signal.stopReference` in `hawks-triple-screen.ts` from `candle.open` to `2 * candle.open - candle.close` for both long and short (symmetric: long → bullish brick → formula yields stop below entry; short → bearish brick → formula yields stop above entry). One brick body below (or above) the entry brick's open = the 2-brick distance from the entry close.
2. Added `engineVersion?: string` to `BacktestResult`. Engine stamps `"hawks-v0.2"` on every Hawks backtest result so cached screenshots/exports remain traceable to the math that produced them. No DB migration needed because backtest results are ephemeral (no `backtestResults` table).
3. Updated all narrative comments: entry-module docstring, preset docstring + inline `points=0` comment, `HawksTripleScreenConfig` JSDoc in `types/backtest.ts`. All now describe "Stop = 2 bricks back, Hawks 1R = 2 Renko".
4. Re-baselined the two `stopReference` assertions in `hawks-engine.test.ts` (long: `129950 = 2·130000 − 130050`; short: `130100 = 2·130050 − 130000`).

**Prevention:**

- **Methodology constants in entry modules, not in engine.** The bug lived in one place — the entry module's signal construction — exactly because we put Hawks-specific stop logic there. Resist the temptation to push it into shared engine code; the engine's `r_multiple` math correctly scales with whatever stop the entry module names.
- **Doc the geometric derivation alongside the formula.** The original comment said "open = prev brick close = 1 brick back" — technically true but answered a different question. The corrected comment names the Hawks 1R = 2 Renko convention so a future reader sees what the formula is enforcing, not just what it computes.
- **R vs Renko terminology is a footgun**: 1R = 1 risk unit (= the stop distance, methodology-dependent); 1 Renko = 1 brick (the chart primitive). In Hawks specifically, 1R = 2 Renko. Other methodologies may pick other ratios. The engine and shared types stay R-agnostic; only the methodology entry module knows the conversion.
- **Engine version stamping is now available** for any future methodology revision: bump the stamped string and the UI can warn on stale exports without us needing a migration each time.

**Related Files:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts`, `src/lib/backtest/engine.ts`, `src/lib/backtest/presets/hawks-presets.ts`, `src/types/backtest.ts`, `src/__tests__/lib/backtest/hawks-engine.test.ts`

---

## [BUG-2026-05-13] New accounts cannot create annual plans — capital not initialized

**Severity:** High | **Affected:** `src/components/fractal-plan/yearly-plan-editor.tsx`, `src/components/fractal-plan/cockpit/yearly-plan-slideover.tsx`, `src/components/fractal-plan/cockpit/setup-summary-card.tsx`, `src/app/actions/accounts.ts`

**Cause:** The `trading_accounts` table has `startingBalanceCents` and `accountStartYear` columns, but these were never exposed in the yearly plan creation UI. The `YearlyPlanEditor.handleSubmit()` guard checked `accountCapitalAvailable` (derived from `defaultInitialCapitalCents`), which would be `null` for new accounts. The form then blocked plan creation with an off-screen toast: "Initial capital is required but not available."

The account setup flow never gave users a chance to input their starting balance before attempting plan creation.

**Effect:** New accounts hit an invisible blocker: create plan → guard fails → nothing happens except an unseen error toast. User cannot proceed without contacting support to manually set the starting balance.

**Fix:**

1. Created new server action `setAccountStartingBalance(accountId, startingBalanceCents, accountStartYear)` in `src/app/actions/accounts.ts` — persists the starting balance and account start year.
2. Extended `YearlyPlanEditor` props to accept `accountId: string`.
3. Added `initialCapitalReais` to form state, initialized to `""` (empty).
4. Added conditional input in the capital section: `{!existing && !accountCapitalAvailable && (<Input ...>)}` — shown only when creating a NEW plan AND account has no capital set.
5. Modified `handleSubmit()` to:
   - Validate both withdrawal amount (if existing) AND initial capital (if new account)
   - Call `setAccountStartingBalance()` before creating the plan
   - Set `accountStartYear` to current year
6. Threaded `accountId` through `SetupSummaryCard` → `YearlyPlanSlideover` → `YearlyPlanEditor`.

**Prevention:** When a feature has a persistence layer (DB column), ensure there's a UI path to input that data. Don't assume initialization happens elsewhere. For new entity workflows, review the full initialization checklist.

**Related Files:**

- `src/app/actions/accounts.ts`
- `src/components/fractal-plan/yearly-plan-editor.tsx`
- `src/components/fractal-plan/cockpit/yearly-plan-slideover.tsx`
- `src/components/fractal-plan/cockpit/setup-summary-card.tsx`
- `src/app/[locale]/(app)/plan/[year]/page.tsx`

---

## [BUG-2026-02-25] Encryption works in dev but returns null/zero in production

**Severity:** Critical | **Affected:** `src/lib/crypto.ts`, `src/lib/user-crypto.ts`, `next.config.ts`, all server actions using encryption

**Cause:** Two compounding issues:

1. `import { ... } from "crypto"` (bare specifier) — Turbopack in prod potentially shims instead of resolving Node.js built-in. Dev mode has different resolution behavior.
2. `decrypt()` had bare `catch { return null }` — when `createDecipheriv` failed, error swallowed silently.

**Cascade:** `getUserDek` returns null → server actions skip decryption → ciphertext passes to `fromCents()` → `parseInt("FqIGpq...")` → `NaN` → falls back to `0`.

**Effect:** All monetary values show R$0 | User name shows ciphertext | App appears functional but displays wrong data.

**Fix:**

1. `import { ... } from "crypto"` → `from "node:crypto"` in `src/lib/crypto.ts`
2. `console.error` in `catch` block of `decrypt()`
3. Diagnostic logging in `getUserDek()` on null return
4. `serverExternalPackages: ["bcryptjs"]` in `next.config.ts`

**Prevention:** Always use `node:` prefix for Node built-in imports. Never bare `catch { return null }` in security-critical paths. Add build-time encrypt/decrypt round-trip smoke test.

**Related:** `src/lib/crypto.ts`, `src/lib/user-crypto.ts`, `next.config.ts`, `src/app/actions/*`

---

## [BUG-2026-02-25] Non-admin users blocked on Settings page

**Severity:** High | **Affected:** `src/app/[locale]/(app)/settings/page.tsx`, `src/app/actions/seed-risk-profiles.ts`

**Cause:** `seedBuiltInRiskProfiles()` threw `new Error("Unauthorized: admin access required")` for non-admin users (line 52). `settings/page.tsx` called it unconditionally on every render despite having `isAdmin` available from `getCurrentUser()` in same `Promise.all`.

**Effect:** Non-admin users saw unhandled server error on Settings page — entire page failed to render.

**Fix (defense in depth):**

1. `seed-risk-profiles.ts`: changed throw → `return []` for non-admin (safe to call from any context, per its own JSDoc).
2. `settings/page.tsx`: added `if (user?.isAdmin)` guard before calling.

**Prevention:** Server actions callable from shared pages → early return on auth, never throw. Use available user role info as gatekeeper before calling role-restricted fns.

**Related:** `src/app/[locale]/(app)/settings/page.tsx`, `src/app/actions/seed-risk-profiles.ts`

---

## [BUG-2026-03-07] Zod discriminated union missing `gainSequence` variant

**Severity:** High | **Affected:** `src/lib/validations/risk-profile.ts`, `src/app/actions/risk-simulation.ts:110`

**Cause:** TypeScript `GainMode` type has 3 variants (`compounding`, `singleTarget`, `gainSequence`). Zod `gainModeSchema` only included 2 (`compounding`, `singleTarget`). Risk simulation with `gainMode.type = "gainSequence"` → `riskSimulationParamsSchema.parse()` → discriminated union no match → `"No matching discriminator"`.

**Effect:** Any simulation using "Gain Sequence" gain mode failed at validation layer. Other modes unaffected.

**Fix:** Added `gainSequence` variant to `gainModeSchema`:

```typescript
z.object({
	type: z.literal("gainSequence"),
	sequence: z.array(lossRecoveryStepSchema).max(10, "Maximum 10 gain steps"),
	repeatLastStep: z.boolean(),
	stopOnFirstLoss: z.boolean(),
	dailyTargetCents: z.number().int().positive().nullable(),
})
```

Also fixed `scaleDecisionTree` in `risk-params-form.tsx` — missing `gainSequence` branch left steps unscaled on balance adjustment.

**Prevention:** Adding new TypeScript discriminated union variant → update Zod schema in same PR. Consider co-locating or generating one from the other. Test each variant against schema.

**Related:** `src/types/risk-profile.ts`, `src/lib/validations/risk-profile.ts`, `src/app/actions/risk-simulation.ts:110`, `src/components/risk-simulation/risk-params-form.tsx`

---

> **[FIX-2026-04-21]** `Severity: Medium` — **Affected:** `src/__tests__/setup.ts`, `src/__tests__/lib/email-verification.test.ts`, `src/__tests__/lib/auth-actions.test.ts`, `src/__tests__/lib/auth-config.test.ts`
> **Report:** 44 unit test failures (20+15+9) — `getTranslations is not supported in Client Components` from `next-intl/server` in Vitest node env. Compounded by stale mocks after `auth.ts` refactor.
> **Fix:** (1) Global `vi.mock("next-intl/server", ...)` in `src/__tests__/setup.ts` with `TRANSLATION_MAP` aligned to `messages/en.json`. (2) `email-verification.test.ts`: `maxAttempts === 3` → `maxAttempts === 2`. (3) `auth-actions.test.ts`: `loginUser` no longer gates on `emailVerified`; `registerUser` uses direct `db.insert()` (not transaction); `needsVerification` always `false`.
