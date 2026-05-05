# Fee Config Unification — Design

**Status:** Design — pending implementation plan
**Author:** Ygor Bravim (with Claude Opus 4.7)
**Branch:** `feat/yearly-tax-reporting`
**Date:** 2026-05-05

---

## Context

Two parallel fee-config systems exist:

| System | Storage | Consumers |
|---|---|---|
| **Legacy** | `tradingAccounts.defaultCommission`/`defaultFees` (encrypted text, cents) + `accountAssets.commissionOverride`/`feesOverride` (per-asset) | Trade insertion writes snapshot → `trade.commissionCents`/`feesCents`. Analytics, reports, risk-sim read the snapshot. UI: "Default Commission & Fees" section on Accounts tab + per-asset DOL/IND/WDO/WIN editor. |
| **New (BR tax engine)** | `accountFeeRates` table (B3 components: txCorretagem, txRegistro, emolumentos, ISS%, IRRF bps, IR bps) per `(accountId, assetSymbol NULL=default)` | Tax engine `recompute-month.ts` for DARF. UI: "Taxas e Corretagem (BR)" form on Profile. |

Mathematical overlap: `(txCorretagem + txRegistro + emolumentos) + (txCorretagem × issRatePercent/100)` per contract = legacy `commission + fees`. New is strictly more expressive. Both editable separately today — drift waiting to happen.

User mandate: **NO DUPLICITY**. Single source of truth. New replaces legacy.

## Goal

`accountFeeRates` becomes sole source of truth for per-contract trading costs. Legacy commission/fees columns and UI removed. Fee-rate form moves to Accounts tab. `breakevenTicksOverride` stays — orthogonal concern (tick threshold for breakeven classification, not a fee).

## Non-goals

- Backfill historical trades. Existing `trade.commissionCents`/`feesCents` snapshots stay as-is (immutable historical record).
- IRRF/IR in trade snapshot. Those are profit-based, DARF-only.
- Multi-currency. BRL only.
- Per-trade fee override mechanism beyond editing the trade row directly.
- Rework `accountAssets` table beyond dropping two columns.

## Architecture

Three sequential phases. Each its own commit. App functional after every phase. Phase 2 ships all insertion sites in one atomic commit (partial state would write inconsistent commission).

### Phase 1 — UI move

Render `<FeeRateForm>` inside Accounts tab settings. Remove legacy "Default Commission & Fees" section + per-asset override editor from Accounts tab. Remove "Taxas e Corretagem (BR)" form from Profile page entirely.

Backend untouched. Trade insertion still reads legacy columns. Outcome: one fee UI surface; legacy DB columns still feed P&L until Phase 2.

### Phase 2 — Swap insertion source

New helper at `src/lib/tax/fee-resolver.ts`:

```ts
const resolveFeeSnapshot = async (
    accountId: string,
    assetSymbol: string,
): Promise<{ commissionCents: number; feesCents: number }>
```

Lookup order:
1. Per-asset row: `accountFeeRates WHERE accountId=$1 AND assetSymbol=$2`
2. Account default: `accountFeeRates WHERE accountId=$1 AND assetSymbol IS NULL`
3. Hardcoded `ASSET_FEE_DEFAULTS[symbol]` (already exists at `src/lib/tax/asset-defaults.ts`)
4. Zero (last resort).

Splitting rule (single, documented):
- `commissionCents = txCorretagemCents + round(txCorretagemCents × issRatePercent / 100)`
- `feesCents = txRegistroCents + emolumentosCents`

Rationale: ISS is municipal tax on the broker's commission service — sits with commission semantically. Registro + emolumentos are exchange/clearing fees — sit with fees. The user's per-trade snapshot still adds to the same total.

All trade-insertion sites swap to helper in **one commit**:
- `src/app/actions/trades.ts:1232–1238` (manual entry)
- Plus 4 other insertion sites within `trades.ts` (line numbers determined during implementation)
- CSV/OCR import paths
- Any other writer of `trade.commissionCents`/`feesCents`

