# Axion — Component Architecture

> **Single source of truth: `src/components/**`and`src/app/[locale]/**`.**
> This doc describes the _patterns_ — directory layout, server-vs-client rules, naming, data flow — not the inventory of every component.
> For the live tree, run `ls src/components` or open the route under `src/app/[locale]/(app)/`.

## 1. Layout Layer

```
src/components/
├── layout/             # App shell, sidebar, command menu, account switcher, user menu, breadcrumb
├── providers/          # App-wide React context providers (theme, brand, MC calibration, PostHog, effective-date)
└── ui/                 # Shadcn/Radix-based design primitives + a few Axion-specific extensions
```

- `layout/` owns the `AppShell`, `Sidebar`, `CommandMenu` (⌘K), `AccountSwitcher`, `UserMenu`, `PageBreadcrumb`. The shell is rendered once at the route layout level.
- `providers/` owns context providers mounted in the root layout. Add a new provider here, never inline.
- `ui/` follows the Shadcn convention: low-level primitives that don't know about Axion's domain. Add a new primitive only when it's reusable across ≥2 features.

## 2. Feature Directories

Each top-level feature has its own directory under `src/components/`:

| Directory             | Feature                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `command-center/`     | Daily cockpit (checklists, mood/bias, live status, notes)                                       |
| `journal/`            | Trade logging, executions, imports (CSV / nota / OCR), trade detail                             |
| `dashboard/`          | Performance overview (KPIs, calendar, equity curve, coaching)                                   |
| `analytics/`          | Variable comparison, time analysis, R-distribution, filter panel                                |
| `account-comparison/` | Cross-account performance                                                                       |
| `playbook/`           | Strategy library + condition system                                                             |
| `reports/`            | Weekly / monthly / annual reports + R-distribution + capital events                             |
| `tax/`                | BR DARF cards, carryover ledger, fee config                                                     |
| `monthly/`            | Monthly review                                                                                  |
| `fractal-plan/`       | Year → quarter → month plan editors + `cockpit/` slot views                                     |
| `monte-carlo/`        | Monte Carlo simulation v1 + `v2/`                                                               |
| `equity-shield/`      | Drawdown protection simulator                                                                   |
| `risk-simulation/`    | What-if trade replay                                                                            |
| `backtest/`           | Backtest engine UI + `sections/` for pluggable param panels                                     |
| `optimize/`           | Backtest optimizer (parameter sweep + heatmap)                                                  |
| `market/`             | Quotes panel, B3 / economic calendars                                                           |
| `auth/`               | Login, register, verify email, forgot password                                                  |
| `settings/`           | All settings panels (typed, not key-value)                                                      |
| `imports/`            | Detailed trade importer                                                                         |
| `bug-report/`         | In-app bug capture overlay                                                                      |
| `calculator/`         | Position size calculator (modal)                                                                |
| `shared/`             | Cross-feature primitives (`empty-state`, `colored-value`, `direction-badge`, `stat-card`, etc.) |

## 3. Server vs Client Components

**Default: Server Component.** Add `"use client"` only when one of these is true:

- Local React state (`useState`, `useReducer`) other than purely transitional UI hidden behind a wrapper
- Browser-only APIs (`window`, `document`, IntersectionObserver, etc.)
- Event handlers that need to live close to the element (`onClick`, `onSubmit`, …)
- Third-party libraries that require the browser runtime (Recharts, react-pdf renderer, Tesseract, cmdk, …)

If you need a server-rendered shell with a small interactive island, split: the parent stays server, the island becomes a small `"use client"` child.

### `"use server"` files

A `"use server"` file may export ONLY async functions. Type-only exports (`export type`, `export interface`) cause Next.js 16's RSC bundler to rewrite types as runtime references and break the build. Put types in a sibling `*.types.ts` file or in `src/types/`.

## 4. Data Flow

The standard flow is:

1. **Page (server component)** under `src/app/[locale]/(app)/<feature>/page.tsx` resolves auth + active account, calls server actions to fetch data, and passes data as props to the feature root component.
2. **Feature root (server or client)** orchestrates layout and passes typed props to children.
3. **Children** render. Client children call server actions or `/api/arch/*` routes for follow-up reads / mutations.

Anti-patterns to avoid:

- Direct DB access (`db.select(...)`) inside a component file. Always go through a server action — even a server component should call an action, not Drizzle directly. Exception: a few cockpit components (e.g. `fractal-plan/cockpit/month-report.tsx`) currently violate this; treat as legacy debt, not a pattern to copy.
- Fetching on the client when a server component could pre-load. Move it up.
- Prop drilling through more than two levels. Use a feature-local context provider, or pass an entire data object instead of individual fields.

## 5. Naming

