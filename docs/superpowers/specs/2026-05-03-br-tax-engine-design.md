# BR Tax Engine — Design Specification

**Date:** 2026-05-03  
**Author:** Arch (autonomous brainstorm)  
**Status:** Draft — answers incorporated 2026-05-03  
**Scope:** Brazilian futures day-trade tax accounting (WIN/WDO) for Axion

---

## 1. Overview

Brazilian day traders in futures markets (WIN/WDO on B3) are subject to a multi-layer tax obligation: per-trade brokerage fees, per-day per-contract exchange fees, monthly DARF payment based on 20% IR on net gains, IRRF withholding at source (1% of daily gain), and an ongoing loss-carryover ledger (Prejuízo a Compensar).

The old Excel planilha (Diário SNT.xlsm) handled all of this manually, one sheet per month. The BR Tax Engine replaces that with an automated, per-account engine inside Axion that:

- Accumulates fee data from trades as they are entered
- Computes monthly DARF obligations (or exemption)
- Maintains the loss-carryover balance across months and years
- Surfaces a monthly tax dashboard and year-to-date rollup
- Is configurable per account (different fee rates, account types)

This is a pure accounting sub-system: it does not execute trades, does not give tax advice, and produces informational figures only.

---

## 2. Assumptions

These are interpretive decisions made in the absence of a tax advisor. All figures should be validated against current Receita Federal / B3 circulars before production use.

| # | Assumption | Basis |
|---|---|---|
| A1 | Day-trade IR rate = **20%** on net monthly gain after loss-carryover | Lei 11.033/2004, art. 2º, §2º — explicitly 20% for day-trade; confirmed in planilha "IR 19%" label is the *remaining* rate after 1% IRRF is pre-deducted (i.e., 20% − 1% IRRF already paid = 19% owed at DARF time) |
| A2 | IRRF = **1%** withheld at source daily on positive day-trade result; deductible from monthly IR | IN RFB 1585/2015, art. 57 |
| A3 | **ISS is charged separately by the broker on futures.** ISS São Paulo rate = **5% on Corretagem** (i.e. `ISS = txCorretagem × 0.05`). This is NOT a flat per-contract fee — it is a percentage of the brokerage commission. Stored as `issRatePercent` (default "5.00") in `accountFeeRates`. ISS is an **informational deduction** (municipal tax, not income tax); it reduces net P&L display and is subtracted from gross before computing taxable base, but is NOT reported as income tax in DARF. Configurable per account because São Paulo 5% is the most common rate but not universal. | Confirmed by Ygor 2026-05-03 |
| A4 | DARF is due on the **last business day of the month following** the gain month | IN RFB 1585/2015 |
| A5 | Carryover (**Prejuízo a Compensar**) accumulates indefinitely across months and calendar years. There is no annual reset. | Interpretação consolidada da legislação; IN RFB 1585/2015 does not set a time limit for day-trade loss carry-forward |
| A6 | Fee defaults: `Tx Corretagem = R$0.05/contract`, `Tx Registro = R$0.74/contract`, `Emolumentos = R$0.40/contract`, `ISS = 5% of Corretagem` (= R$0.0025/contract at default corretagem rate) | Confirmed by Ygor 2026-05-03; corretagem/registro/emolumentos from planilha Jan/Fev CSVs |
| A7 | `contractsExecuted` on a trade = entry contracts + exit contracts. For a standard 1-contract round trip, `contractsExecuted = 2`. Fees are charged on both legs. | Planilha "Cnts." column = round-trip count |
| A8 | Per-month fee base = sum of all fee-eligible contracts across trading days in that month (gains + losses alike) | Exchange fees are charged regardless of outcome |
| A9 | Prop-firm accounts (`accountType = 'prop'`) are **excluded from personal IR/DARF calculation** by default. The prop firm handles taxes on the firm's side; the trader's net is their profit-share only. Flag is configurable. | Industry standard for prop firms; `profitSharePercentage` already exists on `tradingAccounts` |
| A10 | Multi-account: each personal account maintains **its own separate carryover ledger**. Accounts are not combined for tax purposes unless Ygor explicitly configures account-grouping (out of scope v1). | Most traders operate one personal account; combining is a future enhancement |
| A11 | Currency = BRL throughout. All monetary amounts stored in cents (integer). | Existing Axion convention |
| A12 | "Saldo Anterior" in planilha = previous month's unpaid DARF balance carried forward as an additional debt, NOT the same as loss carryover. Treated as informational in v1. | Planilha structure |
| A13 | **Swing-trade is out of scope for v1.** User operates day-trade only on WIN/WDO. No swing-trade ledger, no 15% rate, no dual-ledger logic. If swing-trade is added in a future version it MUST use a separate ledger because BR tax law (Lei 11.033/2004) segregates day-trade vs. swing-trade carryovers — they cannot be mixed. The `tradingAccounts.swingTradeTaxRate` field is left untouched in the DB schema but the tax engine does not read or populate it. | Confirmed by Ygor 2026-05-03 |
| A14 | "Gastos Gerais" (operational expenses) are informational only — they reduce the reported net result display but do NOT offset taxable gain for IR purposes in this model | Planilha treatment; verifiable with accountant |
| A15 | The **30% IR + Taxas projection rule** in Planejamento.csv means: when projecting net liquid returns, reserve 30% of gross profit for combined taxes + fees. This is a planning heuristic, not a statutory rate. The engine computes exact figures; the 30% acts as a display warning when actual tax+fee burden exceeds or approaches 30%. | Planilha row "IR + Taxas = 30%" in Planejamento sheet |

