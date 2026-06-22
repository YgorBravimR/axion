# Playbook

> Library of versioned strategies. The bottom-up complement to Plan's top-down cascade.

**Routes:** `/[locale]/playbook`, `/playbook/new`, `/playbook/[id]`, `/playbook/[id]/edit`
**Server actions:** `strategies.ts` (32 KB), `strategy-conditions.ts`, `strategy-version-diff.ts`, `strategy-compliance-trend.ts`, `trading-conditions.ts`, `hawks-coaching.ts`

## Purpose

Reusable strategy templates with point-in-time version snapshots, condition scorecards, and (Hawks) discipline scores. Strategies live here; trades reference them; stats accumulate per version.

## What lives there

- **Playbook home** — compliance dashboard (premium) + grid of strategy cards (code, name, PnL, win rate, profit factor, trade count, compliance %).
- **New strategy** — code (3–10 uppercase), name, description, entry/exit/risk criteria (freetext), final R, max risk %, screenshot URL, notes; conditions (premium); scenarios (premium, image upload after save).
- **Strategy detail** — performance stats, risk settings, criteria, conditions grid + scorecard (premium), Hawks discipline panel (Hawks-only), scenarios, reference chart.
- **Edit strategy** — pre-filled form; fork or edit live version.
- **Versions** — auto-created when trades are logged against a strategy. Side-by-side diff dialog.

## Inputs

- Strategy CRUD (code, name, description, criteria text, R targets, screenshot, notes).
- Conditions (premium): multi-tier selection from global condition library, sort order.
- Scenarios (premium): chart image uploads.

## Outputs

- **Immutable version snapshots** with trade count, PnL, win rate, profit factor, avg R, compliance %.
- **Compliance trend** (premium): sparkline across days/trades in a version.
- **Hawks discipline score** (Hawks-only): unweighted mean of VWAP %, ajuste %, triple-screen %, bias %.
- **Conditions scorecard** (premium): per-tier compliance + median win/loss when met/violated.

## Cross-feature integrations

- **Command Center** — daily checklist references active strategies.
- **Plan** — strategy conditions feed risk-profile gating; monthly resolver decides which strategies are allowed.
- **Journal** — every trade is tagged with a strategy code; trades feed version stats.
- **Conditions engine** — evaluates conditions at entry/exit, marks each trade compliant or not.
- **Backtest** — strategies feed presets / configurations.

## Where it fails

- **No explicit "fork" UX.** To fork, you edit and change name/code; the diff dialog is read-only. There's no "snapshot this version, then start editing".
- **Conditions are opaque.** Scorecard shows aggregate per tier but no drill-down to which condition within a tier was broken on a specific trade.
- **Premium paywall surprises.** Conditions, scenarios, compliance trend all gated; "premium" badges shown with no explainer of what's behind the gate.
- **Screenshots aren't versioned.** Updating the screenshot URL silently overwrites; old versions of the strategy point to the new image.
- **No A/B comparison in the grid.** Two strategy versions running in parallel can only be diffed via the detail page; the grid shows only the latest stats.
- **Hawks discipline gate.** Score only renders if `methodology === "hawks"`. Other strategies show "—" with no hint why.
- **Code uniqueness across users is unclear.** A user can create `RSI-MR` even if another user has the same code, but the system stores them per-user — easy to confuse in support contexts.

## Power combos

1. **Conditions + Plan compliance.** Define Tier 1/2/3 conditions per strategy. Plan resolver gates which strategies are allowed under today's risk profile. Conditions scorecard tells you which condition you keep missing. Iterate conditions until both compliance % and PnL climb.
2. **Hawks + Journal + Playbook.** Log Hawks trades with all four screens marked. Strategy detail shows discipline % per version. If 92% of entries respected VWAP but only 60% respected ajuste, you know which gate to tighten in the criteria text.
3. **Version A vs version B parallel.** Fork strategy at month start with one knob changed (R-target 2.0 → 3.0). Trade both for the month. Use Plan monthly comparison + Playbook detail to pick the winner. Archive the loser.
4. **Risk profile + Playbook + CC checklist.** Risk profile decides today's R cap. Playbook conditions decide which strategies qualify. CC checklist item: "verified strategy X conditions met before entry". Three-layer guard — anything missing is a no-trade day.
