# Phase 4b — Rename `monthlyPlans` to `monthlyRiskConfig` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the legacy `monthlyPlans` table (risk-management config) to `monthlyRiskConfig` to resolve the naming collision with the new fractal `monthlyPlan` table. Pure refactor — no data reshape.

**Architecture:** One DB `RENAME TO`. Mechanical identifier renames across schema, action layer, arch routes, and 4 UI consumers. Function names follow the new noun. Risk-config data model unchanged.

**Tech Stack:** Drizzle ORM, Next.js 16 server actions, Vitest, hand-applied `psql` migration.

**Spec:** `docs/superpowers/specs/2026-05-05-monthly-plans-rename-design.md`

**Branch:** `feat/yearly-tax-reporting`

**Critical operational notes:**
- `bun run test:unit` is the test runner.
- `bun run db:migrate` hangs in non-TTY. Apply migration via `set -a && source .env && set +a && psql "$DATABASE_URL" -f src/db/migrations/0037_*.sql`.
- Pre-existing `YearTaxSummary` build error is unrelated — do not fix.
- Each task its own commit, `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- **Keep arch route URL change atomic** with the schema rename, so production deploy ships both at once.

---

## File Structure

**Schema/migration:**
- Modify: `src/db/schema.ts` (rename pgTable export, table string, relations export, type exports)
- Create: `src/db/migrations/0037_rename_monthly_plans.sql` (hand-written `ALTER TABLE … RENAME TO`)
- Drizzle snapshot regenerated automatically by `bun run db:generate` after migration applied.

**Action file (rename + content update):**
- Rename: `src/app/actions/monthly-plans.ts` → `src/app/actions/monthly-risk-config.ts`
- Function exports renamed: `getActiveMonthlyPlan` → `getActiveMonthlyRiskConfig`, `getMonthlyPlan` → `getMonthlyRiskConfig`, `upsertMonthlyPlan` → `upsertMonthlyRiskConfig`, `rolloverMonthlyPlan` → `rolloverMonthlyRiskConfig`

**Arch route folder rename:**
- Rename: `src/app/api/arch/monthly-plans/` → `src/app/api/arch/monthly-risk-config/`
- Files inside (`upsert/route.ts`, `get/route.ts`, `active/route.ts`) keep filenames but their internal identifiers update.

**Caller files (mechanical rename of identifiers + import paths):**
- `src/app/actions/yearly-plan.ts`
- `src/app/actions/annual-reports.ts`
- `src/app/actions/live-trading-status.ts`
- `src/app/actions/accounts.ts`
- `src/app/actions/command-center.ts`
- `src/app/api/arch/command-center/circuit-breaker/route.ts`
- `src/app/api/arch/live-status/route.ts`

**UI consumer renames (function-name imports):**
- `src/app/[locale]/(app)/command-center/page.tsx`
- `src/app/[locale]/(app)/risk-simulation/page.tsx`
- `src/app/[locale]/(app)/equity-shield/page.tsx`
- `src/components/monthly-plan/monthly-plan-tab.tsx`

**Tests:**
- Modify: `src/__tests__/lib/yearly-plan/actions-stub.test.ts` (mocks reference `monthlyPlans`)
- Modify or create: a schema-shape test that asserts the legacy export is gone and the new export is present (Task 9).

---

## Task 1: Hand-write and apply the rename migration

**Files:**
- Create: `src/db/migrations/0037_rename_monthly_plans.sql`

**Why hand-write:** Drizzle Kit may emit `DROP+CREATE` on rename detection failure, which would destroy 17 columns of production data. We avoid that by writing the migration directly.

- [ ] **Step 1: Verify the table currently exists in the local DB**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -c "\d monthly_plans" | head -5
```

Expected: lists the table columns. If the table is missing, **stop** — the local DB is out of sync with the branch. Do NOT proceed.

- [ ] **Step 2: Verify the new table name does not yet exist**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -c "\d monthly_risk_config" 2>&1 | head -3
```

Expected: `Did not find any relation named "monthly_risk_config".`

- [ ] **Step 3: Create the migration file**

File: `src/db/migrations/0037_rename_monthly_plans.sql`

```sql
ALTER TABLE "monthly_plans" RENAME TO "monthly_risk_config";
```

- [ ] **Step 4: Apply the migration**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -f src/db/migrations/0037_rename_monthly_plans.sql
```