---

## 3. User Stories

**US-1 — DARF this month**  
As a trader, after market close on the last day of the month, I want to see exactly how much DARF I owe (or R$0 / ISENTO), so I can schedule the payment before the due date.

**US-2 — Carryover balance**  
As a trader, I want to know my current accumulated loss balance (Prejuízo a Compensar), so I understand how much future gain is tax-free before IR kicks in.

**US-3 — Daily fee breakdown**  
As a trader, when reviewing a trading day in the journal, I want to see the itemized fees (Corretagem, Registro, Emolumentos, IRRF) for that day, so I know the true cost of operating.

**US-4 — Year-to-date IR summary**  
As a trader, I want a running total of: gross gain, total fees paid, total IRRF withheld, total DARF paid, and net liquid result for the current year, so I can prepare my annual DIRPF and benchmark against the 30% heuristic.

**US-5 — Fee rate configuration**  
As a trader, I want to configure brokerage and exchange fee rates per account (because brokers differ), so the engine uses my actual rates rather than defaults.

**US-6 — Prop firm awareness**  
As a prop-firm trader, I want the engine to skip personal DARF calculations for my prop account, because the firm handles taxes, so I don't see misleading IR obligations.

---

## 4. Data Model

### 4.1 Per-trade fee storage

The `trades` table already has `commission` (encrypted, cents per contract) and `fees` (encrypted, cents per contract) fields, plus `contractsExecuted`. These store **per-contract unit rates**, not totals. The engine derives total fees as:

```
totalFees = (commission + fees) × contractsExecuted
```

For the BR tax model, `commission` maps to `Tx Corretagem` and `fees` maps to `Tx Registro + Emolumentos`. The distinction between Registro and Emolumentos is not stored per-trade — it is derived from account-level rate config at compute time.

**Decision: no new columns on `trades`.** The existing `commission` + `fees` + `contractsExecuted` fields are sufficient. The fee breakdown is reconstructed from account rates during ledger computation.

### 4.2 Account-level fee rate config

Add a new table `accountFeeRates` rather than expanding `tradingAccounts` further. This keeps the account table clean and allows per-asset rate overrides in the future.

```typescript
export const accountFeeRates = pgTable(
  "account_fee_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),

    // Asset filter — NULL means "applies to all assets on this account"
    assetSymbol: varchar("asset_symbol", { length: 20 }),

    // Per-contract rates in cents (BRL)
    // Stored as integers: R$0.05 → 5 cents, R$0.74 → 74 cents, R$0.40 → 40 cents
    txCorretagem: integer("tx_corretagem").default(5).notNull(),   // 5 = R$0.05
    txRegistro: integer("tx_registro").default(74).notNull(),      // 74 = R$0.74
    emolumentos: integer("emolumentos").default(40).notNull(),     // 40 = R$0.40

    // ISS rate as a percentage of txCorretagem (NOT a per-contract flat fee)
    // e.g. "5.00" = 5% → ISS = txCorretagem × 0.05 per contract
    // São Paulo default = 5.00; configurable because ISS is a municipal tax and rates vary
    issRatePercent: decimal("iss_rate_percent", { precision: 5, scale: 2 }).default("5.00").notNull(),

    // Withholding rate: 100 = 1.00%
    irrfRateBps: integer("irrf_rate_bps").default(100).notNull(),  // basis points

    // IR rate: 2000 = 20.00%
    irRateBps: integer("ir_rate_bps").default(2000).notNull(),

    // Whether personal IR applies (false for prop accounts by default)
    subjectToPersonalIr: boolean("subject_to_personal_ir").default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("account_fee_rates_account_idx").on(table.accountId),
    uniqueIndex("account_fee_rates_account_asset_idx").on(
      table.accountId,
      table.assetSymbol
    ),
  ]
)
```

