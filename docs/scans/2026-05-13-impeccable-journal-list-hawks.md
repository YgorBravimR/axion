# Impeccable sweep — Wave 9 HAWKS / Journal list (row #32)

**Date:** 2026-05-13
**Wave:** 9 / HAWKS
**Route covered:** `src/app/[locale]/(app)/journal/page.tsx` → `<DailyBiasPanel />` (server) → `<DailyBiasForm />` (client) band
**Inherited baseline:** [scans/2026-05-12-impeccable-journal-list.md](2026-05-12-impeccable-journal-list.md) — host page Phase 3 done; this log reviews **only** the HAWKS-added daily bias panel.

**Scene sentence:** _Trader opening the journal at 8:50 a.m. ET, before the cash session, committing today's bias and 5-screen checklist to the page so they can't argue with themselves at 10:30 about which way they intended to lean._

---

## Phase 1a — critique (UX)

| Severity | Area                 | Observation                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Decision ergonomics  | The 5-screen checklist is a vertical `<ul>` of full-width rows; each row is checkbox + label + hint. Cognitive load per row is high (label + hint paragraph). For a pre-market ritual that's repeated daily, the hint paragraph competes with the label and slows execution. Hints should be on-demand (info-i affordance) or hidden behind a "first-time" reveal, not stacked permanently. |
| P1       | Verdict ambiguity    | Save button label flips between `tCommon("save")` (when row exists) and `t("confirmAction")` (when no row yet). "Confirm" reads as ceremony; "Save" reads as routine. Same action, two voices. Pick one — recommend "Save" + sub-label "Bias confirmed at HH:MM" once written.                                                                                                              |
| P2       | Empty notes guidance | Textarea placeholder is `t("notesPlaceholder")` — must pass voice gate during 3a. Notes are optional; placeholder shouldn't shame the user into filling.                                                                                                                                                                                                                                    |
| P2       | Status feedback      | After save, only a toast confirms. The form itself doesn't re-stamp ("confirmed at 8:51"). A trader scanning later wants to know _when_ they committed — not just _that_ they did.                                                                                                                                                                                                          |
| P2       | Bias semantics       | `long / neutral / short` order in `biasOptions` is correct (positive → neutral → negative) — visually maps to "up / flat / down". ✓                                                                                                                                                                                                                                                         |

## Phase 1b — audit (technical)

| Severity | Area                       | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | a11y / dangling `htmlFor`  | `<Label htmlFor="hawks-bias-direction">` points at `hawks-bias-direction`, which is the `<SegmentedToggle>` value, not a focusable element with that id. Same dangle for `htmlFor="hawks-bias-screens"` pointing at a `<ul>`, and `htmlFor="hawks-bias-notes"` pointing at the Textarea (this one is correct). For the two dangling ones: replace `<Label htmlFor=…>` with a non-`htmlFor` label element, and rely on the SegmentedToggle's `aria-label` / use `<fieldset><legend>` for the screens list. |
| P1       | a11y / Checklist semantics | The 5-screen list is `<ul>` of `<li>` rows, but the section it represents is a **group of related checkboxes** — semantically a fieldset. Screen-reader users currently hear "list, 5 items" rather than "group, 5 checkboxes". Wrap in `<fieldset>` with a `<legend>` (visually the existing "5-screen confirmation" label).                                                                                                                                                                             |
| P2       | a11y / Label id naming     | `<Label id="hawks-bias-direction-label">` is assigned an id but nothing references it (no `aria-labelledby` on the SegmentedToggle). Either reference it or drop the id.                                                                                                                                                                                                                                                                                                                                  |
| P2       | Token discipline           | `bg-bg-300 text-acc-100` square stamp for the Compass icon = earned bronze (feature identity). ✓                                                                                                                                                                                                                                                                                                                                                                                                          |
| P2       | Token discipline           | Section uses `border-bg-300 bg-bg-200` — neutral chrome, no halos. ✓                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P2       | Responsive                 | `p-s-300 sm:p-m-400 lg:p-m-500` — three-step padding ladder. ✓                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P2       | Motion                     | Loader has `motion-reduce:animate-none`. ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P2       | Server boundary            | `DailyBiasPanel` is a server component, fetches via `getActiveHawksAccount` + `getDailyHawksBias` (both `cache()`-wrapped). Returns `null` if HAWKS not active — caller must conditionally render. ✓                                                                                                                                                                                                                                                                                                      |