Migration step inside Phase 2: backfill `accountFeeRates` for any account that has zero rows. Use `ASSET_FEE_DEFAULTS` for DOL/IND/WDO/WIN + a NULL-symbol default row. Prevents Phase 2 swap from zeroing commissions for users who only configured legacy.

Outcome: legacy columns still exist but unused by writes. Past trade snapshots unchanged.

### Phase 3 — Drop legacy

Migration:
- `ALTER TABLE trading_accounts DROP COLUMN default_commission`
- `ALTER TABLE trading_accounts DROP COLUMN default_fees`
- `ALTER TABLE account_assets DROP COLUMN commission_override`
- `ALTER TABLE account_assets DROP COLUMN fees_override`

`account_assets.breakeven_ticks_override` stays. Table itself stays.

Code:
- Delete legacy fee form components.
- Delete legacy validation schemas (commission/fees fields in account input).
- Delete legacy action params (`defaultCommission?`, `defaultFees?` on `accounts.ts:49–50, 128–129, 150–151, 228–229`).
- Delete decryption + override resolution lines `accounts.ts:799–835` for commission/fees (preserve breakeven ticks logic).
- Update types: `src/types/index.ts:366–367` removes `defaultCommission`/`defaultFees`.
- Update encryption envelope to no longer encrypt commission/fees fields (they no longer exist).

Outcome: schema clean, no duplicity, single fee module.

## Data flow (post-Phase 3)

```
User edits Accounts tab → upsertFeeRates server action → accountFeeRates row
                                                              ↓
Trade insertion → resolveFeeSnapshot(accountId, asset) → trade.commissionCents/feesCents
                                                              ↓
Analytics, reports, risk-sim, mistake-cost → read trade snapshot (unchanged)
                                                              ↓
Tax engine recompute-month → reads accountFeeRates directly for DARF (unchanged)
```

## Components

### Phase 1 components

- **Modify**: `src/components/settings/account-settings.tsx` — remove "Default Commission & Fees" section + per-asset override editor.
- **Modify**: `src/components/settings/account-settings.tsx` — embed `<FeeRateForm>` (already exists at `src/components/tax/fee-rate-form.tsx`).
- **Modify**: Profile/settings page that renders `<FeeRateForm>` standalone — remove that mount.
- **Modify**: navigation/i18n to remove "Taxas e Corretagem" entry from Profile section if surfaced there.

### Phase 2 components

- **Create**: `src/lib/tax/fee-resolver.ts` — `resolveFeeSnapshot` + tests.
- **Create**: `src/__tests__/lib/tax/fee-resolver.test.ts` — coverage for per-asset hit, NULL fallback, hardcoded fallback, zero fallback.
- **Modify**: `src/app/actions/trades.ts:1232–1238` and other insertion sites — call resolver instead of reading `assetConfig.commission`/`fees`.
- **Modify**: CSV import path (find via grep on `trade.commissionCents`).
- **Migration**: hand-confirmed Drizzle generate that backfills `accountFeeRates` from `ASSET_FEE_DEFAULTS` for accounts with zero rows. Idempotent INSERT … ON CONFLICT DO NOTHING keyed on `(accountId, assetSymbol)`.

### Phase 3 components

- **Schema**: `src/db/schema.ts` drop `defaultCommission`, `defaultFees`, `commissionOverride`, `feesOverride` column defs.
- **Migration**: Drizzle generate emits `ALTER TABLE … DROP COLUMN` × 4.
- **Code**: delete consumers of removed cols. Check via grep before commit.
- **Tests**: schema-shape test asserts removed columns absent. Update fixture builders.
- **i18n**: remove unused translation keys (`defaultCommission`, `defaultFees`, related descriptions).

## API contract changes

