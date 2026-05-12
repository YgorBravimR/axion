# Subject Sweep — Test coverage gap audit

**Date**: 2026-05-11
**Subject**: #14 from `docs/scan-roi-plan-2026-05-07.md` (Tier C)
**Scope**: `src/lib/**`, `src/__tests__/**`

## Why this subject

Tests aren't a polish concern in a tax / money / crypto codebase — a silent bug in `recompute-month.ts` or `crypto.ts` corrupts persisted financial state. The plan called out: identify hot critical paths that lack tests, then triage which deserve dedicated `test-architect` follow-up.

## Phase 0 — detectors run

```bash
# Test count baseline
find src/__tests__ -name '*.test.ts' | wc -l                            # 66 test files
find src/lib -name '*.ts' -not -name '*.test.ts' | wc -l                 # 174 lib files

# Untested lib files (mirror-tree convention: src/lib/foo.ts ↔ src/__tests__/lib/foo.test.ts)
for f in $(find src/lib -name '*.ts'); do
  test_path="src/__tests__/${f#src/}"
  test_path="${test_path%.ts}.test.ts"
  test -f "$test_path" || echo "$f"
done                                                                     # 147 untested
```

A naïve "sibling .test.ts" detector returns 174 false positives because this project parks tests in a mirror tree at `src/__tests__/lib/**`. The corrected detector walks the mirror path.

## Phase 1 — findings classified

| Cluster                                                  | Severity | Status                                                                                                                                                                                                                                                                                         | Action                             |
| -------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **A** Critical security / crypto paths without tests     | **high** | `src/lib/crypto.ts` (AES-256-GCM primitives, DEK envelope), `src/lib/user-crypto.ts` (encrypted-field decoration for monthly plans + journal), `src/lib/auth-utils.ts` (JWT + session). 0 test files for each. CLAUDE.md flags all three as protected paths — changes require security review. | **flagged** — `test-architect`     |
| **B** Money / tax / recompute paths without tests        | **high** | `src/lib/tax/asset-defaults.ts`, `tax/mark-dirty.ts`, `tax/month-status.ts`, `tax/index.ts` lack tests. `tax/darf-calculator.ts` + `tax/legal-rates.ts` + `tax/recompute-month.ts` DO have tests. Coverage is partial but the high-fanout files (recompute, darf, legal-rates) are covered.    | **flagged** — `test-architect`     |
| **C** Statistical / strategy paths without tests         | medium   | `src/lib/monte-carlo.ts`, `monte-carlo-v2.ts`, `risk-simulation-advanced.ts` — pure functions with high consequence (drives risk-sizing displays). 0 tests.                                                                                                                                    | **flagged** — `test-architect`     |
| **D** Parser / import paths without tests                | medium   | `src/lib/nota-parser/sinacor-parser.ts`, `nota-parser/matching-engine.ts`, `csv-parsers/*` — broker-output → trade-record translation. 0 tests; high fan-out into DB writes. Misshapen parse silently lands bad data.                                                                          | **flagged** — `test-architect`     |
| **E** Routing / formatting / utility paths without tests | low      | `dates.ts`, `formatting.ts`, `money.ts`, `non-empty.ts`, `calendar/*`, `calculations.ts` — used everywhere but mostly thin pass-throughs over `Intl.*` and arithmetic. Type-safety + lint catches the obvious bugs. Coverage gap is real but lower ROI than A/B/C/D.                           | skip — low ROI for sweep           |
| **F** Component tests / E2E                              | low      | E2E suite at `e2e/` covers golden paths (auth, journal, plan creation). Per-component unit tests are sparse but RTL/testing-library work is a different mode than `test-architect` (which targets pure-logic paths).                                                                           | skip — out of scope for this sweep |

## Phase 5a — what the existing test suite covers well

66 test files do exist and cluster on the highest-stakes logic:

- `__tests__/lib/tax/recompute-month.test.ts` + `darf-calculator.test.ts` + `legal-rates.test.ts` — tax recompute end-to-end + isolated rules
- `__tests__/lib/coaching/*` — coaching engine factory + scoring
- `__tests__/lib/backtest/*` — strategy engine (entry, stop, target, sizing modules)
- `__tests__/lib/equity-shield/*` — equity-curve smoothing + shield calc
- `__tests__/lib/fractal-plan/*` — fractal-plan capital + week aggregation

The gap is **not** "no testing culture" — it's that crypto / auth / parsing / monte-carlo / partial-tax files were added without matching test files. Three of those (crypto, auth, recompute) are protected paths, so a sweep agent shouldn't write tests for them unilaterally.

## Phase 5b — fixes applied (0 direct, 4 follow-ups flagged)

No tests written this sweep. Writing tests for protected paths (`crypto.ts`, `auth-utils.ts`) without user-driven coordination is exactly the kind of unilateral change CLAUDE.md prohibits. The high-leverage move is a dedicated `test-architect` skill pass, scheduled per cluster:

1. **Security cluster** (A): `crypto.ts`, `user-crypto.ts`, `auth-utils.ts` — must coordinate with user; security review required for the test fixtures + test design.
2. **Tax cluster** (B): fill in `asset-defaults`, `mark-dirty`, `month-status` — coverage extends the existing tax test pattern; lower coordination cost.
3. **Stats cluster** (C): `monte-carlo`, `monte-carlo-v2`, `risk-simulation-advanced` — pure functions, deterministic seeding; high coverage ROI per hour.
4. **Parser cluster** (D): `sinacor-parser`, `matching-engine`, `csv-parsers` — fixture-driven; needs sample broker outputs (have at `e2e/fixtures/notas/`).

Cluster #3 is the best candidate for an unsupervised `test-architect` pass — pure functions, deterministic, no protected paths, no fixture coordination.

## Phase 5c — prevention rules (memory seed)

### Convention

**Tests live in the mirror tree at `src/__tests__/<path>`, not in sibling files.** Detector accordingly. A sweep that looks for `foo.test.ts` next to `foo.ts` returns inflated false-positive counts.

**Adding a critical-path file ships with its test.** Critical = encrypts, signs, moves money, lands in DB, or drives risk-sizing UI. Definition of done for those PRs includes a `src/__tests__/<mirror>/<name>.test.ts`. This is a checklist convention; lint won't enforce it.

### Detector convention

```bash
# Mirror-tree untested-file detector (the corrected one)
for f in $(find src/lib -name '*.ts'); do
  test_path="src/__tests__/${f#src/}"
  test_path="${test_path%.ts}.test.ts"
  test -f "$test_path" || echo "$f"
done | rg 'crypto|auth-utils|tax/|monte-carlo|nota-parser'             # critical subset
```

## Phase 6 — done criteria

- [x] `pnpm lint` 0 errors
- [x] Test layout convention documented (mirror tree, not siblings)
- [x] 147 untested lib files catalogued; triaged into 4 clusters by ROI/risk
- [x] Critical security cluster (A) flagged for coordinated `test-architect` pass
- [x] Tax / monte-carlo / parser clusters (B/C/D) flagged for follow-up
- [x] Convention seeded: critical-path PRs must ship with mirror-tree test