### 4.3 Monthly Tax Ledger

**Recommendation: materialize monthly.** Computing from raw trades on every read is viable for low trade counts but becomes expensive for yearly rollups across multiple accounts. A materialized `monthlyTaxLedger` row per account-month provides instant reads and is recomputed on demand (see Section 10).

```typescript
export const darfStatusEnum = pgEnum("darf_status", [
  "pending",    // gain month, DARF not yet paid
  "paid",       // trader manually marked as paid
  "exempt",     // ISENTO: net gain ≤ 0 after carryover
  "overdue",    // past due date, still unpaid
])

export const monthlyTaxLedger = pgTable(
  "monthly_tax_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => tradingAccounts.id, { onDelete: "cascade" }),

    // Month identifier (always first day of month, UTC midnight)
    month: timestamp("month", { withTimezone: true }).notNull(),

    // ── Gross P&L ─────────────────────────────────────────────
    grossGainCents: bigint("gross_gain_cents", { mode: "number" }).default(0).notNull(),
    // Sum of pnl for all day-trade closes in this month (before fees/taxes)

    // ── Fees ──────────────────────────────────────────────────
    totalTxCorretagem: bigint("total_tx_corretagem", { mode: "number" }).default(0).notNull(),
    totalTxRegistro: bigint("total_tx_registro", { mode: "number" }).default(0).notNull(),
    totalEmolumentos: bigint("total_emolumentos", { mode: "number" }).default(0).notNull(),
    totalIss: bigint("total_iss", { mode: "number" }).default(0).notNull(),
    totalFeesCents: bigint("total_fees_cents", { mode: "number" }).default(0).notNull(),
    // totalFeesCents = sum of all four fee columns above

    totalContractsExecuted: decimal("total_contracts_executed", { precision: 20, scale: 4 }).default("0").notNull(),

    // ── IRRF (retained at source) ─────────────────────────────
    irrfCents: bigint("irrf_cents", { mode: "number" }).default(0).notNull(),
    // Sum of 1% × max(0, daily_gross_gain) across all days in month

    // ── Net gain for IR base ──────────────────────────────────
    netGainBeforeCarryoverCents: bigint("net_gain_before_carryover_cents", { mode: "number" }).default(0).notNull(),
    // = grossGainCents − totalFeesCents

    // ── Carryover ─────────────────────────────────────────────
    carryoverInCents: bigint("carryover_in_cents", { mode: "number" }).default(0).notNull(),
    // Accumulated loss balance at START of this month (positive = loss owed)
    carryoverConsumedCents: bigint("carryover_consumed_cents", { mode: "number" }).default(0).notNull(),
    // How much of carryoverIn was consumed offsetting gain this month
    carryoverOutCents: bigint("carryover_out_cents", { mode: "number" }).default(0).notNull(),
    // Remaining carryover passed to next month

    // ── IR Calculation ────────────────────────────────────────
    taxableGainCents: bigint("taxable_gain_cents", { mode: "number" }).default(0).notNull(),
    // = max(0, netGainBeforeCarryoverCents − carryoverConsumedCents)
    irGrossCents: bigint("ir_gross_cents", { mode: "number" }).default(0).notNull(),
    // = taxableGainCents × irRateBps / 10000
    darfDueCents: bigint("darf_due_cents", { mode: "number" }).default(0).notNull(),
    // = max(0, irGrossCents − irrfCents)

    // ── DARF status ───────────────────────────────────────────
    darfStatus: darfStatusEnum("darf_status").default("pending").notNull(),
    darfDueDate: timestamp("darf_due_date", { withTimezone: true }),
    darfPaidAt: timestamp("darf_paid_at", { withTimezone: true }),
    darfPaidAmountCents: bigint("darf_paid_amount_cents", { mode: "number" }),

    // ── Saldo Anterior (informational) ────────────────────────
    previousBalanceCents: bigint("previous_balance_cents", { mode: "number" }).default(0).notNull(),

    // ── Gastos Gerais (informational, not tax-deductible) ─────
    gastosGeraisCents: bigint("gastos_gerais_cents", { mode: "number" }).default(0).notNull(),

    // ── Net liquid result (display) ───────────────────────────
    netLiquidCents: bigint("net_liquid_cents", { mode: "number" }).default(0).notNull(),
    // = grossGainCents − totalFeesCents − darfDueCents − gastosGeraisCents

    // ── Audit ─────────────────────────────────────────────────
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    tradeCount: integer("trade_count").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monthly_tax_ledger_account_idx").on(table.accountId),
    uniqueIndex("monthly_tax_ledger_account_month_idx").on(table.accountId, table.month),
    index("monthly_tax_ledger_darf_status_idx").on(table.darfStatus),
  ]
)
```

