# Backend Post-Mortem Log

---

## [BUG-2026-05-26-3] Hawks engine crashed on first sparse-indicator candle instead of skipping

**Date:** 2026-05-26
**Severity:** High (any backtest run on a 5m source that had even a single empty `mme27_60m` cell crashed the engine before producing trades)
**Affected Area:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts:41-58,77-78`

### What happened

Running a Hawks backtest on the 5m source threw `HawksTripleScreen: indicator "mme27_60m" not found in candle data. Check requiredIndicators config and CSV import mappings.` and aborted with zero trades emitted.

### Root cause

The Hawks 5m CSV maps `mme27_60m` at column index 5 in the loader, so most rows have it. But the BR CSV has sparse cells (empty leading rows before the EMA stabilizes, end-of-week gaps), and `parseBrNumber` returns `null` for empty cells — the loader's `stripNulls` drops them from the row's `indicators` JSONB, so those rows arrive at the engine with the key absent.

`guardIndicatorKeys` then ran on every "first in-window candle of the day", treated `undefined` as a misconfigured import, and threw. A single empty cell anywhere in the run was enough to bomb the whole backtest.

### Why this is the wrong semantics

A misconfigured import produces ZERO candles with the key. A genuinely-imported but sparse column produces SOME candles with the key. These two states need different handling: the first is a hard error, the second is "no signal on that bar" — which is also what the original entry conditions imply (you can't fire a long when you don't know the 60m EMA value).

### Fix

Replaced the throw-on-undefined guard with a per-candle tolerance check. Each indicator read uses `typeof x !== "number"` to detect both `undefined` (missing key) and `null` (sparse cell). When any of the four required indicators is non-numeric, the function returns `{ state, signal: null }` — same effect as "entry conditions failed", no error.

The guard function was removed entirely; misconfigured imports surface as "zero signals across the run", which is more honest than a hard crash on candle #1 and lets the user see partial output (where indicators existed) instead of nothing.

### Verification

Driven by Playwright through the full flow on a real dev server:

- Selected Hawks Triple Screen strategy + WIN 5m source + date range 2026-05-04 → 2026-05-13.
- "Executar Backtest" produced **7 trades** instead of a crash.
- Triple-screen inspector mounted with all three Renko panes (5m=20pts, 15m=36pts, 60m=84pts).
- Overview chart rendered with all 7 trade markers.
- Console: 0 errors related to the inspector, the engine, or charts. The only console error was a pre-existing React DOM warning about a `<script>` tag inside `next/dist`.

### Lessons / guardrails

- **Hard-throw on a per-candle data-shape check is almost always wrong.** Treat sparse cells as "no signal" and let the absence of signals downstream tell the story. Reserve throws for "this config is impossible" (zero candles have the key in the entire dataset).
- This also makes the engine work uniformly across data sources of different completeness (pipeline-generated Renko bricks with 100% indicator coverage, CSV-loaded candles with sparse columns, partial backfills).
- The runtime-tolerance pattern + the zero-signal observability give the same protection as the guard without the brittleness.

---

## [BUG-2026-05-26-1] `ReferenceError: InspectorWindow is not defined` — `"use server"` files cannot export types

**Date:** 2026-05-26
**Severity:** High (broke the entire `/backtest` page with a 500 error after introducing the Hawks inspector)
**Affected Area:** `src/app/actions/inspector-data.ts`, `src/components/backtest/inspector/triple-screen-inspector.tsx`

### What happened

Loading `/backtest` blew up with:

```
ReferenceError: InspectorWindow is not defined
  at .next/dev/server/.../actions.js (server actions loader):37:1
  > 37 | export {getInspectorWindow as '40…'} from 'ACTIONS_MODULE8'
       | ^
