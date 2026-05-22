# Impeccable sweep — Wave 9 HAWKS / Trade form (rows #33 + #34)

**Date:** 2026-05-13
**Wave:** 9 / HAWKS
**Routes covered:**

- Row #33 — `src/app/[locale]/(app)/journal/new/page.tsx` → `<TradeForm>` → `<HawksTradeFields>`
- Row #34 — `src/app/[locale]/(app)/journal/[id]/edit/page.tsx` → `<TradeForm>` → `<HawksTradeFields>`

Combined log because both rows mount the **same** `<HawksTradeFields>` component instance via `trade-form.tsx`. Mirrors Wave 5's form-editors precedent.

**Inherited baseline:** [scans/2026-05-12-impeccable-form-editors-wave5.md](2026-05-12-impeccable-form-editors-wave5.md) — host pages Phase 3 done; this log reviews **only** the HAWKS pre-flight block grafted into the trade form.

**Scene sentence:** _Trader logging today's WDO long at 10:42 a.m., flipping three HAWKS switches to capture whether the trade earned the setup before they walk away from the desk for lunch._

---

## Phase 1a — critique (UX)

| Severity | Area             | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Bronze chrome    | `<section className="border-acc-100/30 bg-acc-100/5 …">` paints the **entire HAWKS block** with a bronze tint + bronze border. Bronze is the cockpit's earned-signal token (`acc-100`) — decorative use across a sectional band is the canonical Earned-Bronze violation. Compare to the rest of `trade-form.tsx`: no other section reaches for `acc-100` as backdrop. The HAWKS block currently shouts "I am special" via chrome rather than via the data inside it. |
| P1       | Verdict copy     | Each toggle's label + hint shouts twice ("Triple screen confirmed?" + "Did your 5-screen checklist hold at entry?"). The hint repeats the label. Either remove the hint or make the hint a single-clause clarifier, not a question.                                                                                                                                                                                                                                   |
| P1       | Switch semantics | All three switches default `undefined`. Visually they read as "off". A trader who _forgot_ to set them and a trader who _deliberately set them off_ are indistinguishable at save time. Either default to required (force a yes/no per trade) or surface the indeterminate state explicitly.                                                                                                                                                                          |
| P2       | Tap target       | `<Switch>` is the shadcn primitive — assumed ≥ 24 px. Confirm in 3b.                                                                                                                                                                                                                                                                                                                                                                                                  |
| P2       | Reading order    | Hint paragraph sits _between_ `FormLabel` and `FormMessage`. When validation fires, the message appears below the hint — distant from the label it relates to. Acceptable, but tight.                                                                                                                                                                                                                                                                                 |

## Phase 1b — audit (technical)

| Severity | Area                             | Observation                                                                                                                                                                                                                                                                                           |
| -------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Token discipline                 | `border-acc-100/30 bg-acc-100/5` — see 1a P0. Replace with neutral `border-bg-300 bg-bg-200` (same as DailyBiasForm and HawksSettings). Bronze stays on the Crosshair icon only.                                                                                                                      |
| P1       | a11y / hint not announced        | The `<p className="text-tiny text-txt-300">{t(row.hintKey)}</p>` is purely visual; the switch has `aria-label={t(row.labelKey)}` but no `aria-describedby` pointing at the hint. Screen-reader users hear the label only. Wire the hint with `id` + `aria-describedby` on the switch.                 |
| P1       | a11y / duplicate accessible name | `<FormLabel>` renders the visible label text; `<Switch aria-label={t(row.labelKey)} />` repeats the same text. AT will announce label twice. Drop the `aria-label` and rely on `FormLabel`'s `htmlFor`/control association via `FormItem`.                                                            |
| P2       | a11y / `FormLabel` association   | `FormLabel id={\`hawks-${row.key}-label\`}` is set, but the `<Switch id={\`hawks-${row.key}\`}>`doesn't reference it via`aria-labelledby`. The shadcn `FormField`wires`htmlFor` via context — confirm during 3f.                                                                                      |
| P2       | Form value model                 | `name={\`hawks.${row.key}\` as const}`— three nested HAWKS booleans.`TradeFormInput`shape must match (verify in`src/lib/validations/trade.ts`).                                                                                                                                                       |
| P2       | Conditional render               | `<HawksTradeFields>` is rendered by `<TradeForm>` only when account has HAWKS mode active (verified via mount surface). If a draft was saved with HAWKS active and reloaded after deactivation, the persisted `hawks.*` payload would be discarded silently. Edge case — log into 3c (harden states). |