### 4.4 Migration Plan

1. `drizzle-kit generate` to produce the migration file for `accountFeeRates` + `monthlyTaxLedger` + `darfStatusEnum`.
2. Seed `accountFeeRates` with defaults (txCorretagem=5, txRegistro=74, emolumentos=40, issRatePercent="5.00", irrfRateBps=100, irRateBps=2000) for every existing `tradingAccounts` row where `accountType = 'personal'`.
3. Prop accounts (`accountType = 'prop'`): seed with `subjectToPersonalIr = false`.

**No historical backfill.** The ledger starts from the first trade recorded in Axion. Pre-Axion planilha months will not be imported — confirmed by Ygor 2026-05-03. The engine will naturally build carryover state forward from the first recorded trade month.

---

## 5. Math Engines

All math lives in `src/lib/tax/`. Each module is a pure function — no DB calls, no side effects. Fully unit-testable.

### 5.1 `fee-allocator.ts`

```typescript
interface FeeRates {
  txCorretagemCents: number   // per contract, e.g. 5 = R$0.05
  txRegistroCents: number     // per contract, e.g. 74 = R$0.74
  emolumentosCents: number    // per contract, e.g. 40 = R$0.40
  // ISS is NOT a per-contract flat — it is a percentage of txCorretagem
  // e.g. issRatePercent = 5.00 → ISS = txCorretagem × 0.05 per contract
  issRatePercent: number      // e.g. 5.00 for São Paulo 5%
}

interface DayFeeInput {
  contractsExecuted: number
  rates: FeeRates
}

interface DayFeeOutput {
  txCorretagem: number   // cents
  txRegistro: number     // cents
  emolumentos: number    // cents
  iss: number            // cents — derived: txCorretagem × issRatePercent / 100
  subtotal: number       // cents — sum of all four
}

const allocateDayFees = (input: DayFeeInput): DayFeeOutput => {
  const { contractsExecuted, rates } = input
  const txCorretagem = Math.round(rates.txCorretagemCents * contractsExecuted)
  const txRegistro   = Math.round(rates.txRegistroCents * contractsExecuted)
  const emolumentos  = Math.round(rates.emolumentosCents * contractsExecuted)
  // ISS = txCorretagem (total, not per-contract) × rate / 100
  const iss          = Math.round(txCorretagem * rates.issRatePercent / 100)
  return {
    txCorretagem,
    txRegistro,
    emolumentos,
    iss,
    subtotal: txCorretagem + txRegistro + emolumentos + iss,
  }
}
```

### 5.2 `darf-calculator.ts`

```typescript
interface DarfInput {
  grossGainCents: number         // sum of day-trade pnl for the month
  totalFeesCents: number         // sum of all fees: corretagem + registro + emolumentos + ISS
  // ISS is an informational deduction (municipal tax, not income tax).
  // It is included in totalFeesCents and reduces the taxable base — it is NOT reported as DARF.
  irrfCents: number              // already-withheld 1% daily IRRF sum
  carryoverInCents: number       // accumulated loss at start of month (day-trade only)
  irRateBps: number              // e.g. 2000 = 20% day-trade IR rate
  subjectToPersonalIr: boolean
}

interface DarfOutput {
  netGainBeforeCarryover: number
  carryoverConsumed: number
  carryoverOut: number
  taxableGain: number
  irGross: number
  darfDue: number                // net DARF owed after deducting IRRF
}

const computeDarf = (input: DarfInput): DarfOutput => {
  if (!input.subjectToPersonalIr) {
    // Prop account: no personal IR
    return {
      netGainBeforeCarryover: 0,
      carryoverConsumed: 0,
      carryoverOut: input.carryoverInCents,
      taxableGain: 0,
      irGross: 0,
      darfDue: 0,
    }
  }

  const netGainBeforeCarryover = input.grossGainCents - input.totalFeesCents

  // If net is negative, add to carryover, no tax
  if (netGainBeforeCarryover <= 0) {
    return {
      netGainBeforeCarryover,
      carryoverConsumed: 0,
      carryoverOut: input.carryoverInCents + Math.abs(netGainBeforeCarryover),
      taxableGain: 0,
      irGross: 0,
      darfDue: 0,
    }
  }

  // Positive net: consume carryover first
  const carryoverConsumed = Math.min(input.carryoverInCents, netGainBeforeCarryover)
  const taxableGain = netGainBeforeCarryover - carryoverConsumed
  const carryoverOut = input.carryoverInCents - carryoverConsumed

  const irGross = Math.round((taxableGain * input.irRateBps) / 10000)
  const darfDue = Math.max(0, irGross - input.irrfCents)

  return {
    netGainBeforeCarryover,
    carryoverConsumed,
    carryoverOut,
    taxableGain,
    irGross,
    darfDue,
  }
}
```

