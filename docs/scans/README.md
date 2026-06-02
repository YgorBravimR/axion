# Scans — Audit Reports Archive

Each file in this folder is a dated audit report against a specific concern
(a11y, perf, schema, tokens, type safety, i18n coverage, etc.) or a specific
surface (per-page impeccable sweep). Reports are write-once: they capture the
state of the codebase at the scan date and the action items that fell out of
that snapshot.

The scan-driven action items are NOT tracked here — they get filed into
[`../backlog.md`](../backlog.md) and resolved per the normal commit flow. If
you want to know "did we fix X", grep the backlog and the post-mortem folder,
not these files.

---

## Tier-A baseline sweep — 2026-05-11

Initial codebase-wide audit across 13 axes. Most action items have been
resolved; these are the reference snapshots.

| File                                                                       | What was audited                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`2026-05-11-a11y.md`](./2026-05-11-a11y.md)                               | Accessibility — keyboard, ARIA, focus, contrast           |
| [`2026-05-11-bundle.md`](./2026-05-11-bundle.md)                           | Bundle size + tree-shaking + dynamic-import opportunities |
| [`2026-05-11-i18n-coverage.md`](./2026-05-11-i18n-coverage.md)             | Translation coverage gaps (en / pt-BR parity)             |
| [`2026-05-11-loading-error-empty.md`](./2026-05-11-loading-error-empty.md) | Loading / error / empty state coverage per surface        |
| [`2026-05-11-performance.md`](./2026-05-11-performance.md)                 | Runtime perf: re-renders, bundle load, network waterfall  |
| [`2026-05-11-responsiveness.md`](./2026-05-11-responsiveness.md)           | Mobile / tablet layout drift                              |
| [`2026-05-11-schema.md`](./2026-05-11-schema.md)                           | Drizzle schema hygiene + indexes                          |
| [`2026-05-11-security.md`](./2026-05-11-security.md)                       | Authz boundaries, server-action gates, OWASP top-10       |
| [`2026-05-11-server-actions.md`](./2026-05-11-server-actions.md)           | Server action conventions, error shape, perf              |
| [`2026-05-11-test-coverage.md`](./2026-05-11-test-coverage.md)             | Unit + integration + e2e gap map                          |
| [`2026-05-11-theming-tokens.md`](./2026-05-11-theming-tokens.md)           | Design-token compliance (no arbitrary classes)            |
| [`2026-05-11-type-safety.md`](./2026-05-11-type-safety.md)                 | TS no-unsafe-\* phase-in + boundary refinement            |
| [`2026-05-11-tier-b.md`](./2026-05-11-tier-b.md)                           | Lower-priority follow-ups bucket                          |

## Per-page "impeccable" sweep — 2026-05-12 / 2026-05-13

Horizontal review applied page-by-page using the
[`../impeccable-page-runbook.md`](../impeccable-page-runbook.md) blueprint.
Sweep marked **complete (35 / 35)** in the runbook header.

