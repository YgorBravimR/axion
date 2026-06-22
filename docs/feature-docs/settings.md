# Settings

> Account, capital, tax, risk profile, asset, timeframe, catalog, and user management.

**Routes:** `/[locale]/settings`
**Server actions:** `settings.ts`, `accounts.ts`, `assets.ts`, `timeframes.ts`, `risk-profiles.ts`, `seed-risk-profiles.ts`, `user-catalog-bundles.ts`, `user-management.ts`
**Files:** `src/app/[locale]/(app)/settings/**`

## Purpose

Configure the boundaries that the rest of Axion operates inside: what's an account, what's an asset, what's "real" capital, what are the tax rules, what are the available risk profiles.

## What lives there

- **User Settings** — `isPropAccount`, `propFirmName`, `profitSharePercentage`, `taxExemptThreshold`, `defaultCurrency`, `showTaxEstimates`, `showPropCalculations`, `showAllAccounts`.
- **Account Management** — create / edit accounts (name, initialBalance, defaultAssetId), per-account asset and timeframe assignments.
- **Risk Profiles** — built-in templates auto-seeded (Fixed Fractional, Fixed Ratio, Institutional, R-Multiples, Kelly Fractional); custom profile CRUD with decision-tree JSON; assignment to accounts.
- **User Management** (admin) — list users + accounts, invite, edit role, deactivate.
- **Catalog Bundles** — read-only list of pre-curated entry catalogs (`/data/hawks/user-entries/`).

## Inputs

Form fields per tab as above; JSON for risk profile trees.

## Outputs

- `userSettings`, `tradingAccounts`, `accountAssets`, `accountTimeframes`, `riskProfiles`, user invitations.

## Cross-feature integrations

- **Account mode context** — determines if Hawks tab is visible.
- **Tax engine** — `profitSharePercentage`, `taxExemptThreshold` feed `recompute-month.ts`.
- **Risk profile templates** — seeded only when an admin first visits.
- **Equity Shield** — `initialBalance` × trade flow → daily loss limit.
- **Catalog Bundles** — Hawks dev pages read the same data.

## Where it fails

- **Account name collision per user.** Error is generic.
- **Invalid decision-tree JSON.** Validation surfaces an error but not which field is wrong.
- **Admin seed is silent.** Non-admin first-time users don't see templates until an admin signs in.
- **Asset/timeframe assignment is per-account.** Moving 1500 trades between accounts requires re-assigning the source asset to the target.
- **Catalog Bundles are read-only.** UI invites you to "browse" but you can't customise.
- **No setting changelog.** Tax threshold change today → DARF rows recompute → no audit trail of who changed what.
- **Prop firm fields are flat.** No support for multiple prop accounts with different firms unless you split into separate accounts.

## Power combos

1. **Multi-account stack.** Register → create paper + live + prop accounts → login uses account-picker with 7-day sparkline per account → can switch context without re-auth.
2. **Tax season prep.** Set `taxExemptThreshold` on Jan 1; monthly reports auto-segment trades by exemption status. Sept-to-Dec planning uses the running threshold to decide if to defer trades.
3. **Risk profile + Plan + CC.** Create a custom profile with conservative rules → assign to live account → Plan resolver pulls it → CC breaker enforces it daily. Settings is the upstream lever for daily discipline.
4. **Seed user data on first login.** `seedUserData()` creates default account + asset + timeframe; new traders skip the empty-state wizard.
