# Axion — Server Actions & API

> **Single source of truth: `src/app/actions/**` and `src/app/api/**`.**
> This doc describes the *patterns* — response shape, auth, account scoping, error codes, and the action-vs-route split — not individual function signatures.
> For the live signature of any action, read its source file.

## 1. Two Layers

Axion exposes its server-side surface in two ways:

| Layer | Path | Use for |
|---|---|---|
| **Server Actions** | `src/app/actions/**/*.ts` | First-party calls from React Server Components and form actions. The default surface. |
| **API Routes** | `src/app/api/**/route.ts` | Third-party callers, webhooks, file uploads, and internal endpoints under `/api/arch/*` consumed by client components or external tools. |

If both a server action and an API route exist for a feature, the action is canonical and the route is a thin HTTP wrapper around it. Never duplicate logic — share the underlying service function.

## 2. Action Response Shape

Every server action returns the canonical `ActionResponse<T>` defined in `src/types/index.ts`:

```ts
type ActionResponse<T> = {
  status: "success" | "error";
  message: string;
  data?: T;
  errors?: Array<{ code: string; detail: string }>;
};
```

Rules:
- Always populate `message` — it's not optional. Use a short user-readable phrase.
- `data` is present only on `status: "success"`.
- `errors` is an array, even for a single error, so callers can iterate uniformly.
- Don't throw across the action boundary — convert exceptions to `{ status: "error", errors: [...] }`.

> **Drift note**: a few legacy actions (`src/app/actions/reports.ts`, `annual-reports.ts`) return slightly different shapes (`message?` optional, no `errors[]`). New actions MUST follow the canonical shape; convert legacy ones opportunistically.

## 3. Auth & Account Scoping

Every server action that touches account-scoped data MUST:

1. Resolve the current user via `requireAuth()` from `src/app/actions/auth.ts`. This throws / redirects on no session.
2. Resolve the active `accountId` via `getCurrentAccount()`. The active account lives in the session.
3. Filter every query by `accountId`.

Public actions (login, register, password recovery, email verification) skip step 1 but still go through input validation.

There is no per-action role check sprinkled in code — role gating is done at the navigation layer and reinforced by RLS-style scoping at the DB layer.

## 4. Input Validation

- All action inputs are validated with **Zod** schemas defined in `src/lib/validations/`.
- Schemas live next to the domain (`src/lib/validations/trades.ts`, etc.) and are imported into the action.
- Reject with `errors: [{ code: "VALIDATION_ERROR", detail }]` on parse failure.

## 5. Error Codes

Use a stable, uppercase, snake-case code. Detail message is human-readable. Common codes:

| Code | Meaning |
|---|---|
| `UNAUTHORIZED` | No session / not logged in |
| `VALIDATION_ERROR` | Zod parse failure |
| `NOT_FOUND` | Requested entity does not exist for this account |
| `ACCOUNT_NOT_FOUND` | Active account not resolvable |
| `FORBIDDEN` | Action not allowed for this user / role |
| `CONFLICT` | Uniqueness or constraint violation |

Tax-engine-specific:

| Code | Meaning |
|---|---|
| `TAX_DISABLED` | Tax engine off for this account |
| `MONTH_NOT_FINALIZED` | Operation requires the month to be closed |
| `LEDGER_NOT_FOUND` / `LEDGER_ROW_NOT_FOUND` | Tax ledger row missing |

Add a new code only when an existing one doesn't fit — keep the table small.

## 6. Action File Layout