### 5.3 `carryover-ledger.ts`

```typescript
interface MonthSummary {
  month: Date      // first day of month
  netGainCents: number
}

interface CarryoverState {
  balanceCents: number      // current loss balance (positive = loss owed)
  monthsInDeficit: number   // how many consecutive months contributed to balance
  exhaustedAt: Date | null  // first month when carryover was fully consumed
}

// Reduces an ordered array of month summaries into a running carryover state
const buildCarryoverChain = (months: MonthSummary[]): CarryoverState[] => {
  let balance = 0
  let monthsInDeficit = 0

  return months.map((monthData) => {
    const { netGainCents } = monthData
    if (netGainCents < 0) {
      balance += Math.abs(netGainCents)
      monthsInDeficit++
      return { balanceCents: balance, monthsInDeficit, exhaustedAt: null }
    }
    const consumed = Math.min(balance, netGainCents)
    balance -= consumed
    if (consumed > 0 && balance === 0) {
      return { balanceCents: 0, monthsInDeficit, exhaustedAt: monthData.month }
    }
    return { balanceCents: balance, monthsInDeficit, exhaustedAt: null }
  })
}
```

### 5.4 `irrf-accumulator.ts`

IRRF is withheld daily on positive day-trade results only. Monthly total = sum of 1% × max(0, dailyGross) for each trading day.

```typescript
interface DailyResult {
  date: Date
  grossPnlCents: number
}

interface IrrfResult {
  totalIrrfCents: number
  irrfByDay: Array<{ date: Date; irrfCents: number }>
}

const accumulateIrrf = (
  days: DailyResult[],
  irrfRateBps: number
): IrrfResult => {
  const irrfByDay = days.map((day) => ({
    date: day.date,
    irrfCents: day.grossPnlCents > 0
      ? Math.round((day.grossPnlCents * irrfRateBps) / 10000)
      : 0,
  }))
  return {
    totalIrrfCents: irrfByDay.reduce((sum, d) => sum + d.irrfCents, 0),
    irrfByDay,
  }
}
```

---

## 6. Server Actions

Location: `src/app/actions/tax-engine.ts`

```typescript
// Returns the full monthly ledger row for a given account + month.
// Creates or recomputes if stale.
const getMonthlyDarf: (params: {
  accountId: string
  year: number
  month: number  // 1-12
}) => Promise<MonthlyTaxLedgerRow>

// Returns the current carryover balance and its history
const getCarryoverState: (params: {
  accountId: string
}) => Promise<{
  currentBalanceCents: number
  history: Array<{ month: Date; balanceCents: number; consumed: number }>
}>

// Full recompute of all ledger rows for an account from startMonth to now.
// Called after bulk trade import, trade edit, or manual request.
// Returns how many months were recomputed.
const recomputeLedger: (params: {
  accountId: string
  fromYear?: number   // defaults to earliest trade year
  fromMonth?: number  // defaults to earliest trade month
}) => Promise<{ recomputedMonths: number }>

// Year-to-date summary for annual reporting
const getYearTaxSummary: (params: {
  accountId: string
  year: number
}) => Promise<{
  grossGainCents: number
  totalFeesCents: number
  totalIrrfCents: number
  totalDarfPaidCents: number
  totalDarfPendingCents: number
  netLiquidCents: number
  irBurdenPercent: number       // (irGross / grossGain) × 100
  heuristicWarning: boolean     // true if (fees + ir) / grossGain > 0.30
}>
```

---

## 7. Routes & Pages