| Endpoint | Before | After |
|---|---|---|
| `upsertAccount` action input | `{ defaultCommission?, defaultFees?, … }` | drops the two fields |
| `getAccount` response | `{ defaultCommission, defaultFees, … }` | drops the two fields |
| Asset-config resolver `accounts.ts:765+` | returns `{ commission, fees, breakevenTicks }` | returns `{ breakevenTicks }` only — commission/fees come from resolver, not asset config |

Existing arch endpoints under `/api/arch/accounts/*` and `/api/arch/executions/*` need audit for these field references — done in Phase 3.

## Error handling

`resolveFeeSnapshot` never throws. Falls through 4 lookup layers and returns zero as last resort. Trade insertion proceeds even if account misconfigured (fees zero, but trade saves).

Form validation unchanged from existing `<FeeRateForm>`.

## Testing

- **Unit**: `fee-resolver.test.ts` covers all 4 lookup layers (asset row → NULL row → hardcoded → zero).
- **Unit**: schema-shape test for Phase 3 column drops.
- **Integration**: existing `commission-fee-impact.test.ts` already exercises `trade.commissionCents`/`feesCents` reads — should remain green throughout (snapshot semantics unchanged).
- **Manual smoke per phase**:
  - Phase 1: Accounts tab shows new form, legacy gone, Profile no longer renders fee form.
  - Phase 2: Insert new trade via journal — `trade.commissionCents` matches `(txCorretagem + ISS) × contracts`.
  - Phase 3: lint + tests green; Accounts tab still saves; old trades still display correct historical P&L.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Phase 2 swap changes commission arithmetic for forward writes — users see different P&L from before | Document in release note. New values are correct B3 totals; old were user-entered aggregates that may have been incomplete. |
| User configured legacy but not `accountFeeRates` → Phase 2 swap zeros their commissions | Phase 2 migration backfills defaults from `ASSET_FEE_DEFAULTS` for accounts missing rows. |
| Encrypted-field removal in Phase 3 — encryption envelope expects specific field set | Update encryption util to drop fields from `ENCRYPTED_FIELDS` list. Existing rows decrypt fine since fields are removed entirely. |
| `accountAssets.commissionOverride`/`feesOverride` may have non-NULL data on production users | Phase 3 migration drops the columns regardless. Data lost is intentional (replaced by `accountFeeRates`). |
| Drizzle generate may not detect the column drops cleanly | Verify generated SQL before applying. Confirm 4 `DROP COLUMN` statements, no surprise table recreations. |

## Acceptance criteria

**Phase 1**:
- `bun run lint` clean
- `bun run test:unit` 1088 → 1088 (no count change)
- Accounts tab renders `<FeeRateForm>`; legacy "Default Commission & Fees" section removed
- Profile page no longer renders fee form
- `grep -rn "Default Commission & Fees" src` returns zero hits in non-test files

**Phase 2**:
- `bun run lint` clean
- `bun run test:unit` adds new `fee-resolver.test.ts` cases (≥4); all green
- `grep -n "assetConfig.commission\|assetConfig.fees" src/app/actions/trades.ts` returns zero hits
- Manual: new journal trade has `commissionCents` matching new resolver output
- Migration applied; affected accounts have backfilled `accountFeeRates` rows

**Phase 3**:
- `bun run lint` clean
- `bun run test:unit` green (test count may decrease as legacy-specific tests removed)
- `grep -rn "defaultCommission\|defaultFees\|commissionOverride\|feesOverride" src --include="*.ts" --include="*.tsx" | grep -v migrations` returns zero hits
- Schema-shape test asserts the 4 columns absent from inferred types
- Manual: account form saves; trade insertion still works; analytics still shows correct historical P&L from snapshots

## Out of scope (future tickets)

- Per-trade fee editing UX beyond the existing trade-edit form.
- Currency support beyond BRL.
- Tax-engine support for non-B3 markets.
- Migration of historical trade snapshots to recomputed values.

---

**Estimated work:** 3 phases, ~15–20 tasks total, 1–2 days.
**Next step:** writing-plans skill produces the detailed plan.