## Phase 1 — Cross-cutting themes (logged once per Wave 9 page)

- The bronze-square Crosshair/Compass stamp pattern appears here too (`bg-bg-300 text-acc-100 p-s-200 rounded-md` shell + lucide icon + adjacent title + description). Confirmed across `<DailyBiasForm>` (Compass), `<HawksTradeFields>` (Crosshair), `<HawksSettings>` (Crosshair). **Three call sites → extraction candidate.**
- Dangling `htmlFor` may be a HAWKS-wide pattern (also a likely Phase 1b finding in the trade-form log). Verify and dedupe at synthesis.
- Verdict copy ("Save" vs "Confirm" vs "Activate" vs "Deactivate") is inconsistent across HAWKS surfaces — settings uses Activate/Deactivate (correct ceremony), bias panel mixes Save/Confirm. Settle on one verb per action class during 3a.

---

## Phase 2a — extracted

- `FeatureStamp` (`src/components/ui/feature-stamp.tsx`) — replaces the inline `<div className="bg-bg-300 text-acc-100 p-s-200 rounded-md"><Compass …/></div>` Compass stamp. Consumed at the panel header.
- `HelpText` (`src/components/ui/help-text.tsx`) — replaces 6 hand-rolled `<p className="text-tiny text-txt-300">` instances on this surface (1 description, 5 screen hints). All 5 screen-hint instances also got `aria-describedby` wiring on their sibling `<Checkbox>` so the hint is announced.

---

## Phase 3 — Per-page corrections

### 3a. Clarify copy

No copy edits. "Save" / "Confirm" verb inconsistency deferred — both strings live in i18n and need product input; logged to backlog as "HAWKS verb tidy". Notes placeholder voice gate not flagged.

### 3b. Adapt for breakpoints

No layout changes. Padding ladder `p-s-300 sm:p-m-400 lg:p-m-500` was already correct.

### 3c. Harden states

No state edits — form has loading (disabled controls + spinner on Save) and edit-vs-fresh distinction via `initialBias`. Empty state for "no bias yet" is the form itself.

### 3d. Distill

Removed:

- Orphan `Label id="hawks-bias-direction-label"` with dangling `htmlFor` → replaced with a styled `<span id>` since the SegmentedToggle is a button group, not a labelable form control. `aria-labelledby` wires the assistive path.
- Orphan `Label id="hawks-bias-screens-label"` → replaced with `<fieldset><legend>` semantics (correct grouping for related checkboxes).
- Inline bronze-stamp DOM in favour of `FeatureStamp`.
- Five inline `<p>` hints in favour of `HelpText` with `aria-describedby` wiring.

### 3e. Quieter (opt-in)

Skipped — bronze (`acc-100`) only appears via `FeatureStamp` (icon) and via the verdict-good color on Save button which is system-default. No over-use.

### 3f. Polish

P0 fixes landed: dangling `htmlFor` removed (direction) and replaced with correct semantics (`fieldset/legend`). The 5-screen checklist is now a proper `<fieldset>` of `<Checkbox>` with `aria-describedby` linking each hint to its control.

---

## Phase 4 — Enhancement

Default skip per cockpit-product rule. Justify here if any step is run.

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
- [ ] Conventional Commit messages for each Phase 3 step (`refactor(hawks-journal): …`, `fix(hawks-journal): …`, `style(hawks-journal): …`).