Expected output: `ALTER TABLE`

- [ ] **Step 5: Verify the rename took effect**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -c "\d monthly_risk_config" | head -5
set -a && source .env && set +a && psql "$DATABASE_URL" -c "\d monthly_plans" 2>&1 | head -3
```

Expected: first command lists columns; second says `Did not find any relation`.

- [ ] **Step 6: Commit migration only**

```bash
git add src/db/migrations/0037_rename_monthly_plans.sql
git commit -m "$(cat <<'EOF'
feat(schema): rename monthly_plans table to monthly_risk_config (Phase 4b)

DB rename only. Schema.ts and call sites updated in following commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Do not regenerate the Drizzle snapshot yet — it would diff against the still-old `schema.ts` and try to recreate the old table.

---

## Task 2: Rename the Drizzle table export, relation, and types in `schema.ts`

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Locate the legacy table definition**

Run:

```
grep -n "monthlyPlans\|MonthlyPlan\b\|NewMonthlyPlan" src/db/schema.ts
```

Expected: matches at the pgTable export, in `tradingAccountsRelations` (relation map), at `monthlyPlansRelations`, and at the type exports near the bottom.

- [ ] **Step 2: Rename the pgTable export**

Edit the table definition:

Before:

```ts
export const monthlyPlans = pgTable(
	"monthly_plans",
	{
		// … 17 risk-config columns unchanged …
	},
	(table) => [
		// indexes …
	]
)
```

After:

```ts
export const monthlyRiskConfig = pgTable(
	"monthly_risk_config",
	{
		// … 17 risk-config columns unchanged …
	},
	(table) => [
		// indexes — note: index names like `monthly_plans_*_idx` will be regenerated
		// to `monthly_risk_config_*_idx` by Drizzle on next generate. Acceptable.
	]
)
```

- [ ] **Step 3: Rename references in `tradingAccountsRelations`**

In the `tradingAccountsRelations` block, find:

```ts
monthlyPlans: many(monthlyPlans),
```

Replace with:

```ts
monthlyRiskConfig: many(monthlyRiskConfig),
```

- [ ] **Step 4: Rename the relations export**

Find:

```ts
export const monthlyPlansRelations = relations(monthlyPlans, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [monthlyPlans.accountId],
		references: [tradingAccounts.id],
	}),
}))
```

Replace with:

```ts
export const monthlyRiskConfigRelations = relations(monthlyRiskConfig, ({ one }) => ({
	account: one(tradingAccounts, {
		fields: [monthlyRiskConfig.accountId],
		references: [tradingAccounts.id],
	}),
}))
```

(If the existing relation block has additional fields like `riskProfile`, preserve them and only rename the outer references.)

- [ ] **Step 5: Rename the type exports**

Find:

```ts
export type MonthlyPlan = typeof monthlyPlans.$inferSelect
export type NewMonthlyPlan = typeof monthlyPlans.$inferInsert
```

Replace with:

```ts
export type MonthlyRiskConfig = typeof monthlyRiskConfig.$inferSelect
export type NewMonthlyRiskConfig = typeof monthlyRiskConfig.$inferInsert
```

- [ ] **Step 6: Verify zero remaining `monthlyPlans` mentions in schema.ts**

```
grep -n "monthlyPlans\b\|MonthlyPlan\b\|NewMonthlyPlan\b" src/db/schema.ts
```

Expected: zero hits. (`monthlyPlan` singular — fractal table — must still appear.)

- [ ] **Step 7: Do NOT lint or test yet**

Code-side callers still reference the old identifiers. Lint will fail. Move to the next task immediately.

---

## Task 3: Rename the action file and its function exports

**Files:**
- Rename: `src/app/actions/monthly-plans.ts` → `src/app/actions/monthly-risk-config.ts`
- Modify: the file's content

- [ ] **Step 1: Move the file**

```
git mv src/app/actions/monthly-plans.ts src/app/actions/monthly-risk-config.ts
```

- [ ] **Step 2: Update the file's imports of schema identifiers**

In the new `src/app/actions/monthly-risk-config.ts`, update:

```ts
import { … monthlyPlans … } from "@/db/schema"
import type { MonthlyPlan } from "@/db/schema"
```

to:

```ts
import { … monthlyRiskConfig … } from "@/db/schema"
import type { MonthlyRiskConfig } from "@/db/schema"
```

- [ ] **Step 3: Rename the four exported function names**

| Old name | New name |
|---|---|
| `getActiveMonthlyPlan` | `getActiveMonthlyRiskConfig` |
| `getMonthlyPlan` | `getMonthlyRiskConfig` |
| `upsertMonthlyPlan` | `upsertMonthlyRiskConfig` |
| `rolloverMonthlyPlan` | `rolloverMonthlyRiskConfig` |

For each, change the `export const Foo = …` declaration. Also update the return type if it references `MonthlyPlan` (becomes `MonthlyRiskConfig`).

- [ ] **Step 4: Rename internal db identifiers**

Find every `monthlyPlans` (the schema export) inside the file and replace with `monthlyRiskConfig`. Keep local variables that hold a row named according to context — e.g., a variable called `existingPlan` can stay as a local name but a variable explicitly called `monthlyPlan` should become `monthlyRiskConfig` for clarity.

Example transformation:

```ts
const existingPlan = await db.query.monthlyPlans.findFirst({
    where: eq(monthlyPlans.accountId, accountId),
})
```

becomes:

```ts
const existingPlan = await db.query.monthlyRiskConfig.findFirst({
    where: eq(monthlyRiskConfig.accountId, accountId),
})
```

- [ ] **Step 5: Verify zero `monthlyPlans` references inside the file**

```
grep -n "monthlyPlans\b" src/app/actions/monthly-risk-config.ts
```

Expected: zero hits.

- [ ] **Step 6: Do NOT commit yet**

Callers still import from the old path. Continue to the next task.

---

## Task 4: Update server-action callers

**Files:**
- Modify: `src/app/actions/yearly-plan.ts`
- Modify: `src/app/actions/annual-reports.ts`
- Modify: `src/app/actions/live-trading-status.ts`
- Modify: `src/app/actions/accounts.ts`
- Modify: `src/app/actions/command-center.ts`

- [ ] **Step 1: `yearly-plan.ts` — rename schema import + identifiers**

Change line ~4:

```ts
import { yearlyPlans, monthlyPlans } from "@/db/schema"
```

to:

```ts
import { yearlyPlans, monthlyRiskConfig } from "@/db/schema"
```

In the `syncCapitalBetweenPlans` function, replace every `monthlyPlans` (schema reference) with `monthlyRiskConfig`. Replace local variables named `monthlyPlan` with `monthlyRiskConfigRow` for clarity.

Example: line 17–46 — replace `db.query.monthlyPlans.findFirst` with `db.query.monthlyRiskConfig.findFirst`, replace `monthlyPlans.id` with `monthlyRiskConfig.id`, etc.

The function signature stays:

```ts
const syncCapitalBetweenPlans = async (
	monthlyRiskConfigId: string,
	source: "monthly" | "yearly",
): Promise<ActionResponse<void>> => {
```

(Parameter renamed from `monthlyPlanId` to `monthlyRiskConfigId`.)

Also update its callers in `src/app/actions/monthly-risk-config.ts` (already touched in Task 3) — change argument name accordingly.

- [ ] **Step 2: `annual-reports.ts` — rename schema imports + select clauses**

Change line ~4:

```ts
import { accountCapitalEvents, monthlyPlans, tradingAccounts } from "@/db/schema"
```

to:

```ts
import { accountCapitalEvents, monthlyRiskConfig, tradingAccounts } from "@/db/schema"
```

In the SELECT around line 370 (inside `getWeeklyMetaVsReal`), replace:

```ts
.select({
    month: monthlyPlans.month,
    dailyProfitTargetCents: monthlyPlans.dailyProfitTargetCents,
    accountBalance: monthlyPlans.accountBalance,
})
.from(monthlyPlans)
.where(and(eq(monthlyPlans.accountId, accountId), eq(monthlyPlans.year, year)))
```

with:

```ts
.select({
    month: monthlyRiskConfig.month,
    dailyProfitTargetCents: monthlyRiskConfig.dailyProfitTargetCents,
    accountBalance: monthlyRiskConfig.accountBalance,
})
.from(monthlyRiskConfig)
.where(and(eq(monthlyRiskConfig.accountId, accountId), eq(monthlyRiskConfig.year, year)))
```

