# Fee Config Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `accountFeeRates` the sole source of truth for per-contract trading costs. Remove legacy `tradingAccounts.defaultCommission`/`defaultFees` columns, `accountAssets.commissionOverride`/`feesOverride` columns, and the legacy fee UI section. Move the new `<FeeRateForm>` from Profile to Accounts tab.

**Architecture:** Three phases, each its own commit boundary. Phase 1 = UI move (no DB writes change). Phase 2 = swap trade-insertion source via new `resolveFeeSnapshot` helper plus an idempotent backfill migration. Phase 3 = drop legacy columns + dead code. Past trade snapshots stay immutable; only forward writes change.

**Tech Stack:** Next.js 16 server actions, Drizzle ORM, Vitest, PostgreSQL, next-intl.

**Spec:** `docs/superpowers/specs/2026-05-05-fee-config-unification-design.md`

**Branch:** `feat/yearly-tax-reporting`

**Critical operational notes:**
- `bun run test:unit` runs Vitest. `bun run test` runs Playwright (don't use during this work).
- `bun run db:migrate` hangs in non-TTY. Apply migrations via `set -a && source .env && set +a && psql "$DATABASE_URL" -f src/db/migrations/<file>.sql`.
- `bun run db:generate` is interactive — confirm renames/drops at the prompt. If non-TTY, run from a real terminal first, then commit.
- Each task its own commit with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer (except Phase 2 multi-site swap, which is a single atomic commit).
- The legacy `getAssetFees` function at `accounts.ts:779–836` is the chokepoint. 4 known callers: `csv-import.ts:161`, `trades.ts:1119`, `trades.ts:2206`, `risk-simulation.ts:160`. Internal `trades.ts:1232–1238` reads `assetConfig.commission/fees` from a different `assetMap` path — Task 2.4 audits and swaps it.
- `user-crypto.ts:174–195` encrypts/decrypts `defaultCommission`/`defaultFees`. Phase 3 drops these from the field list.

---

## File Structure

### Phase 1 — UI move (one commit)

- Modify: `src/components/settings/account-settings.tsx`
  - Remove "Default Commission & Fees" section (~lines 616–700) and per-asset override editor (~lines 175–270, the `getAssetFees` function plus `assetFeesForm`-driven UI).
  - Embed `<FeeRateForm />` import + render where the legacy section lived.
- Modify: `src/components/settings/user-profile-settings.tsx`
  - Drop `import { FeeRateForm }` (line 19) and the `<FeeRateForm />` render at line 435.
- Modify: `messages/en.json`, `messages/pt-BR.json`
  - Drop the now-unused legacy keys at `defaultFees`/`defaultFeesDesc` in the Accounts namespace (~lines 2546–2547 in en.json, same in pt-BR). Keep the second pair at line 4018 if used elsewhere; verify via grep.

### Phase 2 — Swap insertion source (two commits: helper + atomic swap)

- Create: `src/lib/tax/fee-resolver.ts`
  - Export `resolveFeeSnapshot({ accountId, assetSymbol })` returning `{ commissionCents, feesCents }`.
- Create: `src/__tests__/lib/tax/fee-resolver.test.ts`
  - Cases: per-asset row hit, NULL-symbol fallback, hardcoded `ASSET_FEE_DEFAULTS` fallback, zero last-resort.
- Modify: `src/app/actions/accounts.ts:779–836` (`getAssetFees`)
  - Replace internal lookup with `resolveFeeSnapshot`. Keep function signature stable (callers don't change).
- Modify: `src/app/actions/trades.ts:1232–1238` (the `assetConfig.commission/fees` reading site within the import loop) — audit `assetMap` source to confirm it's already fed by `getAssetFees`; if not, swap to call resolver inline.
- Create: `src/db/migrations/0038_backfill_account_fee_rates.sql` (hand-written for explicit control)
  - Idempotent INSERT … ON CONFLICT DO NOTHING into `account_fee_rates` for every `(accountId, NULL)` pair missing.
- Modify (auto): `src/db/migrations/meta/_journal.json` and `src/db/migrations/meta/0038_snapshot.json` after `bun run db:generate` (will be a no-op since hand-written migration is data-only and not schema-changing — see Task 2.5).

### Phase 3 — Drop legacy (one commit)

- Modify: `src/db/schema.ts`
  - `tradingAccounts`: drop `defaultCommission` (line ~188), `defaultFees` (line ~189).
  - `accountAssets`: drop `commissionOverride` (line ~316), `feesOverride` (line ~317). Keep `breakevenTicksOverride` (line 318).
- Generate: `src/db/migrations/0039_drop_legacy_commission_fees.sql` via `bun run db:generate`.
- Modify: `src/lib/user-crypto.ts:177` — remove `"defaultCommission"`, `"defaultFees"` from `accountEncryptedFields` array. Lines 194–195 — remove the two decrypt entries.
- Modify: `src/app/actions/accounts.ts`
  - Drop `defaultCommission?`/`defaultFees?` from input types (lines ~49–50).
  - Drop assignment lines ~128–129, ~150–151, ~228–229.
  - Drop `commissionOverride?`/`feesOverride?` from input types (lines ~61–62).
  - Drop assignment lines ~510–511, ~571–572, ~584–585.
  - In `getAssetFees`, drop the legacy decryption block (lines ~799–836). Function should now be a thin wrapper that just calls `resolveFeeSnapshot` and reshapes — or delete entirely if no remaining callers (audit at Task 3.5).
- Modify: `src/app/api/arch/accounts/[id]/route.ts` — drop the two override fields from response (lines ~61–62).
- Modify: `src/types/index.ts:366–367` — drop `defaultCommission` / `defaultFees` from the account type.
- Modify: `src/__tests__/**` — fixture builders that set the dropped fields. Specific files identified by Task 3.6 grep audit.
- Modify: `messages/en.json`, `messages/pt-BR.json` — drop remaining legacy keys at line ~4018 (`defaultFees`/`defaultFeesDesc` in account-detail namespace).
- Create or modify: `src/__tests__/lib/schema-shape.test.ts` (or extend `schema-types.test.ts`) — assert `MonthlyRiskConfig` shape and `tradingAccounts` shape no longer include the dropped fields.

---

## Phase 1 — Move new form to Accounts tab

### Task 1.1: Embed `<FeeRateForm>` in Accounts tab and remove legacy commission/fees UI

**Files:**
- Modify: `src/components/settings/account-settings.tsx`
- Modify: `src/components/settings/user-profile-settings.tsx`

- [ ] **Step 1: Read the current legacy section to understand its surface**

```
grep -n "Default Commission\|defaultCommission\|defaultFees\|assetFeesForm\|Per-Asset Overrides" src/components/settings/account-settings.tsx
```

Expected: confirms the section is at ~lines 616–700, plus per-asset editor at ~lines 175–270.

- [ ] **Step 2: Add the import for `<FeeRateForm>`**

In `src/components/settings/account-settings.tsx`, add to the existing import block:

```tsx
import { FeeRateForm } from "@/components/tax"
```

- [ ] **Step 3: Replace the legacy "Default Commission & Fees" section with `<FeeRateForm />`**

Find the JSX block starting with `{/* Default Commission & Fees */}` at line 616 and ending where the per-asset overrides editor starts. Replace the entire commission/fees block (commission input, fees input, breakeven tick input — keep the breakeven ticks input, remove only commission and fees inputs) with:

```tsx
{/* Trading Costs (BR) */}
<div className="rounded-xl border border-txt-300/15 bg-bg-200/30 p-m-400">
    <h3 className="text-body font-semibold text-txt-100 mb-m-300">
        {t("tradingCosts")}
    </h3>
    <FeeRateForm />
</div>
```

Keep the breakeven ticks input as a separate, sibling element.

- [ ] **Step 4: Remove per-asset commission/fees override editor**

Find the JSX driven by `assetFeesForm` state — the per-asset card list with `commissionOverride`/`feesOverride` inputs (~lines 175–270 of state and the render that uses it). Delete:
- The `assetFeesForm` `useState` declaration
- The `getAssetFees` local helper (line 279)
- The `handleSaveAssetFees` handler (uses `commissionOverride`/`feesOverride`)
- The JSX block rendering per-asset cards
- Any related state for "edit override" / "remove override"

Keep:
- Per-asset breakeven ticks override UI (if present as a separate element).
- The asset list rendering itself if used for breakeven ticks.

If breakeven ticks UI is interleaved with commission/fees UI, refactor: extract a new lean component `<PerAssetBreakevenTicks />` inline at the end of this task that only handles `breakevenTicksOverride`. Don't extract to a separate file unless it exceeds 50 LOC.

- [ ] **Step 5: Remove `defaultCommission`/`defaultFees` from form state**

In the `accountForm` `useState` at lines 85–86:

```tsx
defaultCommission: "0",
defaultFees: "0",
```

Delete those two lines.

- [ ] **Step 6: Remove load/save logic for commission/fees**

Lines 122–125 (load):

```tsx
defaultCommission: fromCents(
    accountData.defaultCommission
).toString(),
defaultFees: fromCents(accountData.defaultFees).toString(),
```

Delete.

Lines 156–159 (save):

```tsx
defaultCommission: toCents(
    parseFloat(accountForm.defaultCommission) || 0
),
defaultFees: toCents(parseFloat(accountForm.defaultFees) || 0),
```

Delete.

Lines 295–296 (display):

```tsx
commission: fromCents(account?.defaultCommission || 0),
fees: fromCents(account?.defaultFees || 0),
```

Delete (and any usage of these computed values in JSX).

Lines 584–587 (re-init on account switch):

```tsx
defaultCommission: fromCents(
    account.defaultCommission
).toString(),
defaultFees: fromCents(account.defaultFees).toString(),
```

Delete.

- [ ] **Step 7: Remove `<FeeRateForm>` from Profile**

In `src/components/settings/user-profile-settings.tsx`:

Line 19 — delete:

```tsx
import { FeeRateForm } from "@/components/tax"
```

Line 435 — delete:

```tsx
<FeeRateForm />
```

If wrapping JSX (heading + container) became empty, delete that container too. Verify the surrounding section still renders coherently.

- [ ] **Step 8: Add the i18n key `tradingCosts`**

In `messages/en.json` under the Accounts section near `defaultFees`, add:

```json
"tradingCosts": "Trading Costs (BR)",
```

In `messages/pt-BR.json`:

```json
"tradingCosts": "Custos de Negociação (BR)",
```

- [ ] **Step 9: Remove the now-unused legacy translation keys**

In both `messages/en.json` and `messages/pt-BR.json`, find the Accounts-namespace `defaultFees` entry around line 2546–2547:

```json
"defaultFees": "Default Commission & Fees",
"defaultFeesDesc": "These will apply to all assets unless overridden",
```

Delete those two lines from both files.

Do NOT delete the entry at line 4018 yet — Phase 3 will. (It may have other consumers; audit at Task 3.7.)

- [ ] **Step 10: Run lint and unit tests**

```
bun run lint
bun run test:unit
```

Expected: clean lint, all tests pass. If a test fixture references `defaultCommission` on an account, this is acceptable for Phase 1 since the column still exists — the test still inserts the row but the form no longer shows it. Tests should not break here.

If a UI test snapshot fails with the removed section, update the snapshot:

```
bun run test:unit -u
```

- [ ] **Step 11: Manual smoke check (operator step)**

```
bun run dev
```

Visit `/settings/accounts`. Expected: Accounts tab shows `<FeeRateForm>` (the BR tax engine form). Legacy "Default Commission & Fees" section gone. Per-asset DOL/IND/WDO/WIN override editor gone (or replaced with breakeven-only variant).

Visit `/settings/profile`. Expected: no `<FeeRateForm>` mounted; the section that used to host it is gone.

- [ ] **Step 12: Commit Phase 1**

```bash
git add src/components/settings/account-settings.tsx src/components/settings/user-profile-settings.tsx messages/
git commit -m "$(cat <<'EOF'
feat(settings): move fee-rate form to Accounts tab; remove legacy fee UI

Phase 1 of fee-config unification. UI now sources from accountFeeRates
exclusively. Legacy DB columns and writers untouched until Phase 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Swap insertion source

### Task 2.1: Create `resolveFeeSnapshot` helper with TDD

**Files:**
- Create: `src/__tests__/lib/tax/fee-resolver.test.ts`
- Create: `src/lib/tax/fee-resolver.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/tax/fee-resolver.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const findFirstMock = vi.fn()
vi.mock("@/db", () => ({
    db: {
        query: {
            accountFeeRates: {
                findFirst: findFirstMock,
            },
        },
    },
}))

import { resolveFeeSnapshot } from "@/lib/tax/fee-resolver"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"

describe("resolveFeeSnapshot", () => {
    beforeEach(() => {
        findFirstMock.mockReset()
    })

    it("returns per-asset row when present", async () => {
        findFirstMock.mockResolvedValueOnce({
            txCorretagemCents: 5,
            txRegistroCents: 74,
            emolumentosCents: 40,
            issRatePercent: "5.00",
        })
        const result = await resolveFeeSnapshot({ accountId: "acct-1", assetSymbol: "WDO" })
        // commission = 5 + round(5 * 5 / 100) = 5 + 0 = 5
        // fees = 74 + 40 = 114
        expect(result).toEqual({ commissionCents: 5, feesCents: 114 })
    })

    it("falls back to NULL-symbol default row", async () => {
        findFirstMock
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                txCorretagemCents: 100,
                txRegistroCents: 50,
                emolumentosCents: 25,
                issRatePercent: "10.00",
            })
        const result = await resolveFeeSnapshot({ accountId: "acct-1", assetSymbol: "WDO" })
        // commission = 100 + round(100 * 10 / 100) = 110
        // fees = 50 + 25 = 75
        expect(result).toEqual({ commissionCents: 110, feesCents: 75 })
    })

    it("falls back to ASSET_FEE_DEFAULTS hardcoded values", async () => {
        findFirstMock.mockResolvedValue(null)
        const result = await resolveFeeSnapshot({ accountId: "acct-1", assetSymbol: "WDO" })
        const wdo = ASSET_FEE_DEFAULTS.WDO
        const expectedCommission =
            wdo.txCorretagemCents +
            Math.round((wdo.txCorretagemCents * parseFloat(wdo.issRatePercent)) / 100)
        const expectedFees = wdo.txRegistroCents + wdo.emolumentosCents
        expect(result).toEqual({
            commissionCents: expectedCommission,
            feesCents: expectedFees,
        })
    })

    it("returns zero as last resort for unknown symbol with no DB rows", async () => {
        findFirstMock.mockResolvedValue(null)
        const result = await resolveFeeSnapshot({ accountId: "acct-1", assetSymbol: "ZZZUNKNOWN" })
        expect(result).toEqual({ commissionCents: 0, feesCents: 0 })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
bun run test:unit src/__tests__/lib/tax/fee-resolver.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/tax/fee-resolver'".

- [ ] **Step 3: Implement `resolveFeeSnapshot`**

Create `src/lib/tax/fee-resolver.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { accountFeeRates } from "@/db/schema"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"
import type { FeeRatesEntry } from "@/lib/tax/types"

interface ResolveFeeSnapshotInput {
    accountId: string
    assetSymbol: string
}

interface FeeSnapshot {
    commissionCents: number
    feesCents: number
}

const computeSnapshot = (entry: {
    txCorretagemCents: number
    txRegistroCents: number
    emolumentosCents: number
    issRatePercent: string
}): FeeSnapshot => {
    const issRate = parseFloat(entry.issRatePercent)
    const safeIssRate = Number.isFinite(issRate) ? issRate : 0
    const issCents = Math.round((entry.txCorretagemCents * safeIssRate) / 100)
    return {
        commissionCents: entry.txCorretagemCents + issCents,
        feesCents: entry.txRegistroCents + entry.emolumentosCents,
    }
}

const fromHardcodedDefault = (assetSymbol: string): FeeSnapshot => {
    const preset: FeeRatesEntry | undefined = ASSET_FEE_DEFAULTS[assetSymbol]
    if (!preset) {
        return { commissionCents: 0, feesCents: 0 }
    }
    return computeSnapshot(preset)
}

const resolveFeeSnapshot = async ({
    accountId,
    assetSymbol,
}: ResolveFeeSnapshotInput): Promise<FeeSnapshot> => {
    const perAsset = await db.query.accountFeeRates.findFirst({
        where: and(
            eq(accountFeeRates.accountId, accountId),
            eq(accountFeeRates.assetSymbol, assetSymbol),
        ),
    })
    if (perAsset) return computeSnapshot(perAsset)

    const accountDefault = await db.query.accountFeeRates.findFirst({
        where: and(
            eq(accountFeeRates.accountId, accountId),
            isNull(accountFeeRates.assetSymbol),
        ),
    })
    if (accountDefault) return computeSnapshot(accountDefault)

    return fromHardcodedDefault(assetSymbol)
}

export { resolveFeeSnapshot }
export type { FeeSnapshot, ResolveFeeSnapshotInput }
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun run test:unit src/__tests__/lib/tax/fee-resolver.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tax/fee-resolver.ts src/__tests__/lib/tax/fee-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(tax): add resolveFeeSnapshot helper for trade-insertion fee lookup

Reads accountFeeRates with per-asset > NULL-default > hardcoded defaults
> zero fallback chain. Splitting rule: commission = txCorretagem + ISS;
fees = txRegistro + emolumentos. IRRF/IR are profit-based (DARF only).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2: Create idempotent backfill migration

**Files:**
- Create: `src/db/migrations/0038_backfill_account_fee_rates.sql`

- [ ] **Step 1: Verify expected migration number**

```
ls src/db/migrations/*.sql | tail -3
```

Expected: 0037 is the most recent. The new file will be 0038.

- [ ] **Step 2: Create the backfill migration**

File: `src/db/migrations/0038_backfill_account_fee_rates.sql`

```sql
-- Phase 2 of fee-config unification.
-- Backfill account_fee_rates with NULL-symbol default rows for any account that
-- has no rows yet. Uses B3 typical defaults from asset-defaults.ts so trade
-- insertion (which now reads from account_fee_rates) doesn't zero-out
-- commissions for accounts configured only via legacy defaultCommission/defaultFees.
--
-- Idempotent: ON CONFLICT DO NOTHING via the (account_id, asset_symbol) unique idx.

INSERT INTO account_fee_rates (
    account_id,
    asset_symbol,
    tx_corretagem_cents,
    tx_registro_cents,
    emolumentos_cents,
    iss_rate_percent,
    irrf_rate_bps,
    ir_rate_bps,
    subject_to_personal_ir
)
SELECT
    ta.id,
    NULL,
    5,
    74,
    40,
    '5.00',
    100,
    2000,
    true
FROM trading_accounts ta
WHERE NOT EXISTS (
    SELECT 1 FROM account_fee_rates afr
    WHERE afr.account_id = ta.id
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Verify the migration is syntactically valid**

```
set -a && source .env && set +a && psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -c "EXPLAIN $(cat src/db/migrations/0038_backfill_account_fee_rates.sql | grep -v '^--' | tr '\n' ' ')"
```

Expected: query plan output, not an error. (If this is awkward, skip and apply directly in Step 4.)

- [ ] **Step 4: Apply the migration**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -f src/db/migrations/0038_backfill_account_fee_rates.sql
```

Expected output: `INSERT 0 N` where N = number of accounts that lacked rows.

- [ ] **Step 5: Verify the backfill**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -c "SELECT COUNT(*) AS accounts_without_rates FROM trading_accounts ta WHERE NOT EXISTS (SELECT 1 FROM account_fee_rates afr WHERE afr.account_id = ta.id);"
```

Expected: `accounts_without_rates | 0`.

- [ ] **Step 6: Update the Drizzle journal**

```
bun run db:generate
```

Expected: no schema changes detected (migration was data-only). If Drizzle prompts for any rename or other change, decline — this should be idempotent. Drizzle should update `_journal.json` to reference 0038 if it doesn't already.

If Drizzle creates a new snapshot file `meta/0038_snapshot.json` that's identical to 0037, accept it. If it creates a 0039 schema-change migration, **stop** — investigate before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/0038_backfill_account_fee_rates.sql src/db/migrations/meta/
git commit -m "$(cat <<'EOF'
feat(tax): backfill account_fee_rates with B3 defaults (Phase 2 prep)

Idempotent. Inserts NULL-symbol default row for any account missing
fee-rate config. Prevents Phase 2 source swap from zeroing commissions
on accounts that were only configured via legacy defaultCommission/Fees.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3: Swap `getAssetFees` to use `resolveFeeSnapshot`

**Files:**
- Modify: `src/app/actions/accounts.ts:779–836`

- [ ] **Step 1: Replace the function body**

Find the function `getAssetFees` at line 779. Replace its body (lines 783–836) with:

```ts
const session = await auth()
const targetAccountId = accountId || session?.user?.accountId

if (!targetAccountId) {
    return { commission: 0, fees: 0 }
}

const { commissionCents, feesCents } = await resolveFeeSnapshot({
    accountId: targetAccountId,
    assetSymbol,
})

return { commission: commissionCents, fees: feesCents }
```

- [ ] **Step 2: Update imports in `accounts.ts`**

At the top of the file, add:

```ts
import { resolveFeeSnapshot } from "@/lib/tax/fee-resolver"
```

Remove unused imports if `decryptAccountFields`, `getUserDek`, `accountAssets` (the schema reference inside the dropped block), or `assets` is no longer used elsewhere in `getAssetFees`'s body. Check via grep within the file before deleting any import.

- [ ] **Step 3: Run lint to catch import drift**

```
bun run lint
```

Expected: clean. If unused imports trigger warnings, delete them.

- [ ] **Step 4: Run tests**

```
bun run test:unit
```

Expected: all green. The 4 callers of `getAssetFees` (`csv-import.ts`, `trades.ts:1119`, `trades.ts:2206`, `risk-simulation.ts`) get the new behavior automatically since the signature is unchanged.

If a test mocks `getAssetFees`, it still works (function name unchanged).

If a test mocks `db.query.accountAssets.findFirst` or related and now finds the mock unused, the test still passes — unused mocks don't fail.

- [ ] **Step 5: Do NOT commit yet**

Task 2.4 audits the secondary insertion path. Commit both together.

---

### Task 2.4: Audit and swap `assetMap` insertion path in `trades.ts`

**Files:**
- Modify: `src/app/actions/trades.ts:1209–1238` (the import-loop assetMap path)

- [ ] **Step 1: Trace what feeds `assetMap.get(...)` at line 1209**

```
grep -n "assetMap\|new Map\|assetConfig.commission" src/app/actions/trades.ts | head -30
```

Identify where `assetMap` is built. Likely a `Promise.all` over `getAssetBySymbol` or a similar preload.

- [ ] **Step 2: If `assetMap` values include `.commission` and `.fees`**

The values come from a `getAssetBySymbol`-style helper that returns the asset config including legacy commission/fees. Replace the read at lines 1232–1238:

```ts
let commission = 0
let fees = 0

if (assetConfig) {
    commission = assetConfig.commission
    fees = assetConfig.fees
}
```

with:

```ts
let commission = 0
let fees = 0

if (assetConfig) {
    const snapshot = await resolveFeeSnapshot({
        accountId,
        assetSymbol: tradeData.asset.toUpperCase(),
    })
    commission = snapshot.commissionCents
    fees = snapshot.feesCents
}
```

Add the import at the top of `trades.ts`:

```ts
import { resolveFeeSnapshot } from "@/lib/tax/fee-resolver"
```

- [ ] **Step 3: If `assetMap` does NOT carry commission/fees (rare)**

Then the existing read is already null and the path is dead — delete the branch.

- [ ] **Step 4: Find any other `assetConfig.commission` or `assetConfig.fees` reads in `trades.ts`**

```
grep -n "assetConfig\.commission\|assetConfig\.fees" src/app/actions/trades.ts
```

Apply the same swap pattern at each site.

- [ ] **Step 5: Run lint**

```
bun run lint
```

Expected: clean.

- [ ] **Step 6: Run tests**

```
bun run test:unit
```

Expected: all green. If a fixture-based trade-insertion test fails because the test inserts a fake asset row without a corresponding `accountFeeRates` row, the resolver falls through to `ASSET_FEE_DEFAULTS` then to zero — test should still pass with deterministic numbers. If the test expected the legacy `defaultCommission` value, update the assertion to match the new (B3-based) value or add a `accountFeeRates` insert in the fixture.

- [ ] **Step 7: Commit Phase 2 source swap atomically**

```bash
git add src/app/actions/accounts.ts src/app/actions/trades.ts
git commit -m "$(cat <<'EOF'
feat(tax): swap trade-insertion fee source to accountFeeRates

Phase 2 of fee-config unification. getAssetFees now delegates to
resolveFeeSnapshot. Internal assetMap path in trades.ts also swapped.
Legacy DB columns (defaultCommission/defaultFees, commissionOverride/
feesOverride) still exist but are no longer read by writers. Dropped
in Phase 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Manual smoke check**

```
bun run dev
```

Open journal, insert a new trade for a known asset (e.g., WDO with 1 contract). Inspect the saved trade's `commissionCents`/`feesCents`. Expected: `commission = 5 + round(5 × 5 / 100) = 5`, `fees = 74 + 40 = 114` (B3 WDO defaults). Match against your account's actual `accountFeeRates` row if customized.

---

## Phase 3 — Drop legacy columns and dead code

### Task 3.1: Drop legacy column definitions from `schema.ts`

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Drop `defaultCommission` and `defaultFees` from `tradingAccounts`**

Find lines ~188–189:

```ts
defaultCommission: text("default_commission").default("0").notNull(), // cents per contract (encrypted)
defaultFees: text("default_fees").default("0").notNull(), // cents per contract (encrypted)
```

Delete both lines.

- [ ] **Step 2: Drop `commissionOverride` and `feesOverride` from `accountAssets`**

Find lines ~316–317:

```ts
commissionOverride: integer("commission_override"), // cents, NULL = use account default
feesOverride: integer("fees_override"), // cents, NULL = use account default
```

Delete both lines. Keep line 318 (`breakevenTicksOverride`) and the table's index/unique definitions intact.

- [ ] **Step 3: Verify no other schema references**

```
grep -n "default_commission\|default_fees\|commission_override\|fees_override\|defaultCommission\|defaultFees\|commissionOverride\|feesOverride" src/db/schema.ts
```

Expected: zero hits.

- [ ] **Step 4: Generate the drop migration**

```
bun run db:generate
```

Drizzle will prompt to confirm column drops on `trading_accounts` and `account_assets`. Confirm each. Migration file is created at `src/db/migrations/0039_<adjective>_<name>.sql`.

- [ ] **Step 5: Audit the generated migration**

```
ls src/db/migrations/0039_*.sql
cat src/db/migrations/0039_*.sql
```

Expected content: 4 `ALTER TABLE … DROP COLUMN …` statements only:

```sql
ALTER TABLE "trading_accounts" DROP COLUMN "default_commission";
ALTER TABLE "trading_accounts" DROP COLUMN "default_fees";
ALTER TABLE "account_assets" DROP COLUMN "commission_override";
ALTER TABLE "account_assets" DROP COLUMN "fees_override";
```

(Order may differ.) If Drizzle emits anything else (rename, recreate, table drop), **stop** — revert and investigate.

- [ ] **Step 6: Apply the migration**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -f src/db/migrations/0039_*.sql
```

Expected: 4× `ALTER TABLE` lines.

- [ ] **Step 7: Verify schema state**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -c "\d trading_accounts" | grep -E "default_commission|default_fees"
set -a && source .env && set +a && psql "$DATABASE_URL" -c "\d account_assets" | grep -E "commission_override|fees_override"
```

Expected: both commands return nothing (columns gone).

- [ ] **Step 8: Do NOT commit yet**

Code consumers still reference the dropped fields. Tasks 3.2–3.7 fix them, then a single Phase 3 commit ships everything.

---

### Task 3.2: Remove legacy fields from encryption envelope

**Files:**
- Modify: `src/lib/user-crypto.ts`

- [ ] **Step 1: Remove from the encrypted-fields list**

Find line 177:

```ts
"defaultCommission", "defaultFees", "maxDailyLoss", "maxMonthlyLoss", "propFirmName",
```

Delete `"defaultCommission",` and `"defaultFees",`.

- [ ] **Step 2: Remove the decrypt entries**

Find lines 194–195:

```ts
defaultCommission: decryptNumericField(account.defaultCommission as string | null, dek),
defaultFees: decryptNumericField(account.defaultFees as string | null, dek),
```

Delete both lines.

- [ ] **Step 3: Verify no other crypto references**

```
grep -n "defaultCommission\|defaultFees" src/lib/user-crypto.ts
```

Expected: zero hits.

---

### Task 3.3: Remove legacy fields from action layer

**Files:**
- Modify: `src/app/actions/accounts.ts`

- [ ] **Step 1: Drop input type fields**

Lines ~49–50:

```ts
defaultCommission?: number
defaultFees?: number
```

Delete.

Lines ~61–62:

```ts
commissionOverride?: number | null
feesOverride?: number | null
```

Delete.

- [ ] **Step 2: Drop assignment lines in account-create flow**

Line ~128–129:

```ts
defaultCommission: input.defaultCommission ?? 0,
defaultFees: input.defaultFees ?? 0,
```

Delete.

Lines ~150–151:

```ts
defaultCommission: (input.defaultCommission ?? 0).toString(),
defaultFees: (input.defaultFees ?? 0).toString(),
```

Delete.

Lines ~228–229:

```ts
if (input.defaultCommission !== undefined) updateData.defaultCommission = input.defaultCommission.toString()
if (input.defaultFees !== undefined) updateData.defaultFees = input.defaultFees.toString()
```

Delete.

- [ ] **Step 3: Drop per-asset override assignments**

Lines ~510–511:

```ts
commissionOverride: config?.commissionOverride ?? null,
feesOverride: config?.feesOverride ?? null,
```

Delete.

Lines ~571–572 and ~584–585: same pattern. Delete each.

- [ ] **Step 4: Simplify or remove `getAssetFees`**

After Task 2.3 the function body became a thin wrapper. Audit callers:

```
grep -rn "getAssetFees\b" src --include="*.ts" --include="*.tsx"
```

If any caller still expects the `{ commission, fees }` shape (likely yes, 4 callers), keep `getAssetFees` as the wrapper. Its current Phase-2 body is correct — no further change needed in this task.

If no callers remain (unlikely), delete the function and its export.

- [ ] **Step 5: Verify zero `defaultCommission`/`defaultFees`/`commissionOverride`/`feesOverride` references in `accounts.ts`**

```
grep -n "defaultCommission\|defaultFees\|commissionOverride\|feesOverride" src/app/actions/accounts.ts
```

Expected: zero hits.

---

### Task 3.4: Remove legacy fields from arch route

**Files:**
- Modify: `src/app/api/arch/accounts/[id]/route.ts`

- [ ] **Step 1: Drop response fields**

Lines ~61–62:

```ts
commissionOverride: config.commissionOverride,
feesOverride: config.feesOverride,
```

Delete.

- [ ] **Step 2: Verify**

```
grep -n "commissionOverride\|feesOverride\|defaultCommission\|defaultFees" src/app/api/arch/accounts/[id]/route.ts
```

Expected: zero hits.

---

### Task 3.5: Remove legacy fields from public types

**Files:**
- Modify: `src/types/index.ts:366–367`

- [ ] **Step 1: Drop type fields**

Find lines 366–367:

```ts
defaultCommission: number
defaultFees: number
```

Delete.

- [ ] **Step 2: Verify**

```
grep -n "defaultCommission\|defaultFees" src/types/index.ts
```

Expected: zero hits.

- [ ] **Step 3: Audit other type files**

```
grep -rn "defaultCommission\|defaultFees" src/types --include="*.ts"
```

Expected: zero hits. If any remain, delete.

---

### Task 3.6: Update fixture builders and remove broken tests

**Files:**
- Modify: any `src/__tests__/**` file that sets the dropped fields on a fixture row

- [ ] **Step 1: Find all test fixtures referencing the dropped fields**

```
grep -rn "defaultCommission\|defaultFees\|commissionOverride\|feesOverride" src/__tests__ --include="*.ts"
```

- [ ] **Step 2: For each match, update the fixture**

If the test creates a fake `tradingAccounts` row with `defaultCommission: 100`, drop those properties.

If the test creates a fake `accountAssets` row with `commissionOverride: 200`, drop those properties.

If the test was specifically testing the legacy override-resolution logic, **delete that test** — the behavior is now in `resolveFeeSnapshot` and covered by `fee-resolver.test.ts`.

- [ ] **Step 3: Verify**

```
grep -rn "defaultCommission\|defaultFees\|commissionOverride\|feesOverride" src --include="*.ts" --include="*.tsx" | grep -v migrations
```

Expected: zero hits.

- [ ] **Step 4: Run tests**

```
bun run test:unit
```

Expected: all green. Test count may decrease if legacy-specific tests were deleted — note the new count for the commit message.

---

### Task 3.7: Remove residual i18n keys

**Files:**
- Modify: `messages/en.json`, `messages/pt-BR.json`

- [ ] **Step 1: Find remaining legacy keys**

```
grep -n "defaultCommission\|defaultFees\|commissionOverride\|feesOverride\|Default Commission" messages/en.json messages/pt-BR.json
```

- [ ] **Step 2: Audit each match**

For each key:
1. Search for the key's usage: `grep -rn "t(\"<key>\")\|getTranslations.*<key>" src --include="*.ts" --include="*.tsx"`.
2. If zero usages, delete the JSON line.
3. If still used, keep — flag for follow-up. (Should be zero remaining after Task 3.3 cleanup, but verify.)

- [ ] **Step 3: Verify both files parse as JSON**

```
node -e "JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('en.json OK')"
node -e "JSON.parse(require('fs').readFileSync('messages/pt-BR.json', 'utf8')); console.log('pt-BR.json OK')"
```

Expected: both print `OK`.

---

### Task 3.8: Add schema-shape test

**Files:**
- Modify or create: `src/__tests__/lib/yearly-plan/schema-types.test.ts` (extend existing test file used by Phase 4b)

- [ ] **Step 1: Append schema-shape assertions**

Add this `describe` block to the file:

```ts
describe("legacy commission/fees columns dropped (Fee Unification Phase 3)", () => {
    it("tradingAccounts type does not include defaultCommission/defaultFees", async () => {
        const { tradingAccounts } = await import("@/db/schema")
        type Row = typeof tradingAccounts.$inferSelect
        const sample = {} as Row
        // @ts-expect-error — defaultCommission must be absent from the inferred type
        const _c = sample.defaultCommission
        // @ts-expect-error — defaultFees must be absent
        const _f = sample.defaultFees
        expect(true).toBe(true)
    })

    it("accountAssets type does not include commissionOverride/feesOverride", async () => {
        const { accountAssets } = await import("@/db/schema")
        type Row = typeof accountAssets.$inferSelect
        const sample = {} as Row
        // @ts-expect-error — commissionOverride must be absent
        const _co = sample.commissionOverride
        // @ts-expect-error — feesOverride must be absent
        const _fo = sample.feesOverride
        expect(true).toBe(true)
    })
})
```

- [ ] **Step 2: Run only this file**

```
bun run test:unit src/__tests__/lib/yearly-plan/schema-types.test.ts
```

Expected: all assertions pass. The `@ts-expect-error` lines confirm the fields are absent (the comment errors only if the access succeeds).

---

### Task 3.9: Final lint + test gate, then atomic Phase 3 commit

- [ ] **Step 1: Lint**

```
bun run lint
```

Expected: clean.

- [ ] **Step 2: Full test suite**

```
bun run test:unit
```

Expected: all green. Note the new test count.

- [ ] **Step 3: Final grep audit**

```
grep -rn "defaultCommission\|defaultFees\|commissionOverride\|feesOverride" src --include="*.ts" --include="*.tsx" | grep -v migrations
```

Expected: zero hits.

```
grep -rn "default_commission\|default_fees\|commission_override\|fees_override" src --include="*.ts" --include="*.tsx" --include="*.json" | grep -v migrations
```

Expected: zero hits (migration files only — those are historical and stay).

- [ ] **Step 4: Manual smoke check**

```
bun run dev
```

Verify:
1. Accounts tab still saves account changes (now with no commission/fees fields).
2. New trade insertion via journal still works; `commissionCents`/`feesCents` populated from `accountFeeRates` resolver.
3. Analytics dashboard renders with historical data unchanged.
4. Tax engine DARF still computes (separate path, untouched).

- [ ] **Step 5: Stage and commit**

```bash
git add -A
git status --short
```

Verify the staged set: `src/db/schema.ts`, `src/db/migrations/0039_*.sql`, `src/db/migrations/meta/`, `src/lib/user-crypto.ts`, `src/app/actions/accounts.ts`, `src/app/api/arch/accounts/[id]/route.ts`, `src/types/index.ts`, possibly fixture files in `src/__tests__/`, `messages/en.json`, `messages/pt-BR.json`, `src/__tests__/lib/yearly-plan/schema-types.test.ts`.

```bash
git commit -m "$(cat <<'EOF'
refactor(tax): drop legacy commission/fees columns and code (Phase 3)

Final phase of fee-config unification. accountFeeRates is now sole source.

DB drops:
- trading_accounts.default_commission
- trading_accounts.default_fees
- account_assets.commission_override
- account_assets.fees_override

Code drops: encryption envelope entries, action input/output fields,
arch route fields, public types, fixture builders, residual i18n keys.

Past trade snapshots (trades.commissionCents/feesCents) preserved as
immutable historical record.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Show final log**

```
git log --oneline -8
```

Expected: at least 5 new commits over the 3 phases.

---

## Self-Review

### Spec coverage

| Spec section | Implementing task |
|---|---|
| Phase 1 — UI move | Task 1.1 |
| Phase 2 — `resolveFeeSnapshot` helper + tests | Task 2.1 |
| Phase 2 — backfill migration | Task 2.2 |
| Phase 2 — swap `getAssetFees` source | Task 2.3 |
| Phase 2 — swap `assetMap` path in trades.ts | Task 2.4 |
| Phase 3 — drop legacy columns + migration | Task 3.1 |
| Phase 3 — encryption envelope | Task 3.2 |
| Phase 3 — action layer | Task 3.3 |
| Phase 3 — arch route | Task 3.4 |
| Phase 3 — public types | Task 3.5 |
| Phase 3 — fixture cleanup | Task 3.6 |
| Phase 3 — i18n key cleanup | Task 3.7 |
| Phase 3 — schema-shape test | Task 3.8 |
| Phase 3 — final gate | Task 3.9 |

All 12 spec sections (3 phases × ~4 sub-areas) mapped.

### Placeholder scan

- Task 1.1 Step 4 says "If breakeven ticks UI is interleaved … extract a new lean component" — that's a conditional, not a placeholder. Acceptable.
- Task 2.4 Step 1 asks the implementer to trace `assetMap` source via grep. Concrete grep command provided. Acceptable.
- Task 3.6 says "delete that test" if it was specifically testing legacy override resolution. Concrete criterion. Acceptable.
- No "TBD" or "implement later" anywhere.

### Type consistency

- `resolveFeeSnapshot({ accountId, assetSymbol })` returns `{ commissionCents, feesCents }`. Used identically in Tasks 2.1, 2.3, 2.4.
- `getAssetFees(assetSymbol, accountId?)` returns `{ commission, fees }` (signature unchanged). Used in Task 2.3 and unchanged for callers.
- `FeeSnapshot` interface defined in Task 2.1 Step 3. Re-exported for downstream typing if needed.
- Migration filenames: 0038 (backfill) → 0039 (column drops). Sequential.

All consistent.

### Risk reminder

- Phase 2 is the riskiest commit — write semantics change for forward trades. Backfill migration in Task 2.2 is the safety net. Run Task 2.4 Step 8 manual smoke before moving to Phase 3.
- Phase 3 column drops are irreversible at the data level. Past snapshot data on trades is preserved (different table). Migration is a clean DROP COLUMN, no data movement.

---

## Execution Handoff

**Plan saved to** `docs/superpowers/plans/2026-05-05-fee-config-unification.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review per task. Best for catching schema-touch mistakes and missed `assetMap` swap sites.
2. **Inline Execution** — sequential in this session with checkpoints between Tasks 1.1, 2.4, 3.9. Faster, lower review overhead.