**Recommendation: extend `/reports` with a Tax tab, rather than a new `/tax` route.**

Rationale: traders already navigate to Reports for P&L analysis. Adding a "Taxes" tab keeps all financial output in one place. A standalone `/tax` route would fragment navigation. The tab can be visually distinguished with the gold accent.

Route path: `/[locale]/(app)/reports` — add `?tab=taxes` query param (existing reports pattern).

New server component: `src/app/[locale]/(app)/reports/tax/page.tsx`  
New client components: see Section 8.

---

## 8. Components

### `MonthlyDarfCard`

Displays the current month's DARF obligation. One card per account. Props:

```typescript
interface MonthlyDarfCardProps {
  accountId: string
  year: number
  month: number
  ledgerRow: MonthlyTaxLedgerRow
  onMarkPaid: (paidAmountCents: number) => Promise<void>
}
```

Shows: gross gain, fees, IRRF withheld, carryover applied, taxable gain, DARF due, due date, status badge (ISENTO / Pendente / Pago / Vencido). Mark-as-paid action triggers a server action and revalidates. Target ≤180 LOC.

### `CarryoverLedger`

Timeline of carryover balance across months. Shows how much loss remains uncompensated.

```typescript
interface CarryoverLedgerProps {
  history: Array<{
    month: Date
    balanceCents: number
    consumed: number
    netGainCents: number
  }>
}
```

Renders as a vertical list with color coding: red rows = loss month (balance grew), green rows = gain month offset by carryover. Target ≤150 LOC.

### `FeeBreakdownTable`

Per-day itemized fees for a given month. Used in Journal day view and Tax tab.

```typescript
interface FeeBreakdownTableProps {
  rows: Array<{
    date: Date
    contractsExecuted: number
    txCorretagem: number
    txRegistro: number
    emolumentos: number
    iss: number
    irrf: number
    subtotal: number
  }>
  totals: {
    txCorretagem: number
    txRegistro: number
    emolumentos: number
    iss: number
    irrf: number
    subtotal: number
  }
}
```

Renders as a compact table with totals row. Sortable by date. Target ≤200 LOC.

### `AnnualTaxSummary`

Year-to-date rollup for the Annual Reporting sub-project data handoff.

```typescript
interface AnnualTaxSummaryProps {
  year: number
  summary: YearTaxSummary  // from getYearTaxSummary action
  months: MonthlyTaxLedgerRow[]
}
```

Shows: YTD gross, fees, IRRF, DARF owed vs paid, net liquid, and a visual gauge comparing actual tax+fee burden to the 30% heuristic. Target ≤180 LOC.

---

## 9. Settings Integration

### 9.1 Fee Rate Configuration

Add a "Taxas e Corretagem" section to the existing account settings page (`/settings/accounts/[id]`). Fields:

- Tx Corretagem (R$ per contrato)
- Tx Registro (R$ per contrato)
- Emolumentos (R$ per contrato)
- ISS rate (% of Corretagem, defaults 5.00% — São Paulo municipal rate)
- IRRF rate (%, defaults 1%)
- IR day-trade rate (%, defaults 20%) — **source of truth is `accountFeeRates.irRateBps`**; the existing `tradingAccounts.dayTradeTaxRate` (encrypted) is deprecated for tax-engine purposes and should be migrated to `accountFeeRates` at seeding time. Do not read both — `accountFeeRates` wins.

On save, upsert `accountFeeRates` row and trigger `recomputeLedger` for the current and future months.

### 9.2 Account Type Awareness

- `accountType = 'personal'`: full IR/DARF calculation active
- `accountType = 'prop'`: `subjectToPersonalIr = false` by default; DARF card shows "N/A — Prop Firm" with a tooltip explaining the firm handles IR
- `accountType = 'replay'`: tax engine disabled entirely; no ledger rows created

### 9.3 `showTaxEstimates` toggle

`tradingAccounts.showTaxEstimates` already exists. When false, the Tax tab and per-day fee overlay are hidden throughout the UI.

---

## 10. Recompute Strategy

**Chosen approach: lazy materialization with dirty-flag invalidation.**

- On every trade CREATE / UPDATE / DELETE that affects a day-trade result or contract count, mark the corresponding month's ledger row as dirty (`computedAt = null` or set a `isDirty` boolean).
- The `getMonthlyDarf` server action checks for dirty/missing rows and recomputes them (plus all subsequent months, to propagate carryover changes) before returning.
- Recompute is O(months since first trade), typically under 50ms for a year of monthly rows.
- A cron trigger (`recomputeLedger` called server-side at month rollover) ensures the new month's carryover seed is always correct.
- **No background workers required for v1.** Recompute on read is fast enough. If trade volume grows (e.g., bulk CSV import of 500+ trades), run `recomputeLedger` as a deferred server action post-import.

