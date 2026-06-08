# Axion — Database Schema

> **Single source of truth: `src/db/schema.ts`.**
> This doc explains the _system_ — domain groupings, conventions, and invariants — not column-level values.
> For the live shape of any table, read `schema.ts`.

## 1. Stack

- **Drizzle ORM** + **PostgreSQL** (Neon serverless).
- Migrations: `src/db/migrations/`. Generated and managed via `drizzle-kit`.
- Seed: `scripts/seed.ts` (top-level), with domain-specific seed scripts under `src/db/seed-*.ts`.

## 2. Domain Map

Tables group into the following domains. Each domain owns a set of related tables and the relations between them.

| Domain                    | Purpose                                                                                                                                                         | Key tables (representative)                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Auth**                  | Identity, sessions, OAuth, rate limiting                                                                                                                        | `users`, `sessions`, `oauth_accounts`, `verification_tokens`, `rate_limit_attempts`                          |
| **Trading accounts**      | Multi-account ownership (personal / prop / replay)                                                                                                              | `trading_accounts`, `account_assets`, `account_timeframes`, `account_asset_settings`, `daily_asset_settings` |
| **Reference data**        | Asset catalog and timeframe definitions                                                                                                                         | `assets`, `asset_types`, `timeframes`                                                                        |
| **Trade journal**         | Trades, executions, tags, daily journals                                                                                                                        | `trades`, `trade_executions`, `tags`, `trade_tags`, `daily_journals`                                         |
| **Strategies & playbook** | Strategy library + condition system                                                                                                                             | `strategies`, `trading_conditions`, `strategy_conditions`, `strategy_scenarios`, `scenario_images`           |
| **Command center**        | Daily checklists, asset rules                                                                                                                                   | `daily_checklists`, `checklist_completions`                                                                  |
| **Risk management**       | Risk profiles, equity-shield params                                                                                                                             | `risk_management_profiles`                                                                                   |
| **Fractal planning**      | Year → quarter → month → week → day cascade                                                                                                                     | `yearly_plans`, `quarterly_plan`, `monthly_plan`, `weekly_plan`, `daily_plan`, `tier_change_log`             |
| **BR tax engine**         | Monthly DARF ledger and per-account fee config                                                                                                                  | `monthly_tax_ledger`, `account_fee_rates`                                                                    |
| **Imports**               | Nota fiscal imports, OCR, CSV                                                                                                                                   | `nota_imports`                                                                                               |
| **Bug reports**           | In-app bug capture                                                                                                                                              | `bug_reports`, `bug_report_images`                                                                           |
| **Indicators / candles**  | Indicator metadata + on-Postgres dataset registry. Candle rows live in R2 Parquet (see `src/lib/candle-store/`), one file per `(timeframe_code, asset_symbol)`. | `indicator_groups`, `indicator_definitions`, `price_data_versions`                                           |
| **Aggregates**            | Pre-computed monthly / weekly rollups                                                                                                                           | `account_monthly_aggregate`, `account_weekly_aggregate`                                                      |
| **Capital events**        | Deposits / withdrawals                                                                                                                                          | `account_capital_events`                                                                                     |
| **Settings & filters**    | App-level config and saved filter presets                                                                                                                       | `settings`, `user_settings`, `filter_presets`                                                                |

## 3. Conventions & Invariants

### Account scoping

- Every owned table FKs to `trading_accounts.id` (and through it to `users.id`). The exception is global reference data (`asset_types`, `assets`, `timeframes`) and per-user catalog tables (`tags`, `strategies`) which scope to `users.id` directly.
- Queries MUST filter by the active `accountId` from the auth context. Server actions enforce this — never query `trades` (or any account-scoped table) without an account filter.

### Money columns

- Money is stored as **encrypted text** (column-level encryption) for sensitive trade fields (`entryPrice`, `exitPrice`, `pnl`, `commission`, `fees`, …). Read/write goes through the encryption layer in `src/lib/db/`.
- For aggregate / ledger / capital tables (`monthly_tax_ledger`, `account_capital_events`, `account_monthly_aggregate`), money is stored as `bigint` cents (integer). Never as floating decimal — avoids rounding drift.
- Display layer formats via `src/lib/formatting.ts`.

### Enums

Every status / category column uses a Postgres enum declared in `schema.ts`. Add new values via migration; don't store free-form strings.

### Indexes

Defined inline as the second argument to `pgTable(...)`. Don't export indexes separately — Drizzle's inline form is the project convention.

### Soft state vs hard delete

- Trades are hard-deleted (no soft delete). Imports keep a hash on `trades.deduplicationHash` to dedupe re-imports.
- Tags / strategies use `isActive` flags or per-table soft-delete columns depending on the table (read `schema.ts` per table).

### Timestamps

`createdAt` and `updatedAt` on every owned table. Use Drizzle's `defaultNow()` for inserts and `$onUpdate` triggers for mutations.

## 4. Key Cross-Domain Patterns

### Fractal planning cascade

`yearlyPlan → quarterlyPlan → monthlyPlan → weeklyPlan → dailyPlan` form a hierarchical override chain. Each level inherits defaults from the parent and may override specific fields. The resolver in `src/lib/fractal-plan/resolver.ts` collapses the chain to a single effective plan for a given date. `tier_change_log` audits tier changes (month-start vs drawdown trigger vs manual).

### Tax engine — lazy recompute + chained carryover

`monthly_tax_ledger` rows are never directly mutated. They are recomputed by `src/lib/tax/recompute-month.ts` from underlying `trades` + `account_fee_rates` + previous-month carryover. `mark-dirty.ts` flags downstream months when a trade or fee changes, and `getMonthlyDarf` lazily recomputes on read. The chain links via `carryoverInCents` / `carryoverOutCents` columns.

### Snapshots vs live values

Several tables (e.g. `monthly_plan.snapshotCapitalCents`, `monthly_plan.snapshotOneRCents`) capture point-in-time values for use in projections. These are persisted (not recomputed) so historical R-values stay stable even if account capital drifts. Use the snapshot for retro analysis; use live capital for forward planning.

### Trade execution model

A `trade` may have one or many `trade_executions`. `executionMode` (`simple` | `scaled`) selects the input pattern. Aggregates like `avgEntryPrice`, `totalEntryQuantity`, `pnl` are denormalised on `trade` for fast queries; the source-of-truth is the executions. `recalculateTradeFromExecutions` rebuilds them.

## 5. Type Exports

`schema.ts` exports `$inferSelect` / `$inferInsert` types for every table. Always use these in server actions and queries — never re-define table types by hand.

## 6. Editing the Schema

1. Edit `src/db/schema.ts`.
2. Run `pnpm drizzle-kit generate` to produce a migration.
3. Inspect the generated SQL — Drizzle is good but not perfect with renames and type changes.
4. Run `pnpm drizzle-kit migrate` (or apply via the deploy pipeline).
5. Update any server action / query / type that reads the changed column.
6. Update `scripts/seed.ts` if seed data is affected.

## 7. Things This Doc Deliberately Does NOT List

- Column names, types, defaults, FKs.
- The full ERD.
- Index definitions.
- Enum values.

All of those drift the moment a migration lands. Read `schema.ts` directly — it is short, generated types are exported, and the Drizzle DSL is more readable than any markdown table.
