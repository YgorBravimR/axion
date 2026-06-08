# Code Conventions

Agent-facing code standards. Mandatory rules live in `CLAUDE.md`; this file holds the bulk of conventions agents must follow when writing code.

When you discover a _new_ convention or a non-obvious quirk that isn't already documented here, add it to **[`docs/gotchas.md`](gotchas.md)** — don't bury it in inline comments.

---

## Persona

You are a Senior Full-stack Developer expert in React, Next.js, TypeScript, TailwindCSS, shadcn/Radix on the frontend and Drizzle + PostgreSQL on the backend. You give nuanced answers and reason carefully.

- Follow user requirements to the letter.
- Think step-by-step before coding for non-trivial tasks.
- Confirm understanding, then write code.
- Write correct, DRY, fully functional, working code aligned to the rules below.
- Prefer readability over micro-performance.
- Leave NO TODOs, placeholders, or missing pieces.
- Include all required imports; name components meaningfully.
- If there's no correct answer, say so. If you don't know, say so — don't guess.

---

## Library management

Before adding a new library, verify:

- Nothing similar already exists (e.g. don't add Axios if `fetch` works).
- The library was updated in the last 6 months (avoid abandoned packages).
- Small footprint, minimal dependency chain.
- Has TypeScript types.
- Does **not** depend on jQuery.

## TypeScript

### Imports

- Never `import * as React from "react"` or `React.*` namespace access.
- Always destructure: `import { useState, forwardRef } from "react"`.
- Types: `import type { ComponentProps, HTMLAttributes, ElementRef } from "react"`.
- Use `import type { … }` for type-only imports (lint enforces).

### Syntax & structure

- Be consistent — tabs or spaces, never both.
- Type everything: function inputs, outputs, props. Only rely on inference when obvious.
- Avoid `any` except for explicit work-in-progress or weakly-typed third-party libs.
- Use `interface` for object shapes; `type` for unions / aliases.
- Export at the end of the file; **avoid default exports** at all costs (lint enforces `no-default-export`).

### Functions

- Always arrow syntax: `const handleClick = () => { … }`.
- For >2 parameters, use a typed options object.
- Array methods:
  - `.map()` for transforming.
  - `.reduce()` for aggregating.
  - `for...of` for general iteration / side effects.
  - **`.forEach()` is banned** (lint).
- Never use `try/catch` as conditional logic.

### Paradigms

- Prefer functional programming.
- Use classes only when you need to encapsulate state or grouping is genuinely logical. Don't use classes as namespaces for static methods.

---

## React / Frontend

### Component standards

- Every piece of data should arrive as ready-to-use JSON from a server component or API.
- Avoid data juggling on the client.
- Keep client components minimal (pure components).
- Use wrappers for dynamic providers (PayPal, PostHog, etc.).
- Avoid deep nesting of components/folders — a slightly larger file beats 5 levels of indirection.
- Pass props as a single object when sensible.
- Don't pass props more than 2 levels down — lift to context.

### Code Implementation Guidelines

- **Early returns** whenever possible — improves readability.
- **Tailwind only** for styling. No raw CSS, no `<style>` tags.
- **Descriptive names**. Event handlers always prefixed `handle`: `handleClick`, `handleKeyDown`, `handleSubmit`.
- **`const` over `function`**: `const toggle = () => { … }`.
- **Accessibility**: interactive elements need `tabIndex`, `aria-label`, `onClick`, `onKeyDown`. Icon-only buttons must have `aria-label`.
- See **[`docs/gotchas.md`](gotchas.md)** for `<a>` / `<table>` / `<input type="checkbox">` rules.

---

## Comments & documentation

### When to comment

- Default: write **no comments**. Self-explanatory code is the goal.
- When you must: explain **why**, not **what**.
  - Bad: `// Increments counter by 1`
  - Good: `// Prevents race condition by ensuring atomic increment`
- Document complex/non-obvious logic.

### TSDoc for public APIs

```ts
/**
 * Calculates the sum of two numbers.
 *
 * @param a - The first number
 * @param b - The second number
 * @returns The sum of a and b
 */
const add = (a: number, b: number): number => a + b
```

### AI-assisted code

- For meaningful AI-generated blocks, document the prompt that produced them.
- When code incorporates advice from an external source, add `// @see <url>`.

---

## API conventions

### Response shape

Use a consistent envelope for both success and error responses:

```ts
{
  status: "success" | "error",
  message: string,                // human-readable
  data?: object | {
    items: unknown[],
    pagination: {
      total: number,
      limit: number,
      currentPage: number,
      totalPages: number,
      cursor?: string,
    }
  },
  errors?: Array<{
    code: string,                 // machine-readable, e.g. "USER_NOT_FOUND"
    detail: string,               // human-readable detail
  }>,
}
```

- Avoid returning a single scalar as the full response unless absolutely necessary.
- Server actions in `src/app/actions/` follow this envelope.

---

## Security baseline

- **Validate + sanitize** all user input on both client and server.
- **Parameterized queries** only (Drizzle handles this — don't write raw SQL with string concatenation).
- **Environment variables** for all secrets. Never hardcode keys, tokens, or credentials.
- **HTTPS** for all external communication.
- **Rate limiting** on public API endpoints.
- **Dependency hygiene**: keep deps current to avoid known CVEs.
- **Least privilege** for any system access.
- **CSP headers** + secure / HTTP-only cookies for sessions.
- Crypto primitives live in `src/lib/crypto.ts` and `src/lib/user-crypto.ts` — modifications require security review.
- Auth flow lives in `src/lib/auth-utils.ts` — modifications require security review.

---

## Custom ESLint rules (reference)

The project ships an inline ESLint plugin at `eslint-rules/`, registered as `axion/*`. Tests under `eslint-rules/tests/`, run via `pnpm test:lint-rules`. All five rules are `error`:

| Rule                                     | Catches                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `axion/enforce-server-action-async-only` | Sync exports / type re-exports in `"use server"` files                                |
| `axion/enforce-token-usage`              | Invalid Tailwind v4 tokens (`s-400`, `text-h4`, etc.)                                 |
| `axion/no-hover-only-controls`           | `opacity-0 group-hover:opacity-*` without focus/aria escape                           |
| `axion/enforce-ui-primitives`            | Raw `<table>`, internal `<a>`, `<input type="checkbox">` outside `src/components/ui/` |
| `axion/no-dynamic-functions-in-pages`    | `cookies()`/`headers()`/`draftMode()`/`unstable_after` in page/layout/template files  |

The behavior + workaround for each is documented in **[`docs/gotchas.md`](gotchas.md)**.

---

## Repository hygiene

- `.gitignore` excludes env files, build artifacts, OS junk.
- **Never commit** `.env` or any credentials. Commit `.env.example` instead.
- Code must run identically across environments — use env vars for environment-specific behavior.

---

## Financial math conventions

These are the canonical conventions agreed during the 2026-06-08 calculations audit (`docs/scans/calculations-audit/MASTER.md`). New code that touches financial math must follow them.

### Win rate denominator excludes breakeven trades

A trade with `pnlCents === 0` (or exit reason `breakeven_stop`) is **neither a win nor a loss** for win-rate purposes. The canonical denominator is `wins + losses` (decisive trades), not `total trades`. `src/lib/calculations.ts` defines `calculateWinRate(wins, total)` where every live caller passes `wins + losses` as `total`. The signature is historical; treat it as a "decisive-trades-only" calculator.

### Standard deviation uses sample variance (Bessel's correction)

Every std-dev computation in math layer uses `sum_sq_diff / (n − 1)` (sample variance, the industry default per Sharpe 1994), not `/ n` (population variance). Use `sampleStdDev()` from `src/lib/finance/annualize.ts` for new code.

### Sharpe / Sortino are annualized by default at the point of emission

Every result-object field named `sharpeRatio` or `sortinoRatio` holds the **canonical annualized** value, computed as `(daily_mean / daily_std) × √252`. Per-trade R-Sharpe (the pre-2026-06-08 default) is now emitted as `rSharpe` — a diagnostic field, not user-facing as "Sharpe". `TRADING_DAYS_PER_YEAR = 252` (Brazil B3 + US NYSE/NASDAQ convention). Use the helpers in `src/lib/finance/annualize.ts`.

### R-multiple risk denominator is immutable from entry

`R = realizedPnL / initialRisk`. **`initialRisk` is set at trade entry from `|entry − stopLoss| × positionSize`** and does NOT change with breakeven activation, trailing-stop moves, or partial exits. The DB has both `stopLoss` (initial, immutable for R calculations) and `stopLossAtClose` (final, for execution-quality reporting). Mixing them inflates R after BE activation and is a known footgun.

### Equity curve construction is arithmetic cumulative P&L

Every site that builds an equity curve uses `equity[t] = initial + cumsum(PnL[1..t])` — arithmetic, additive. Compounding curves (geometric `prod(1 + r)`) are NOT used anywhere yet; if/when introduced, name the field `compoundEquity` to disambiguate. Drawdown computed against running HWM = `max(equity[..t])`.

### Pareto 3D retention is heuristic, not Kung non-dominated sort

`src/lib/optimize/pareto-retain.ts` uses a PF-first sweep + secondary-max tracking instead of a strict Kung et al. (1975) 3D non-dominated sort. Defensible at the sweep sizes we run (<10k results) and an explicit choice — not a bug. If sweep sizes grow >50k, revisit.

### Account-equity field naming when no initial balance is set

`src/lib/analytics-helpers.ts:computeEquityCurve()` defaults `accountEquity = cumulativePnL` when no initial balance is passed. Semantically identical to `cumulativePnL` in that case — the dual-naming is for downstream UI consumers that expect an `accountEquity` field regardless of whether a balance was supplied. Not a bug, but be aware: `accountEquity` does not always mean "absolute account value" — only when an initial balance is supplied.

### Tier clamping convention

When capital exceeds the top ladder tier in `src/lib/fractal-plan/capital-ladder.ts`, the resolver returns the **top tier** rather than throwing or returning null. This is an explicit design choice (not a bug): users with capital above the top tier are still on a valid progression, the top tier's risk/sizing parameters remain the safest available bounds. Code reading the resolver's output must not interpret "top tier returned" as "user has exactly top-tier capital" — check the actual `currentCapitalCents` separately if needed.