| Page / surface                                                                                 | Wave  |
| ---------------------------------------------------------------------------------------------- | ----- |
| [`2026-05-12-impeccable-dashboard.md`](./2026-05-12-impeccable-dashboard.md)                   | 1     |
| [`2026-05-12-impeccable-journal-list.md`](./2026-05-12-impeccable-journal-list.md)             | 1     |
| [`2026-05-12-impeccable-journal-detail.md`](./2026-05-12-impeccable-journal-detail.md)         | 1     |
| [`2026-05-12-impeccable-backtest.md`](./2026-05-12-impeccable-backtest.md)                     | 2     |
| [`2026-05-12-impeccable-backtest-optimize.md`](./2026-05-12-impeccable-backtest-optimize.md)   | 2     |
| [`2026-05-12-impeccable-monte-carlo.md`](./2026-05-12-impeccable-monte-carlo.md)               | 2     |
| [`2026-05-12-impeccable-risk-simulation.md`](./2026-05-12-impeccable-risk-simulation.md)       | 2     |
| [`2026-05-12-impeccable-equity-shield.md`](./2026-05-12-impeccable-equity-shield.md)           | 3     |
| [`2026-05-12-impeccable-command-center.md`](./2026-05-12-impeccable-command-center.md)         | 3     |
| [`2026-05-12-impeccable-analytics.md`](./2026-05-12-impeccable-analytics.md)                   | 3     |
| [`2026-05-12-impeccable-account-comparison.md`](./2026-05-12-impeccable-account-comparison.md) | 3     |
| [`2026-05-12-impeccable-reports.md`](./2026-05-12-impeccable-reports.md)                       | 3     |
| [`2026-05-12-impeccable-monthly.md`](./2026-05-12-impeccable-monthly.md)                       | 3     |
| [`2026-05-12-impeccable-playbook-list.md`](./2026-05-12-impeccable-playbook-list.md)           | 3     |
| [`2026-05-12-impeccable-playbook-detail.md`](./2026-05-12-impeccable-playbook-detail.md)       | 3     |
| [`2026-05-12-impeccable-plan-wave4.md`](./2026-05-12-impeccable-plan-wave4.md)                 | 4     |
| [`2026-05-12-impeccable-form-editors-wave5.md`](./2026-05-12-impeccable-form-editors-wave5.md) | 5     |
| [`2026-05-12-impeccable-settings-wave6.md`](./2026-05-12-impeccable-settings-wave6.md)         | 6     |
| [`2026-05-12-impeccable-auth-wave7.md`](./2026-05-12-impeccable-auth-wave7.md)                 | 7     |
| [`2026-05-12-impeccable-public-wave8.md`](./2026-05-12-impeccable-public-wave8.md)             | 8     |
| [`2026-05-13-impeccable-dashboard-hawks.md`](./2026-05-13-impeccable-dashboard-hawks.md)       | Hawks |
| [`2026-05-13-impeccable-journal-list-hawks.md`](./2026-05-13-impeccable-journal-list-hawks.md) | Hawks |
| [`2026-05-13-impeccable-settings-hawks.md`](./2026-05-13-impeccable-settings-hawks.md)         | Hawks |
| [`2026-05-13-impeccable-trade-form-hawks.md`](./2026-05-13-impeccable-trade-form-hawks.md)     | Hawks |

## Standalone / specialty audits

Topical sweeps outside the Tier-A / impeccable cadence.

| File                                                                                             | What was audited                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| [`2026-05-05-tax-yearly-reports.md`](./2026-05-05-tax-yearly-reports.md)                         | Yearly tax report engine + data pipeline                 |
| [`2026-05-07-cockpit-tokens.md`](./2026-05-07-cockpit-tokens.md)                                 | Cockpit-specific token-system sweep (pre-Tier-A)         |
| [`2026-05-15-e2e-edge-case-audit.md`](./2026-05-15-e2e-edge-case-audit.md)                       | E2E test gap map for edge-case branches                  |
| [`2026-05-28-i18n-pass-2.md`](./2026-05-28-i18n-pass-2.md)                                       | i18n pass-2 (covering surfaces shipped after 2026-05-11) |
| [`2026-05-28-missing-translations.md`](./2026-05-28-missing-translations.md)                     | Specific missing-key inventory + remediation list        |
| [`2026-05-29-layout-drift-from-core.md`](./2026-05-29-layout-drift-from-core.md)                 | Layout drift from core design-system spacing rules       |
| [`2026-06-02-color-tokens-drift.md`](./2026-06-02-color-tokens-drift.md)                         | Color-token drift after 2026-05-07 cockpit sweep         |
| [`2026-06-02-i18n-deep-sweep.md`](./2026-06-02-i18n-deep-sweep.md)                               | i18n pass-3 (deep — all surfaces + dynamic strings)      |
| [`2026-06-02-i18n-action-errors.md`](./2026-06-02-i18n-action-errors.md)                         | Server-action error-message translation coverage         |
| [`2026-06-02-reports-plans-simulations-perf.md`](./2026-06-02-reports-plans-simulations-perf.md) | Perf sweep on reports / plans / simulations surfaces     |

## Skipped

| File                                                   | Why                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [`skipped/PERF_SKIPPED.md`](./skipped/PERF_SKIPPED.md) | Perf audit slice that was deferred — keep the WHY around as memo |