Update the comment at line ~433 from `monthlyPlans.accountBalance` to `monthlyRiskConfig.accountBalance`.

- [ ] **Step 3: `live-trading-status.ts` — rename**

Change line ~4 import. In the function, replace `monthlyPlans` schema refs (lines 44–48) with `monthlyRiskConfig`. Rename the local variable `rawMonthlyPlan` → `rawMonthlyRiskConfig` and `monthlyPlan` (line 54) → `monthlyRiskConfigRow`. Propagate to all subsequent `monthlyPlan.<field>` accesses through line ~145.

- [ ] **Step 4: `accounts.ts` — rename schema import + delete cascade**

Change line ~13 import:

```ts
import { … monthlyPlans … } from "@/db/schema"
```

to:

```ts
import { … monthlyRiskConfig … } from "@/db/schema"
```

Update the comment at line 321 (replace `monthlyPlans` with `monthly_risk_config`). Replace the deletion line at ~337:

```ts
await db.delete(monthlyPlans).where(eq(monthlyPlans.accountId, accountId))
```

with:

```ts
await db.delete(monthlyRiskConfig).where(eq(monthlyRiskConfig.accountId, accountId))
```

- [ ] **Step 5: `command-center.ts` — rename**

Change line ~14 import. In `getCircuitBreakerStatus` (around line 949), replace schema refs and local variable names following the same pattern as live-trading-status:

```ts
const rawMonthlyRiskConfig = await db.query.monthlyRiskConfig.findFirst({
    where: and(
        eq(monthlyRiskConfig.accountId, accountId),
        eq(monthlyRiskConfig.year, currentYear),
        eq(monthlyRiskConfig.month, currentMonth),
    ),
})
```

Then propagate the rename through every `monthlyPlan?.<field>` access from lines 959–1100+ (around 20 sites). Use a local alias if the long name hurts readability:

```ts
const monthlyRiskConfigRow = rawMonthlyRiskConfig
```

then continue to use `monthlyRiskConfigRow?.dailyLossCents` etc.

- [ ] **Step 6: Verify zero `monthlyPlans` references in modified files**

```
grep -n "monthlyPlans\b" src/app/actions/yearly-plan.ts src/app/actions/annual-reports.ts src/app/actions/live-trading-status.ts src/app/actions/accounts.ts src/app/actions/command-center.ts
```

Expected: zero hits.

- [ ] **Step 7: Do NOT commit yet**

Arch routes and UI consumers still reference the old identifiers.

---

## Task 5: Update arch API routes (caller routes that read `monthlyPlans`)

**Files:**
- Modify: `src/app/api/arch/command-center/circuit-breaker/route.ts`
- Modify: `src/app/api/arch/live-status/route.ts`

- [ ] **Step 1: `circuit-breaker/route.ts`**

Replace the schema import and the query:

```ts
import { … monthlyPlans … } from "@/db/schema"
```

→

```ts
import { … monthlyRiskConfig … } from "@/db/schema"
```

And inside (lines 47–52):

```ts
const rawMonthlyPlan = await db.query.monthlyPlans.findFirst({
    where: and(
        eq(monthlyPlans.accountId, accountId),
        eq(monthlyPlans.year, currentYear),
        eq(monthlyPlans.month, currentMonth),
    ),
})
```

→

```ts
const rawMonthlyRiskConfig = await db.query.monthlyRiskConfig.findFirst({
    where: and(
        eq(monthlyRiskConfig.accountId, accountId),
        eq(monthlyRiskConfig.year, currentYear),
        eq(monthlyRiskConfig.month, currentMonth),
    ),
})
```

Propagate the rename through subsequent local accesses.

- [ ] **Step 2: `live-status/route.ts`**

Same pattern as Step 1.

- [ ] **Step 3: Verify**

```
grep -n "monthlyPlans\b" src/app/api/arch/command-center/circuit-breaker/route.ts src/app/api/arch/live-status/route.ts
```

Expected: zero hits.

---

## Task 6: Rename arch route folder `monthly-plans/` → `monthly-risk-config/` and update internals