When `recomputeLedger` runs for a range of months, it:
1. Fetches all trades for the account in date range, ordered by `entryDate`.
2. Groups by month.
3. Computes fee totals per day via `fee-allocator`.
4. Computes IRRF per day via `irrf-accumulator`.
5. Runs `darf-calculator` for each month in sequence, threading `carryoverOut` of month N → `carryoverIn` of month N+1.
6. Upserts `monthlyTaxLedger` rows in a single transaction.

---

## 11. Edge Cases

| Case | Handling |
|---|---|
| **Multi-account, separate carryovers** | Each account has its own `monthlyTaxLedger` chain. Carryover never crosses account boundaries in v1. |
| **Prop-firm account** | `subjectToPersonalIr = false` → DARF = 0, carryover not tracked. Fee breakdown still shown (informational). |
| **Overnight/swing-trade positions** | Out of scope for v1 (user operates day-trade only on WIN/WDO). Any position where `exitDate.date !== entryDate.date` is excluded from the tax engine entirely and produces no ledger row. If swing-trade is added later, a separate ledger is required — BR law does not allow mixing day-trade and swing-trade carryovers. |
| **DARF mid-cycle correction** | If Ygor realizes he underpaid a DARF, he can edit `darfPaidAmountCents` directly; `recomputeLedger` does NOT overwrite manual `darfPaidAt` or `darfPaidAmountCents`. |
| **Year-end carryover** | `carryoverOutCents` from December flows to January of the next year. No reset. |
| **Currency** | All amounts in BRL cents. No multi-currency support for BR tax engine. |
| **Zero-contract day (market holiday)** | No trades = no ledger row for that day. Fee totals simply skip that date. |
| **Replay accounts** | Tax engine disabled. `accountType = 'replay'` skips all computations. |
| **Trade edit changes month** | If a trade's `entryDate` is moved across a month boundary, the dirty-flag system marks both the old and new month dirty, triggering full recompute from the earlier of the two months. |
| **IRRF already documented by broker** | IRRF is computed by the engine from daily gross gains. If the broker provides IRRF notes/informe, those are reconciliation tools for the trader — no import mechanism in v1. |

---

## 12. Testing Strategy

### Unit tests (mandatory — `src/__tests__/lib/tax/`)

Test each math engine against hand-computed fixtures:

**`darf-calculator.test.ts`**  
- Gain month, no carryover: assert `darfDue = (grossGain − fees) × 0.20 − irrf`  
- Loss month: assert `darfDue = 0`, `carryoverOut = carryoverIn + |net|`  
- Partial carryover consumption: gain partially absorbed by loss balance  
- Prop account: assert all outputs = 0  
- IRRF exceeds IR gross (rare): assert `darfDue = 0`, never negative  

**`fee-allocator.test.ts`**  
- 2 contracts (1 round trip), issRatePercent=5.00: `txCorretagem = 10`, `txRegistro = 148`, `emolumentos = 80`, `iss = 1` (= 10 × 0.05, rounded), `subtotal = 239`  
- issRatePercent=0: `iss = 0`  
- 0 contracts: all zeros  
- Fractional contracts (scaled entries): rounding to nearest cent  

**`carryover-ledger.test.ts`**  
- Single loss month → 2 gain months exhausting it  
- Multi-year continuous loss  
- Carryover exhaustion flag on correct month  

**`irrf-accumulator.test.ts`**  
- Mix of positive and negative days: only positive days contribute IRRF  
- All loss days: `totalIrrfCents = 0`  

Fixtures derived from planilha CSVs (all-zero months serve as baseline; real data to be populated once Ygor has actual trading months with values).

### DB integration tests (`src/__tests__/db/tax/`)

- `recomputeLedger` produces correct `monthlyTaxLedger` rows from seeded trades  
- Carryover chain integrity across 3+ consecutive months  
- `darfStatus` transitions (pending → paid, pending → overdue)  

### E2e (Playwright — `e2e/tax/`)

**Happy path:**  
1. Create personal account, configure fee rates  
2. Log 3 trades in month A (net gain R$500)  
3. Navigate to Reports → Taxes tab  
4. Assert DARF card shows correct amount  
5. Mark DARF as paid  
6. Assert status badge updates to "Pago"  

