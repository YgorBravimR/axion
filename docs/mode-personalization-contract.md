# Mode-Personalization Widget Contract

**Status:** Spike (v0) — landed 2026-05-15 on `feat/hawks-mode-v0`. Promote to stable after second mode validates the shape.

## Why this exists

Axion supports per-account "modes" — methodology variants like **Hawks** (and future ones) that don't fork the UI tree but **modulate individual widgets**. The user framing: _"a lens on top of general surface, not a distinct frame."_

Before this contract, mode awareness was wired prop-by-prop (`hawksModeActive`, `dailyOrdinal`, `dailyBias`, …) from the dashboard page through `DashboardContent` to consumer widgets. That pattern doesn't scale to a second mode — every new mode adds a parallel prop chain.

## How it works

Three pieces:

1. **Server resolution** — `getActiveAccountModeForUser()` in `src/lib/hawks/account-context.ts` returns the active mode (`"default" | "hawks"`) for the current request, request-cached via `react/cache`.

2. **Client provider** — `<AccountModeProvider mode={...}>` in `src/components/providers/account-mode-provider.tsx`. Mounted once near the (app) layout root; reads the server-resolved mode and exposes it via context. Client never fetches.

3. **Consumer surfaces** — two ways for any widget to opt in:

   ```tsx
   // a) Hook — for boolean checks or conditional logic
   import { useAccountMode } from "@/components/providers/account-mode-provider"
   const { mode, isHawks, isDefault } = useAccountMode()

   // b) Declarative variant — for swapping rendered output
   import { ModeVariant } from "@/components/shared"
   ;<ModeVariant
   	default={<CoachingInsightsCard />}
   	hawks={<HawksCoachingInsightsCard />}
   />
   ```

## Design rules

- **Modes are orthogonal to roles.** Role gates (`useFeatureAccess`, `FEATURE_MAP`) compose with mode — keep them stacked, never collapsed. Example: `canAccess("dashboard:coaching-insights") && <ModeVariant … />`.
- **Mode is a replacement, not an addition.** When a mode supplies a variant, it _replaces_ the default widget for that user. Two widgets stacking (a "default" + a "hawks" alongside) is a smell — collapse into one `ModeVariant`.
- **Default branches are optional.** Omit `default` to render nothing when the mode has no variant. Useful for mode-only surfaces (e.g. `<ModeVariant hawks={<HawksDailyBias />} />` shows only when Hawks is on).
- **Widget-level opt-in.** No global mode-switching wrappers, no `<HawksLayout>` forks. Each widget decides whether to be mode-aware, locally.
- **Future-mode extension.** Adding a third mode means: (a) extend `accountModeEnum` in the DB, (b) extend `AccountModeValue` union, (c) add the variant key to `ModeVariantProps`. No prop-chain plumbing.

## First consumer

`src/components/dashboard/dashboard-content.tsx` — the Coaching Insights slot, which previously rendered both `<CoachingInsightsCard />` and `<HawksCoachingInsightsCard />` stacked in Hawks mode, now renders one via `<ModeVariant />`.

**Behavior change:** In Hawks mode, the default coaching card no longer appears alongside the Hawks variant — the Hawks variant replaces it. This is intentional per the "lens, not addition" rule.

## What's deferred to v1

- **Per-mode metadata on context.** Today the provider exposes only `{ mode, isHawks, isDefault }`. If multiple widgets need shared mode-derived data (e.g. daily ordinal, daily bias), promote those to the context value rather than threading through props.
- **Mode-access matrix.** Parallel to `FEATURE_MAP` — a `MODE_FEATURES` map that declares which widgets are mode-specific. Useful once we have 3+ modes and want to audit coverage.
- **Mode-aware translation namespaces.** e.g. `t("dashboard.kpi.pnl")` could resolve to a Hawks-specific copy variant. Not needed yet.

## When to promote / replace

Promote this from spike to stable when a **second** mode (Falcons? Stags?) lands and the contract holds without modification beyond extending the enum. If a second mode forces structural changes to the contract, replace it — don't paper over.