**Files:**
- Rename: `src/app/api/arch/monthly-plans/` → `src/app/api/arch/monthly-risk-config/`
- Modify: `upsert/route.ts`, `get/route.ts`, `active/route.ts` (inside the renamed folder)

- [ ] **Step 1: Move the folder**

```
git mv src/app/api/arch/monthly-plans src/app/api/arch/monthly-risk-config
```

- [ ] **Step 2: Update internals of each route file**

For each of `upsert/route.ts`, `get/route.ts`, `active/route.ts`:

- Update the schema import: `monthlyPlans` → `monthlyRiskConfig`
- Update any imports from the renamed action file: `from "@/app/actions/monthly-plans"` → `from "@/app/actions/monthly-risk-config"`
- Update function name references: `upsertMonthlyPlan` → `upsertMonthlyRiskConfig`, `getMonthlyPlan` → `getMonthlyRiskConfig`, `getActiveMonthlyPlan` → `getActiveMonthlyRiskConfig`, `rolloverMonthlyPlan` → `rolloverMonthlyRiskConfig`.

- [ ] **Step 3: Verify**

```
grep -rn "monthlyPlans\b\|monthly-plans\b" src/app/api/arch/monthly-risk-config/
```

Expected: zero hits.

---

## Task 7: Update UI consumers

**Files:**
- Modify: `src/app/[locale]/(app)/command-center/page.tsx`
- Modify: `src/app/[locale]/(app)/risk-simulation/page.tsx`
- Modify: `src/app/[locale]/(app)/equity-shield/page.tsx`
- Modify: `src/components/monthly-plan/monthly-plan-tab.tsx`

- [ ] **Step 1: Update import paths and function names in the three pages**

Each of `command-center/page.tsx`, `risk-simulation/page.tsx`, `equity-shield/page.tsx`:

```ts
import { getActiveMonthlyPlan } from "@/app/actions/monthly-plans"
```

→

```ts
import { getActiveMonthlyRiskConfig } from "@/app/actions/monthly-risk-config"
```

Update all call sites of `getActiveMonthlyPlan(...)` → `getActiveMonthlyRiskConfig(...)`.

- [ ] **Step 2: Update `monthly-plan-tab.tsx`**

Line ~20–23, replace:

```ts
import {
    upsertMonthlyPlan,
    getMonthlyPlan,
    rolloverMonthlyPlan,
} from "@/app/actions/monthly-plans"
```

with:

```ts
import {
    upsertMonthlyRiskConfig,
    getMonthlyRiskConfig,
    rolloverMonthlyRiskConfig,
} from "@/app/actions/monthly-risk-config"
```

Then replace the call sites:

- Line ~84: `getMonthlyPlan({ year: newYear, month: newMonth })` → `getMonthlyRiskConfig({ year: newYear, month: newMonth })`
- Line ~94: `Parameters<typeof upsertMonthlyPlan>` → `Parameters<typeof upsertMonthlyRiskConfig>`
- Line ~95: `upsertMonthlyPlan(data)` → `upsertMonthlyRiskConfig(data)`
- Line ~105: `rolloverMonthlyPlan(null)` → `rolloverMonthlyRiskConfig(null)`

- [ ] **Step 3: Verify zero stale references**

```
grep -rn "from \"@/app/actions/monthly-plans\"\|getActiveMonthlyPlan\|getMonthlyPlan\b\|upsertMonthlyPlan\|rolloverMonthlyPlan" src --include="*.ts" --include="*.tsx" | grep -v "/migrations/"
```

Expected: zero hits.

---

## Task 8: Update the actions-stub test

**Files:**
- Modify: `src/__tests__/lib/yearly-plan/actions-stub.test.ts`

- [ ] **Step 1: Replace `monthlyPlans` mock keys**

Current content includes:

```ts
const dbMock = {
    query: {
        yearlyPlans: { findFirst: vi.fn(), findMany: vi.fn() },
        monthlyPlans: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    …
}

vi.mock("@/db/schema", () => ({
    yearlyPlans: {},
    monthlyPlans: {},
}))
```

Replace `monthlyPlans` with `monthlyRiskConfig` in both blocks:

```ts
const dbMock = {
    query: {
        yearlyPlans: { findFirst: vi.fn(), findMany: vi.fn() },
        monthlyRiskConfig: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    …
}

vi.mock("@/db/schema", () => ({
    yearlyPlans: {},
    monthlyRiskConfig: {},
}))
```

- [ ] **Step 2: Verify**

```
grep -n "monthlyPlans" src/__tests__/lib/yearly-plan/actions-stub.test.ts
```

Expected: zero hits.

---

## Task 9: Add a schema-shape test asserting the rename took effect

**Files:**
- Modify: `src/__tests__/lib/yearly-plan/schema-types.test.ts`

- [ ] **Step 1: Add new assertion block**

Append this `describe` block to the file:

```ts
describe("monthly_risk_config rename (Phase 4b)", () => {
    it("exports renamed monthlyRiskConfig", async () => {
        const schema = await import("@/db/schema") as Record<string, unknown>
        expect(schema.monthlyRiskConfig).toBeDefined()
    })

    it("no longer exports legacy monthlyPlans", async () => {
        const schema = await import("@/db/schema") as Record<string, unknown>
        expect(schema.monthlyPlans).toBeUndefined()
    })
})
```

- [ ] **Step 2: Run only this test file**

```
bun run test:unit src/__tests__/lib/yearly-plan/schema-types.test.ts
```

Expected: both new tests PASS.

---

## Task 10: Lint + full test gate

- [ ] **Step 1: Run lint**

```
bun run lint
```

Expected: no errors.

- [ ] **Step 2: Run full test suite**

```
bun run test:unit
```

Expected: all 1088 tests pass (no count change).

- [ ] **Step 3: If any test fails**

Most failures here will be either:
- A missed schema reference — `grep -rn "monthlyPlans\b" src --include="*.ts" --include="*.tsx" | grep -v "/migrations/"` should return zero. If not, fix the offender.
- A leftover function name — `grep -rn "getActiveMonthlyPlan\|getMonthlyPlan\b\|upsertMonthlyPlan\|rolloverMonthlyPlan" src --include="*.ts" --include="*.tsx"` should return zero. If not, fix.

Loop on lint+tests until clean.

---

## Task 11: Regenerate Drizzle snapshot to align with new schema

**Files:**
- Auto-modified by Drizzle Kit: `src/db/migrations/meta/0037_snapshot.json`, `src/db/migrations/meta/_journal.json`
- Possibly: a follow-up index-rename migration if Drizzle detects index-name drift

- [ ] **Step 1: Run generate**

```
bun run db:generate
```

Expected output: either no new migration (snapshot just rewritten), OR a new `0038_*.sql` containing only `ALTER INDEX … RENAME …` statements for the indexes that were tied to the old table name.

- [ ] **Step 2: If a 0038 migration was emitted, audit it**

```
ls src/db/migrations/0038_*.sql 2>/dev/null && cat src/db/migrations/0038_*.sql
```

Acceptable contents: only `ALTER INDEX` rename statements. If it emits any `DROP INDEX` followed by `CREATE INDEX`, that is also acceptable (Postgres recreates indexes safely on a renamed table).

If it emits anything that drops or recreates the table itself, **stop** — that's a bug in the rename detection. Delete the generated migration and adjust schema.ts to use `pgTable.$inferSelect` defaults that prevent the diff.

- [ ] **Step 3: Apply the index-rename migration if present**

```
set -a && source .env && set +a && psql "$DATABASE_URL" -f src/db/migrations/0038_*.sql
```

- [ ] **Step 4: Re-run gates**

```
bun run lint && bun run test:unit
```

Expected: clean, 1088 tests green.

---

## Task 12: Single-commit consolidation of all post-migration code changes

**Why one commit:** Tasks 2 through 11 must ship atomically. A partial state where the table is renamed but call sites aren't would break the running app.

- [ ] **Step 1: Stage everything**

```
git add -A
```

- [ ] **Step 2: Verify the staging area**

```
git status --short
```

Expected: modified files in `src/db/schema.ts`, action layer, arch routes, UI consumers, and tests; renames for `monthly-plans.ts` → `monthly-risk-config.ts` and the arch folder; possibly the new `0038_*.sql` and snapshot files.

No file should be in `src/components/yearly-plan/`, `src/lib/yearly-plan/weekly-rollups.ts`, or other Phase 4 territory.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: rename monthlyPlans to monthlyRiskConfig (Phase 4b)

