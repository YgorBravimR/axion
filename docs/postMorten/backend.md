# Backend Post-Mortem Log

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