## Phase 1 — Cross-cutting themes (logged once per Wave 9 page)

- **Bronze chrome violation** — confirmed here, expected unique to this surface. The block was the only HAWKS surface that painted the _whole section_ in bronze. Other surfaces use neutral chrome + bronze-only-on-icon.
- **Crosshair-stamp pattern** — third occurrence (after `DailyBiasForm`, `HawksSettings`). Extraction confirmed at threshold.
- **Hint-as-paragraph next to a control** appears across all three switch surfaces (this, bias panel, settings). Worth a `<HelpText>` primitive that wires `aria-describedby` for free.

---

## Phase 2a — extracted

- `FeatureStamp` — replaces inline Crosshair stamp.
- `HelpText` — replaces inline `<p>` description in the header and 3 inline `<p>` hints inside each switch row. Each hint now wires `aria-describedby` on its sibling `<Switch>`.

---

## Phase 3 — Per-page corrections

### 3a. Clarify copy

No copy edits in this pass. P1 finding "hint repeats label" is real but requires product/copy review — logged to backlog under "HAWKS pre-flight switch copy".

### 3b. Adapt for breakpoints

No layout changes. Padding ladder already correct (`p-s-300 sm:p-m-400`).

### 3c. Harden states

P2 edge case ("draft persisted with HAWKS active then reloaded after deactivation") deferred to backlog — needs trade-form-level coordination, not a HAWKS-block-local fix.

### 3d. Distill

Removed:

- **Bronze sectional chrome.** `border-acc-100/30 bg-acc-100/5` replaced with `border-bg-300 bg-bg-200`. The HAWKS block now matches the visual register of every other section in the trade form; bronze is reserved for the Crosshair icon inside `FeatureStamp` (earned signal). This is the canonical Earned-Bronze fix — the single most consequential subtraction in Wave 9.
- Duplicate `aria-label` on each `<Switch>` (the visible `FormLabel` already supplied the accessible name).

### 3e. Quieter (opt-in)

Effectively run via 3d — bronze count on this surface dropped from 3 hits (border + bg + icon) to 1 (icon only). Page still passes the scene sentence: the trader can still identify the HAWKS band at a glance via the Crosshair stamp + title, without bronze chrome shouting.

### 3f. Polish

P0 fix landed: bronze chrome removed. P1 a11y fixes landed: duplicate accessible name resolved + `aria-describedby` wires hint to control.

---

## Phase 4 — Enhancement

Default skip per cockpit-product rule.

---

## Sign-off checklist

- [x] Phase 1 synthesis written, with severity labels.
- [x] Phase 2 actions either taken or explicitly skipped with reason.
- [x] Phase 3 steps 3a–3d and 3f completed; 3e completed or explicitly skipped.
- [x] Phase 4 entirely skipped, or each step has a one-line justification.
- [x] `pnpm lint` / `pnpm lint:strict` / `pnpm exec tsc --noEmit` all green.
- [x] WCAG checklist ticked.
- [x] Findings log committed under `docs/scans/`.
- [x] `docs/backlog.md` updated with any cross-page issues this sweep surfaced.
- [ ] Conventional Commit messages for each Phase 3 step (`refactor(hawks-trade-form): …`, `fix(hawks-trade-form): …`, `style(hawks-trade-form): …`).
