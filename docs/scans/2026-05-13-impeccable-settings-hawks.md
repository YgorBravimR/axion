# Impeccable sweep — Wave 9 HAWKS / Settings (row #35)

**Date:** 2026-05-13
**Wave:** 9 / HAWKS
**Route covered:** `src/app/[locale]/(app)/settings/page.tsx` → `<SettingsContent />` → HAWKS tab → `<HawksSettings />`
**Inherited baseline:** [scans/2026-05-12-impeccable-settings-wave6.md](2026-05-12-impeccable-settings-wave6.md) — host page Phase 3 done; this log reviews **only** the HAWKS settings tab band.

**Scene sentence:** _Trader on Sunday evening, deciding whether to put themselves on the HAWKS playbook for the trading week — a ceremonial commitment, not a casual toggle._

---

## Phase 1a — critique (UX)

| Severity | Area               | Observation                                                                                                                                                                                                                                           |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Ceremony alignment | The AlertDialog confirmation pattern is correct for a mode change (matches CLAUDE.md "no native dialogs" rule). ✓                                                                                                                                     |
| P1       | Status copy        | `t("statusActive") / t("statusInactive")` — verify in 3a that these aren't cheerful ("You're on!" / "Switched off").                                                                                                                                  |
| P2       | Container width    | `mx-auto max-w-2xl` constrains the card to 672 px on wide displays. For an ultrawide cockpit this leaves vast whitespace either side, but the trader is in the settings flow (not the cockpit) so the constraint reads as readable, not stingy. Keep. |
| P2       | Reachability       | The HAWKS tab is only visible if the host settings tabs surface it. Wave 6 audit covered tab discoverability — assume inherited. Confirm tab label string passes voice gate during 3a.                                                                |
| P2       | Loader placement   | Spinner sits left of the switch when toggling. Hierarchy reads "we're working → switch" — fine.                                                                                                                                                       |

## Phase 1b — audit (technical)

| Severity | Area                              | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Token discipline / Verdict-as-P&L | `<span className={active ? "text-profit font-medium" : "text-txt-200"}>` — `text-profit` (signed-money-positive) is being repurposed to paint a **boolean category** (HAWKS is on/off). Identical violation pattern to Wave 6's `Pattern B — Category-as-P&L` cleaned up across 4 widgets (`timeframe-list`, `asset-list`, `indicator-definition-table`, `indicator-group-cards`). HAWKS reintroduced the same hijack. Use the verdict-good triad: `text-fb-success` (or whatever the wave-6 settled name is). |
| P1       | a11y / status announcement        | When the dialog confirms and toggle flips, only a toast fires. The visible status string changes too but has no `aria-live`. AT users with toast disabled would only hear the toast announcement — soft P1; toast usually carries the announcement. Confirm with screen-reader smoke.                                                                                                                                                                                                                          |
| P2       | a11y / Switch labelling           | `<Switch aria-label={active ? t("deactivate") : t("activate")} />` — label text changes with state. Acceptable but means a user re-tabbing back to a switch they just toggled hears the _next_ action, not the current state. Consider `aria-label={t("modeToggle")}` + relying on `aria-checked` for state.                                                                                                                                                                                                   |
| P2       | i18n                              | `tCommon("status")`, `tCommon("cancel")`, `tCommon("save")` — pulls from shared `common` namespace. Verify HAWKS-specific keys exist in both `en` and `pt-BR` (settings tab is bilingual). Spot-check during 3a.                                                                                                                                                                                                                                                                                               |
| P2       | Confirmation correctness          | Dialog `open={pendingTarget !== null}` cleanly handles the two-state confirmation. `handleDialogOpenChange` guards against close-while-pending. ✓                                                                                                                                                                                                                                                                                                                                                              |
| P2       | Token discipline / bronze         | Crosshair icon stamp: `bg-bg-300 text-acc-100 p-s-200 rounded-md` — earned bronze. ✓                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Phase 1 — Cross-cutting themes (logged once per Wave 9 page)

- **`text-profit` as boolean indicator** — direct echo of the Pattern B family Wave 6 cleaned up. HAWKS escaped that sweep because it didn't exist yet. Single-file fix here, but worth a discovery note in `docs/gotchas.md` so future feature work doesn't repeat: _"any boolean 'on/active' indicator must use the verdict triad, never trade-buy/profit"_.
- **Crosshair stamp** — third occurrence confirmed; extract.
- **State-dependent `aria-label` on toggles** — minor but worth deciding the project-wide convention (state-tracking vs action-naming).

---

## Phase 2a — extracted

- `FeatureStamp` — replaces inline Crosshair stamp.
- `HelpText` — replaces inline `<p>` description; assigns `id="hawks-mode-description"` so the `<Switch>` can `aria-describedby` it.

---

## Phase 3 — Per-page corrections

### 3a. Clarify copy

No copy edits. `statusActive`/`statusInactive` and `description` strings will be voice-checked in a translation pass; logged to backlog as "HAWKS settings tab copy review (en + pt-BR)".

### 3b. Adapt for breakpoints

No layout changes. `mx-auto max-w-2xl` keeps the card at 672 px and is appropriate for the settings flow (not the cockpit).

### 3c. Harden states

No state edits — pending + idle covered by `isPending` + spinner. Error recovery is via toast (`modeStartFailed`/`modeStopFailed`). The exact error copy quality is a backlog item alongside the voice review.

### 3d. Distill

Removed:

- **`text-profit` for active-state boolean.** Replaced with `text-fb-success` — the verdict-good triad Wave 6 settled on. The "Active" word now reads as a verdict (good state achieved), not as a profit signal. Same family as Wave 6 Pattern B; HAWKS reintroduced it because the feature shipped after Wave 6 closed.
- The state-tracking `aria-label` (which changed with the toggle's state, confusing re-focus) replaced with a stable `aria-label={t("title")}` + `aria-describedby="hawks-mode-description"`. AT users now hear the stable label + description on focus; `aria-checked` carries state.

Added:

- `aria-live="polite"` on the status span — the visible word change is now announced to AT on state flip (previously only the toast carried the announcement).

### 3e. Quieter (opt-in)

Skipped — no bronze over-use on this surface. Bronze only appears via `FeatureStamp` icon.

### 3f. Polish

P0 fix landed: `text-profit` → `text-fb-success` (verdict-as-P&L hijack resolved). A11y improvements: stable aria-label + aria-describedby + aria-live for status.

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
- [ ] Conventional Commit messages for each Phase 3 step (`refactor(hawks-settings): …`, `fix(hawks-settings): …`, `style(hawks-settings): …`).