Resolves naming collision with the new fractal monthlyPlan table.
Pure rename — no data reshape. The legacy risk-config table now lives
under a name that reflects what it actually holds.

Touched: schema export + relations + types, action file + 4 function
exports, arch route folder + 3 endpoints, 5 server-action callers,
2 caller arch routes, 4 UI consumers, 1 mock test.

Arch URL change is intentional — external consumers must update
`/api/arch/monthly-plans/*` → `/api/arch/monthly-risk-config/*`.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Show the final log**

```
git log --oneline -5
```

Expected: at least two new commits — `0037` migration commit (Task 1) and the consolidation commit (Task 12).

---

## Task 13: Manual smoke check (operator step, not CI)

- [ ] **Step 1: Start the dev server**

```
bun run dev
```

- [ ] **Step 2: Visit `/command-center`**

Expected: page renders without server errors. Circuit breaker section displays without 500.

- [ ] **Step 3: Visit `/risk-simulation` and `/equity-shield`**

Expected: both render, no 500.

- [ ] **Step 4: Visit `/plan/[year]/[q]/[month]` and click the legacy "Risk Config" tab (if surfaced)**

Expected: the existing risk-config tab in `monthly-plan-tab.tsx` loads, can save and rollover.

- [ ] **Step 5: Hit the renamed arch endpoint**

```
curl -X POST http://localhost:3000/api/arch/monthly-risk-config/upsert \
    -H "Content-Type: application/json" \
    -H "Cookie: <session cookie>" \
    -d '{"year": 2026, "month": 5, "accountBalance": "100000"}'
```

Expected: 200 with the renamed config row.

- [ ] **Step 6: Confirm the old URL is gone**

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/arch/monthly-plans/upsert
```

Expected: 404.

- [ ] **Step 7: No commit — this is the gate.**

---

## Self-Review

**Spec coverage** (each spec section mapped to tasks):

| Spec section | Implementing task |
|---|---|
| Goal — rename only | Tasks 1–12 |
| Schema rename (table, exports, relations, types) | Task 2 |
| Migration via `ALTER TABLE … RENAME TO` | Task 1 |
| Action file rename + function name renames | Task 3 |
| Arch route folder rename | Task 6 |
| Caller files (10 total) — schema refs + variables | Tasks 4, 5, 7, 8 |
| Schema-shape test (old gone, new present) | Task 9 |
| Apply migration via `psql -f` | Task 1 |
| Final gate (lint + 1088 tests) | Task 10 |
| Drizzle snapshot regeneration | Task 11 |
| Atomic deploy | Task 12 |
| Manual smoke | Task 13 |

**Placeholder scan:** No `TBD`, no "implement later". Every step shows the actual identifier, command, or expected output. Task 4 Step 5 (command-center.ts) leaves the engineer to propagate ~20 field accesses via a local alias rather than enumerating each — that is mechanical pattern-matching, which is acceptable.

**Type consistency:**
- `monthlyRiskConfig` (schema export) — Tasks 2, 3, 4, 5, 6, 7, 8, 9
- `MonthlyRiskConfig` / `NewMonthlyRiskConfig` (types) — Tasks 2, 3
- `getActiveMonthlyRiskConfig` / `getMonthlyRiskConfig` / `upsertMonthlyRiskConfig` / `rolloverMonthlyRiskConfig` (function names) — Tasks 3, 6, 7
- `monthlyRiskConfigId` (parameter to `syncCapitalBetweenPlans`) — Task 4

All consistent across the plan.

**Risk notes:**
- Task 11 may surface a Drizzle snapshot diff that's hard to interpret. The mitigation is documented in Task 11 Step 2 — abort and adjust if Drizzle tries to drop/recreate the table.
- Task 12 commit is large by line count but tightly scoped — every change is mechanical identifier substitution. Reviewers should diff against the spec, not the line count.

---

## Execution Handoff

**Plan saved to** `docs/superpowers/plans/2026-05-05-monthly-plans-rename.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review per task. Best for catching missed identifiers in caller files.
2. **Inline Execution** — execute sequentially in this session with checkpoints between Tasks 1, 6, 10, 12. Faster, lower review overhead.