```

The new `src/app/actions/inspector-data.ts` had `"use server"` at the top and a trailing `export type { InspectorWindow, InspectorCandleRow, InspectorBrickSizes }` block at the bottom. tsc was happy; lint was happy. Next.js's server-actions loader was not.

### Root cause

A `"use server"` module is treated as a **server-action manifest**: Next.js's compiler scans every top-level `export` and tries to register it as an RPC-callable async function. Type-only exports (`export type { ... }`) survive TS strip but get re-emitted as plain `export {Name}` in the runtime bundle. The actions loader then evaluates that re-export and looks up `InspectorWindow` as a runtime value — which doesn't exist, since it was an interface. → `ReferenceError` at the manifest's first module evaluation, crashing the whole page (not just the action).

The build-time check that catches `export const foo = "bar"` from a `"use server"` file does **not** catch `export type { ... }`, so it slipped past lint + tsc + Next's own server-action validator. The runtime is where it surfaced.

### Why we didn't catch it earlier

- `tsc --noEmit` only validates the TS layer, where `export type` is legal.
- `pnpm lint` has no rule that forbids non-action exports from `"use server"`.
- Local dev server compiled the route fine; the crash only fires on **first POST** to the page (i.e., when the server-actions manifest is actually loaded). The page renders briefly, then the boundary catches the manifest error.

### Fix

1. Extracted the four interfaces (`InspectorCandleRow`, `InspectorBrickSizes`, `InspectorWindow`, `OverviewWindow`) into a new `src/types/inspector.ts`.
2. `inspector-data.ts` now `import type`s them — no value-or-type export survives at the bottom.
3. Consumer (`triple-screen-inspector.tsx`) imports types from `@/types/inspector` instead of `@/app/actions/inspector-data`.

### Lessons / guardrails

- **`"use server"` files can ONLY export async functions.** Not types, not interfaces, not constants, not enums, not re-exports. If you wrote one and TS won't infer `Promise<…>` for it, it doesn't belong in that file. Co-locate types in a sibling `*.types.ts` or in `src/types/`.
- The failure mode is brutal: not "this action doesn't work" — the whole route crashes at module evaluation. So this needs to be a habit, not a "I'll catch it in review" rule.
- Gotcha logged in `docs/gotchas.md` under "Next.js / Server Actions" with the exact symptom so the next person who pattern-matches "`ReferenceError: X is not defined` from `actions.js (server actions loader)`" finds the diagnosis in seconds.

---

## [BUG-2026-05-25-3] Strategy creation fails silently — Neon HTTP driver lacks transaction support

**Date:** 2026-05-25
**Severity:** Critical (breaks core feature in production, works in dev)
**Affected Area:** `src/db/drizzle.ts`, `src/app/actions/strategies.ts:91`, `src/app/actions/strategies.ts:450`, `src/app/actions/renko-pipeline.ts:325`, `src/app/api/arch/strategies/create/route.ts:29`

### Cause

The Neon HTTP driver (`drizzle-orm/neon-http`) does not support `db.transaction()`. The HTTP protocol has no notion of multi-statement transactional semantics; each query is independent. The codebase relied on four transaction call sites to atomically insert related records (strategy + version + conditions in a single hit) and read intermediate results to construct subsequent inserts.

In production, the driver is `neon-http` (chosen for low latency / stateless HTTPS). In local worktrees and CI, the driver falls back to `postgres-js` (which supports transactions), so the bug never surfaced during development or testing.

All four call sites caught the error internally and returned a structured error response (status 200 with `{ status: "error" }`), so the API didn't crash — but the records were never inserted, and the user saw no visible error (the action returned a success toast that didn't trigger).

### Effect

- User navigates to `/en/playbook/new`, fills in strategy details, submits the form
- `createStrategy` server action runs, calls `db.transaction()`, which throws `Error: No transactions support in neon-http driver`
- The error is caught and logged internally; the action returns `{ status: "error" }`
- Browser receives HTTP 200 with a structured error, but the form doesn't display the error (it was swallowed by the action's error handler)
- Strategy is never created
- User sees no feedback and clicks submit again, repeating the cycle

Three other endpoints are affected:

- `/en/playbook/:id/edit` — `updateStrategy` with versioning
- Bulk Renko candle import — `renko-pipeline.ts`
- Admin/automation API — `POST /api/arch/strategies/create`

### Solution

Swapped the Neon driver from `neon-http` (HTTPS-based, stateless, no transactions) to `neon-serverless` (WebSocket-based, stateful, full transaction support).

**Changes:**

1. `pnpm add @neondatabase/serverless ws && pnpm add -D @types/ws`
2. Updated `src/db/drizzle.ts`:
   - Replaced `import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http"` with `import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless"`
   - Added `import { neonConfig } from "@neondatabase/serverless"` and configured `neonConfig.webSocketConstructor = ws` for Node runtime (production uses Node; Edge runtime has built-in WebSocket)
   - Updated exported type from `NeonHttpDatabase<typeof schema>` to `NeonDatabase<typeof schema>` (maintains compatibility with all ~13 call sites)
   - Updated comment block to document transaction support now available
3. No changes to the four transaction call sites — they just work now

**Rationale:** Both drivers point to the same Neon URL (via `DATABASE_URL`). The serverless driver uses a long-lived WebSocket instead of per-query HTTP, enabling transactional semantics. Performance impact is negligible (WebSocket connection is established once per server lifecycle, not per query).

### Prevention

- **Driver choice cascades to feature availability.** The `neon-http` driver is marketed as "low latency" but silently lacks transactions. Always check the driver's capability matrix before committing to one in production.
- **Test transaction call sites in CI.** The local fallback (`postgres-js`) masks driver-specific limitations. Spin up a Neon test database in CI and test with the production driver profile, or at minimum add a unit test that exercises `db.transaction()` with mocked delay.
- **Audit error handlers.** All four transaction sites were silently catching errors instead of propagating them. In hindsight, a test that intentionally breaks `db.transaction()` would have caught this before production.

### Related Files

- `src/db/drizzle.ts` — driver initialization and configuration
- `src/app/actions/strategies.ts:91, 450` — `createStrategy`, `updateStrategy`
- `src/app/actions/renko-pipeline.ts:325` — bulk Renko insert
- `src/app/api/arch/strategies/create/route.ts:29` — admin API
- `package.json` — added `@neondatabase/serverless`, `ws`, `@types/ws`

---

## [BUG-2026-05-25-2] Settings save redirects to login — JWT cookie corrupted by concurrent auth() calls

**Date:** 2026-05-25
**Severity:** High (randomly blocks settings save + forces re-login, breaks user workflow)
**Affected Area:** `src/components/settings/settings-save-bar.tsx`, session/cookie handling (NextAuth + proxy.ts)

### Cause

The master save bar runs `Promise.allSettled(dirty.map((s) => s.save()))` — multiple concurrent server actions fire in parallel. Each server action calls `requireAuth()` at its start, which calls `auth()` (from NextAuth). With `strategy: "jwt"` and `maxAge: 7 days`, NextAuth may refresh the session cookie on every `auth()` call. When two or more server actions execute concurrently:

1. Both read the current JWT cookie from the request
2. Both decode and validate the JWT (via `auth()`)
3. Both prepare `Set-Cookie` response headers with the refreshed JWT
4. Browser receives overlapping headers; the last one wins, potentially writing a corrupted/partial JWT

The corrupted JWT payload may be missing `userId` or have a bad signature. On the next request to the Edge runtime (middleware in `proxy.ts`), the `authorized()` callback tries to decode the JWT, gets an empty/falsy `auth.user`, and redirects to `/login?callbackUrl=...`.

This manifests 20-30 seconds after the settings save (after page navigation), because the browser doesn't send the cookie to the Edge on every request — only the next navigation triggers the decode, and by then the cookie is stale.

### Effect

User saves account settings via the master Save bar. Immediately after (or within seconds of navigating to a new route like `/plan/2026/2`), they are redirected to login with the original path as callbackUrl. The session cookie is still present in DevTools (browser hasn't cleared it), but the JWT inside is corrupted. User must log in again.

### Solution

Serialize the saves in the save bar using a sequential `for-of` loop instead of `Promise.allSettled`. Each server action now runs to completion before the next one starts, ensuring:

- Only one `auth()` call is in flight at a time
- Only one `Set-Cookie` header is written per save cycle
- No overlapping cookie writes

Error collection and reporting remain the same: all errors are gathered and surfaced in a single toast at the end.

**File changed:** `src/components/settings/settings-save-bar.tsx`

- Replaced `Promise.allSettled(dirty.map((s) => s.save()))` with a `for-of` loop that awaits each section's save sequentially
- Maintained error aggregation: results array collects `{ status, value/reason }` for each section
- Added ESLint disable comment on the `await` inside the loop with explanation

### Prevention

- **Avoid concurrent server actions that call `auth()`.** Refreshing a JWT is not idempotent in the presence of overlapping `Set-Cookie` headers. If multiple sections save in parallel and each calls `requireAuth()`, you risk cookie corruption.
- **Batch mutations by scope.** If a UI pattern allows multiple independent saves, serialize them rather than parallelizing. The UX cost (slightly slower save) is negligible; the correctness cost is high.
- **Document JWT refresh timing.** The 20-30 second delay before the redirect happens because the browser doesn't validate cookies locally; it only fails when the Edge tries to decode a corrupted JWT on the next request. This lag made the bug hard to trace back to the save.

### Related Files

- `src/components/settings/settings-save-bar.tsx` — the fix
- `src/components/settings/account-settings.tsx`, `src/components/settings/user-profile-settings.tsx`, `src/components/settings/annual-reporting-settings.tsx` — registered sections that save via this bar
- `src/app/actions/settings.ts`, `src/app/actions/accounts.ts` — server actions that call `requireAuth()`
- `src/auth.ts`, `src/auth.config.ts` — NextAuth JWT refresh logic
- `src/proxy.ts` — Edge runtime auth check where the redirect fires

---

## [BUG-2026-05-25-1] Account default asset save fails with `validation.account.invalidAssetId`

**Date:** 2026-05-25
**Severity:** High (blocks any save in Settings → Conta whenever a default asset is selected)
**Affected Area:** `src/lib/validations/account.ts`, `messages/en.json`, `messages/pt-BR.json`

### Cause

Schema mismatch between the storage layer and the input validator.

- DB column `tradingAccounts.defaultAsset` is `varchar("default_asset", { length: 20 })` (`src/db/schema.ts:243`) — designed to store the asset **symbol** (e.g. `"WIN"`).
- All read paths treat it as a symbol: `command-center-tabs.tsx:61` reads `account.defaultAsset` into a variable literally named `defaultAssetSymbol`, and `scaled-trade-form.tsx:115` does `assets.find((a) => a.id === defaultAssetId || a.symbol === defaultAssetId)`.
- The Settings form (`account-settings.tsx:471`) populates `<SelectItem value={asset.symbol}>`, so the form submits the symbol on save.
- But `createAccountSchema.defaultAsset` in `src/lib/validations/account.ts` required `.uuid("validation.account.invalidAssetId")`. Any symbol-shaped value (3–6 chars, not a UUID) failed validation, surfacing the toast "validation.account.invalidAssetId".

The bug was latent: it only fired when the user actually picked an asset. Saving with "Nenhum" (which sends `""` / `null`) bypassed the UUID check via `.optional()`/`.nullable()`.

### Effect

Account settings could not be saved whenever the user selected a default asset. The error toast displayed the raw i18n key (`validation.account.invalidAssetId`) because the server action returns the Zod issue message verbatim and no client formatter resolves nested validation keys here. Users hit a dead end on a core preference.

### Solution

1. Replaced the `.uuid()` validator with `.max(20)` to match the DB column width and the actual data shape (symbol string).
2. Removed the now-unused `invalidAssetId` key from the `validation.account` block in both locales and added `defaultAssetMax` for the new constraint.

No DB migration needed — storage was already correct; only the validator was wrong.

### Prevention

- When the Zod error key contains "Id" but the column is a `varchar`, that's a smell: the validator name has drifted from the schema. Audit other `*.uuid(...)` calls against actual column types.
- Long-term: store the asset by FK (`asset_id uuid references assets(id)`) instead of by symbol — symbols can collide across markets and are mutable. Logged in `docs/backlog.md` as a follow-up rather than retrofitted here, to keep the bug fix surgical.

### Related Files

- `src/lib/validations/account.ts`
- `src/db/schema.ts` (reference)
- `src/components/settings/account-settings.tsx` (reference)
- `messages/en.json`, `messages/pt-BR.json`

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
4. Re-baselined the two `stopReference` assertions in `hawks-engine.test.ts` (long: `129950 = 2·130000 − 130050`; short: `130100 = 2·130050 − 130000`). _(These were subsequently updated again — see open follow-up below.)_

**Open follow-up (shipped 2026-05-21):** The strict Profit Pro 9+1 geometry adds `+1 tick` inward vs. the 2-brick-body formula — i.e. `2·open − close + tickSize` (long) and `2·open − close − tickSize` (short). Applied in the same entry module; `_tickSize` parameter (previously unused placeholder) renamed to `tickSize` and consumed. Assertions re-baselined: long `129955`, short `130095` (tickSize=5 in tests). Effect is cosmetic at points fidelity (~5% of brick body) but matches methodology spec exactly.

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