```
src/app/actions/
├── auth.ts                  Auth (register/login/logout/session)
├── accounts.ts              Trading account CRUD + switch
├── trades.ts                Trade CRUD + bulk operations
├── executions.ts            Trade execution CRUD + scaled-mode conversion
├── analytics.ts             Read-only analytics queries
├── reports.ts               Weekly / monthly / yearly reports
├── annual-reports.ts        Capital events + annual rollups (BR)
├── tax-engine.ts            BR DARF + carryover + fee config
├── strategies.ts            Strategy library
├── strategy-conditions.ts   Strategy → conditions mapping
├── trading-conditions.ts    Reusable condition blocks
├── scenarios.ts             Strategy scenarios
├── tags.ts                  Setup / mistake tags
├── timeframes.ts            Timeframe catalog
├── assets.ts                Asset catalog
├── command-center.ts        Daily checklists + asset rules
├── live-trading-status.ts   Live session status
├── coaching.ts              AI coaching insights
├── filter-presets.ts        Saved filter presets
├── settings.ts              User / account settings (typed, not key-value)
├── user-management.ts       Admin user list
├── risk-profiles.ts         Risk profile CRUD
├── risk-simulation.ts       What-if replay
├── monte-carlo.ts           Monte Carlo simulation
├── equity-shield.ts         Drawdown protection engine
├── backtest.ts              Backtest engine
├── account-comparison.ts    Cross-account comparison
├── csv-import.ts            CSV trade import
├── nota-import.ts           BR brokerage nota import
├── ocr-import.ts            Screenshot OCR import
├── candle-import.ts         Price candle import
├── candle-query.ts          Price candle queries
├── indicators.ts            Indicator definitions
├── bug-reports.ts           In-app bug capture
├── email-verification.ts    Email verification flow
├── password-recovery.ts     Password reset flow
├── yearly-plan.ts           Yearly plan capital sync
└── fractal-plan/
    ├── yearly.ts            Yearly plan CRUD
    ├── quarterly.ts         Quarterly plan CRUD
    ├── monthly.ts           Monthly plan CRUD + capital
    ├── weekly.ts            Weekly plan CRUD
    ├── daily.ts             Daily plan CRUD
    ├── tier.ts              Tier change evaluation
    └── reports.ts           Plan-specific R-distribution
```

## 7. API Route Layout

```
src/app/api/
├── auth/
│   ├── [...nextauth]/        NextAuth.js routes
│   └── force-signout/        Forced sign-out
├── arch/                     Internal "Arch" API (used by RSC client components and tools)
│   ├── trades/               CRUD + executions + tags + grouped + notes
│   ├── analytics/            stats, daily-pnl, equity-curve, discipline, expected-value, performance, r-distribution, streaks
│   ├── reports/              monthly, weekly, monthly-results, pdf
│   ├── strategies/           list, create, update, [id]
│   ├── tags/                 list, create, update
│   ├── accounts/             list, switch, [id]
│   ├── command-center/       checklists, circuit-breaker, daily-summary, notes
│   ├── executions/           create, update, delete
│   ├── live-status/          Live status read/write
│   ├── reference/            Read-only catalog: assets, strategies, tags, timeframes
│   ├── monte-carlo/          MC API
│   ├── bugs/                 Bug reports CRUD
│   └── docs/                 Self-documenting endpoint manifest
├── imports/
│   └── detailed-trades/      CSV detailed-trade import + confirm
├── market/
│   ├── quotes/               Real-time quotes
│   └── calendar/             B3 + economic calendar
└── uploads/                  File uploads (S3 presigned)
```

## 8. Route Conventions

- Routes under `/api/arch/` are first-party — same auth model as server actions (require session, scope by active account).
- Public routes are explicit and few: `/api/auth/*`, `/api/market/*`.
- Routes return JSON in the same `ActionResponse`-compatible envelope when possible.
- Use HTTP method semantics correctly: `GET` for reads, `POST` for state changes. PATCH/PUT/DELETE are used where they read better than another POST.

## 9. Adding a New Action

1. Place the file under `src/app/actions/<domain>.ts` (or a sub-directory if the domain has many actions).
2. Add `"use server"` at the top.
3. Define a Zod schema in `src/lib/validations/`.
4. Resolve auth + account first.
5. Validate input.
6. Run the work.
7. Return `ActionResponse<T>`.
8. Revalidate affected paths (`revalidatePath`) or tags (`revalidateTag`).

If a UI consumer is a Client Component that can't call a server action directly, wrap the action in a thin route under `/api/arch/<domain>/`.

## 10. Adding an Error Code

Don't. Reuse one from §5 unless the new code is genuinely distinct and likely to be machine-checked by a caller (e.g. a UI that reacts to `MONTH_NOT_FINALIZED` differently from generic `FORBIDDEN`). Document new codes here on the same PR.

## 11. Things This Doc Deliberately Does NOT List

- Per-action signatures, parameter names, and return shapes.
- Per-route query params and body schemas.
- Inventory of every exported function.

Those drift on every feature commit. The action filenames in §6 are stable enough to map to features; the signatures are not. Read the source.