- **Files**: kebab-case (`monthly-report-card.tsx`).
- **Components**: PascalCase, exported as named exports — never default exports.
- **Hooks**: `use-` prefix in filenames, `useCamelCase` in code (`use-formatting.ts` → `useFormatting`).
- **Event handlers**: `handle-` prefix (`handleClick`, `handleSubmit`).
- **Const declarations**: prefer `const Foo = (...) => ...` over `function Foo(...)`.

If a component has both a server wrapper and a client island, name them clearly: `monthly-darf-card.tsx` (server) + `monthly-darf-card-actions.tsx` (client).

## 6. Styling

- Tailwind v4 only. No CSS modules, no inline styles for layout.
- Use the design-token utilities from `src/app/globals.css` — see `docs/theming.md` for the token system.
- Never use raw values: `bg-[#0c0e0f]`, `p-[12px]`, etc. are banned.
- Class composition: `cn()` from `src/lib/utils.ts` (typed `clsx` + `tailwind-merge`).
- Variant systems: `cva` from `class-variance-authority` for primitives that have variants (button, badge, alert).

## 7. Accessibility

- Interactive elements must have `tabIndex`, `aria-label`, and a keyboard handler in addition to a click handler.
- Use semantic HTML first (`<button>` not `<div role="button">`).
- All animations honour the global `prefers-reduced-motion` guard — don't add per-component overrides.
- Forms use the Shadcn `Form` primitive (which wires up react-hook-form + Zod) — accessibility is handled.

## 8. Internationalization

- All user-facing strings come from `src/messages/{en,pt-BR}.json`.
- Read them with `useTranslations` (client) or `getTranslations` (server) from `next-intl`.
- Never hardcode strings in JSX. New strings: add to BOTH locale files in the same PR.

## 9. The `cockpit/` Pattern

`fractal-plan/cockpit/` is the largest active feature surface. It uses a slot-based pattern:

- The route page resolves the year/quarter/month and calls action(s) to load the resolved plan.
- Cockpit components are composed: `AnnualCockpitGrid`, `MonthCard`, `WeekRow`, `DarfStrip`, `EoyProjectionBanner`, `WhatIfCalculator`, …
- Each "strip" or "card" is a thin presentation component over a typed prop bundle from the resolver.
- Interactivity (override popovers, slideovers, mark-paid) lives in `"use client"` islands inside the otherwise server-rendered grid.

When adding a new cockpit slot, follow this pattern: type the prop bundle, render server-side, pop a small client island only where the user interacts.

## 10. Mode-Personalization Widget Contract

The app has two **independent** axes that often get conflated. Pick the right one or future agents will fight you.

### Axis A — Account mode (the user's active methodology)

"What methodology is this account currently practising?" Resolved server-side once at `(app)/layout.tsx` via `getActiveAccountModeForUser()` and broadcast through `<AccountModeProvider />`. Client code reads it with `useAccountMode()`.

For UI swaps driven by this axis, use `<ModeVariant />` from `src/components/shared/mode-variant.tsx`:

```tsx
<ModeVariant
  default={<CoachingInsightsCard />}
  variants={{ hawks: <HawksCoachingInsightsCard ... /> }}
/>
```

- `default` is **required** — it's the fallback for `default` mode and for any methodology that has no variant entry.
- `variants` is a `Partial<Record<MethodologyVariantKey, ReactNode>>` where `MethodologyVariantKey = Exclude<AccountModeValue, "default">`. Adding a new methodology (e.g. ORB) is **two edits**: extend `AccountModeValue` in the provider and the `accountModeEnum` in `db/schema.ts`. Every existing `<ModeVariant />` call site keeps compiling — the new key is simply optional.

### Axis B — Strategy methodology (a property of the data, not the user)

"This particular recipe/run/strategy was authored as Hawks-style — render its specialised panel." This is intrinsic to the row, not to the active account mode. A user on `default` account mode can still be viewing a Hawks-style recipe.

For this axis, gate inline on the data field. Example from `backtest-content.tsx`:

```tsx
{recipe.entry.type === "hawks_triple_screen" && (
  <BacktestHawksResultsPanel ... />
)}
```

Do **not** force this through `<ModeVariant />` — the active account mode is irrelevant here.

### Quick decision rule

- Reading `useAccountMode()` (directly or via `<ModeVariant />`)? → Axis A.
- Inspecting a row's `type`, `methodology`, or recipe shape? → Axis B.
- Both happen to land in the same screen? Fine — they're orthogonal; compose them.

## 11. Things This Doc Deliberately Does NOT List

- Every component file.
- Component prop types or interfaces.
- Per-feature internal hierarchy.

Those drift on every feature commit. The directory map in §2 is stable. The patterns in §3–§9 outlive individual components. For the current shape of any feature, open the directory.