---

## 13. Integration Contracts

Defines what this sub-system provides to other specs and what it consumes from them. Use these contracts when designing Annual Reporting, Yearly Plan, or any other feature that needs tax figures — do NOT read `monthlyTaxLedger` directly from those features; use the server actions below.

### 13.1 PROVIDES

#### Data shape — `monthlyTaxLedger[accountId, year, month]`

Each row exposes the following fields to consumers:

| Field | Type | Description |
|---|---|---|
| `grossPnlCents` | `bigint` | Sum of day-trade P&L before fees/taxes |
| `feesTotalCents` | `bigint` | Total fees (breakdown below) |
| `feesBreakdown.corretagem` | `bigint` | Tx Corretagem total for month |
| `feesBreakdown.registro` | `bigint` | Tx Registro total for month |
| `feesBreakdown.emolumentos` | `bigint` | Emolumentos total for month |
| `feesBreakdown.iss` | `bigint` | ISS total (= corretagem × issRatePercent/100) — informational, municipal tax |
| `feesBreakdown.irrf` | `bigint` | IRRF withheld at source for month |
| `netPnlCents` | `bigint` | `grossPnlCents − feesTotalCents` |
| `taxableBaseCents` | `bigint` | Net after carryover consumption |
| `irDueCents` | `bigint` | IR gross before IRRF deduction |
| `darfStatus` | `enum` | `pending | paid | exempt | overdue` |
| `carryoverInCents` | `bigint` | Loss balance at start of month |
| `carryoverOutCents` | `bigint` | Loss balance passed to next month |

#### Server actions

```typescript
// Used by: Annual Reporting — "Imposto" column per month
getMonthlyDarf(params: { accountId: string; year: number; month: number })
  => Promise<MonthlyTaxLedgerRow>

// Used by: Annual Reporting — annual rollup row
getYearTaxSummary(params: { accountId: string; year: number })
  => Promise<YearTaxSummary>

// Used by: Yearly Plan — "Líquido" projection column
// Returns the effective combined rate (fees + IR) as a decimal for a given month
// so Yearly Plan can compute accurate net projections instead of the flat 30% heuristic
getEffectiveTaxRate(params: { accountId: string; month: string })
  => Promise<{ ratePercent: number; breakdown: { feesPercent: number; irPercent: number } }>
```

#### Pure module

`fee-allocator.ts` — importable as a pure function with no DB dependency. Any spec that needs to compute fee breakdown from raw contract counts and rates can import it directly.

### 13.2 CONSUMES

| Dependency | Source | Notes |
|---|---|---|
| `trades.netPnlCents` | `trades` table | Raw P&L per trade (encrypted field) |
| `trades.contractsExecuted` | `trades` table | Used by fee-allocator per trade |
| `accountFeeRates[accountId]` | `account_fee_rates` table | **Single source of truth for all fee rates.** Deprecates `tradingAccounts.dayTradeTaxRate` for tax-engine purposes — `accountFeeRates.irRateBps` wins on conflict. |
| `tradingAccounts.accountType` | `trading_accounts` table | Used to skip personal IR for `prop` accounts; disable engine entirely for `replay` accounts |

---

## 14. Open Questions

**Blocking questions resolved 2026-05-03** (Q1 ISS, Q4 swing-trade, Q7 backfill — see Assumptions A3/A13 and Section 4.4).

Remaining questions are non-blocking; defaults are in place and can be adjusted post-launch.

| # | Question | Impact | Default if unanswered |
|---|---|---|---|
| Q2 | **Prop firm tax tab visibility**: Should prop accounts show the fee breakdown (informational) even though IR is skipped? Or hide the tax tab entirely? | Component visibility logic | Show fee breakdown, hide DARF card, display "N/A — Prop Firm" banner |
| Q3 | **Multi-account carryover**: Do you want a unified tax view across personal + prop accounts, or always per-account? | Scope of v1 vs future | Always separate (v1) |
| Q5 | **DARF payment tracking**: Log DARF payments (amount + date) inside Axion for the annual report, or external tracking only? | `darfPaidAt`/`darfPaidAmountCents` fields exist; UI mark-as-paid action designed | Fields included; mark-as-paid UI built as designed |
| Q6 | **Gastos Gerais**: Which operational expenses to track (VPS, data feeds, charting subscriptions)? Manual entry or future import? | `gastosGeraisCents` field exists; no import mechanism in v1 | Manual entry via settings; import out of scope v1 |
