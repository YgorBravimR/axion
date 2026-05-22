# Impeccable sweep — Wave 6 Settings (row #23)

**Date:** 2026-05-12
**Wave:** 6 / Settings
**Route covered:**

- Row #23 — `src/app/[locale]/(app)/settings/page.tsx` → `<SettingsContent />` tab tree (9 tabs / 27 widget files)

One combined doc per Wave 4/5 precedent: the settings surface mounts 27 widget files behind a single tab orchestrator and every widget is reached through the same entry route. Separate scans would compound 80% boilerplate.

---

## Phase 0 — Orchestrator inventory

`settings/page.tsx` is an async server component that gates `usersWithAccounts` + `seedBuiltInRiskProfiles()` behind `isAdmin` and forwards everything else to `<SettingsContent />` (client) inside `<Suspense>`. The client component renders a `<Tabs>` strip with one base tab (`profile`) plus eight admin-only tabs.

| Tab          | Trader-visible? | Widget mount                                                                          |
| ------------ | --------------- | ------------------------------------------------------------------------------------- |
| `profile`    | yes             | `<UserProfileSettings />`                                                             |
| `account`    | admin           | `<AccountSettings />`, `<TradingAccountSettings />`                                   |
| `tags`       | admin           | `<TagList />`, `<TagForm />`                                                          |
| `conditions` | admin           | `<ConditionList />`, `<ConditionForm />`                                              |
| `indicators` | admin           | `<IndicatorList />`, `<IndicatorDefinitionTable />`, `<IndicatorGroupCards />`, forms |
| `assets`     | admin           | `<AssetList />`, `<AssetForm />`                                                      |
| `timeframes` | admin           | `<TimeframeList />`, `<TimeframeForm />`, `<RecalculateButton />`                     |
| `users`      | admin           | `<UserList />`                                                                        |
| `bugs`       | admin           | `<BugReportsList />`                                                                  |

`<RecalculatePnLButton />` is mounted from `general-settings.tsx` (reachable via `account` tab).

Out of scope: `brand-switcher.tsx`, `language-switcher.tsx`, `general-settings.tsx`, `annual-reporting-settings.tsx` — pure form controls, no trade-color or bronze hijacks per grep.

---

## Phase 1a — Token-discipline scan

Six trade-color hijacks found. All collapse to two patterns.

### Pattern A — Verdict-as-P&L (operation outcome painted as profit polarity)

| File                                                 | Loc | Element                                       | Hijack                                                               |
| ---------------------------------------------------- | --- | --------------------------------------------- | -------------------------------------------------------------------- |
| `src/components/settings/recalculate-button.tsx`     | L48 | Result message paragraph after R-value recalc | `result.status === "success" ? "text-trade-buy" : "text-trade-sell"` |
| `src/components/settings/recalculate-pnl-button.tsx` | L49 | Result message paragraph after P&L recalc     | Same expression                                                      |

**Verdict.** "Recalc succeeded" is an operation-outcome verdict, not signed profit. A failed recalc is not a money loss — it's an action that errored. The verdict triad (`fb-success` / `fb-error`) is the canonical slot.

### Pattern B — Category-as-P&L (boolean isActive painted as profit polarity)

| File                                                     | Loc  | Element                                     | Hijack                               |
| -------------------------------------------------------- | ---- | ------------------------------------------- | ------------------------------------ |
| `src/components/settings/timeframe-list.tsx`             | L271 | `<ToggleRight />` (timeframe enabled state) | `className="text-trade-buy h-4 w-4"` |
| `src/components/settings/asset-list.tsx`                 | L241 | `<ToggleRight />` (asset enabled state)     | Same                                 |
| `src/components/settings/indicator-definition-table.tsx` | L144 | `<ToggleRight />` (indicator enabled state) | Same                                 |
| `src/components/settings/indicator-group-cards.tsx`      | L152 | `<ToggleRight />` (indicator-group enabled) | Same                                 |

**Verdict.** A "this row is enabled" state is categorical/binary, not signed profit. The repetition across four widgets shows the misuse compounding — once one widget reached for `trade-buy` for "active = good", the next three copied it. Verdict-good ≠ trade-buy. Verdict triad applies.

### Bronze (`acc-100`) usage — clean

Grep confirms `acc-100` in `account-settings.tsx` is reserved for premium accent moments (subscription CTA, upgrade prompts) and `bg-acc-100 text-bg-100` on the two primary recalc buttons. Earned-Bronze Rule respected.

### Other surfaces — clean

`account-settings.tsx`, `user-profile-settings.tsx`, `bug-reports-list.tsx`, `tag-list.tsx`, `condition-list.tsx`, `user-list.tsx`, `general-settings.tsx`, `annual-reporting-settings.tsx`, `trading-account-settings.tsx` — no trade-color hijacks. `fb-error` on destructive zones is correct verdict usage.

---

## Phase 1b — Accessibility scan

### `settings-content.tsx` tab icons

Nine `<TabsTrigger>` icons render alongside visible text labels but lack `aria-hidden="true"`. Screen readers announce the icon as nameless graphics next to the tab name — classic decorative-icon a11y miss.

| Loc  | Icon            | Tab label  |
| ---- | --------------- | ---------- |
| L115 | `<User />`      | profile    |
| L121 | `<Briefcase />` | account    |
| L125 | `<Tag />`       | tags       |
| L129 | `<Filter />`    | conditions |
| L133 | `<BarChart3 />` | indicators |
| L137 | `<Coins />`     | assets     |
| L141 | `<Clock />`     | timeframes |
| L145 | `<Users />`     | users      |
| L149 | `<Bug />`       | bugs       |

### `timeframe-list.tsx` toggle icons

| Loc  | Icon              | Notes                                                       |
| ---- | ----------------- | ----------------------------------------------------------- |
| L271 | `<ToggleRight />` | Parent `<Button>` carries `aria-label`; icon is decorative. |
| L273 | `<ToggleLeft />`  | Same.                                                       |

The sibling widgets (`asset-list`, `indicator-definition-table`, `indicator-group-cards`) already wired `aria-hidden` on their toggle icons. `timeframe-list` is the outlier.

### Deferred — wider admin-widget icon audit

Across `bug-reports-list.tsx`, `tag-list.tsx`, `condition-list.tsx`, `indicator-list.tsx`, `user-list.tsx`, `tag-form.tsx`, `condition-form.tsx`, `account-settings.tsx`, `trading-account-settings.tsx` there are ~25 decorative icons inside `<Button>` triggers that carry text labels. None block keyboard or screen-reader use because each parent button has its visible text, but adding `aria-hidden` would be a clean hygiene pass.

Deferring to a dedicated admin a11y sweep so the same pass can also wire `aria-controls` on `<TabsTrigger>` → tab-panel id mapping (currently each `<TabsContent>` ships with an auto-generated id but the `<TabsTrigger>` does not point back to it explicitly). The two follow-ups belong together — touching the tab strip twice would be wasteful.

---

## Themes

1. **Two distinct hijack patterns share one cause: missing the verdict triad.** Both Pattern A (operation outcome) and Pattern B (binary enabled flag) are non-monetary state painted with money colors. The fix is mechanical once the triad is internalized: anything that isn't a signed currency value reaches for `fb-success / fb-error / warning / txt-300`, never `trade-buy / trade-sell`.
2. **The category-as-P&L hijack compounds.** Four toggle widgets reach for `text-trade-buy` to mean "enabled". This is exactly the kind of pattern a shared `<ToggleState isActive />` primitive should absorb so callers cannot drift. Backlog item below.
3. **Settings tab strip is the highest-leverage a11y site in the route.** Nine icons next to visible labels, one component. Fixing it once benefits every settings page load.

---

## Phase 3 — Edits applied

### `src/components/settings/recalculate-button.tsx`

L48 — verdict-as-P&L → verdict triad:

```diff
- result.status === "success" ? "text-trade-buy" : "text-trade-sell"
+ result.status === "success" ? "text-fb-success" : "text-fb-error"
```

### `src/components/settings/recalculate-pnl-button.tsx`

L49 — same rewrite.

### `src/components/settings/timeframe-list.tsx`

- L271 — category-as-P&L → verdict triad: `text-trade-buy` → `text-fb-success`
- L271 / L273 — A11y: added `aria-hidden="true"` to both `<ToggleRight />` and `<ToggleLeft />`.

### `src/components/settings/asset-list.tsx`

L241 — category-as-P&L → verdict triad: `text-trade-buy` → `text-fb-success`. (`aria-hidden` already present.)

### `src/components/settings/indicator-definition-table.tsx`

L144 — same rewrite. (`aria-hidden` already present.)

### `src/components/settings/indicator-group-cards.tsx`

L152 — same rewrite. (`aria-hidden` already present.)

### `src/components/settings/settings-content.tsx`

A11y: added `aria-hidden="true"` to L115 `<User />`, L121 `<Briefcase />`, L125 `<Tag />`, L129 `<Filter />`, L133 `<BarChart3 />`, L137 `<Coins />`, L141 `<Clock />`, L145 `<Users />`, L149 `<Bug />`.

---

## Phase 4 — Deferred to backlog

- **Extract shared `<ToggleStateIcon isActive />` primitive.** Four widgets (`asset-list`, `timeframe-list`, `indicator-definition-table`, `indicator-group-cards`) now duplicate the exact same ToggleRight/ToggleLeft + `text-fb-success`/`text-txt-300` + `aria-hidden` map. Pull into `@/components/ui/toggle-state-icon` so future callers cannot drift back to trade colors.
- **Admin-widget decorative-icon a11y pass.** ~25 decorative icons inside text-bearing `<Button>` triggers across `bug-reports-list.tsx`, `tag-list.tsx`, `condition-list.tsx`, `indicator-list.tsx`, `user-list.tsx`, `tag-form.tsx`, `condition-form.tsx`, `account-settings.tsx`, `trading-account-settings.tsx` lack `aria-hidden="true"`. Bundle with the next item.
- **Tab-panel `aria-controls` mapping on `<TabsTrigger>`.** `<TabsContent>` ships auto-generated ids but `<TabsTrigger>` doesn't explicitly point back; screen-reader tab semantics weaken. Wire explicitly across `settings-content.tsx` (and audit other `<Tabs>` users in the same pass: `new-trade-tabs.tsx`, profile tabs, etc.).
- **Document verdict-triad rule for operation-outcome banners in DESIGN.md.** The Wave 6 recalc-button fix establishes "operation succeeded/failed → `fb-success / fb-error`, never trade colors". Codify so future async-action banners reach for the same scale.

---

## Sign-off

- `pnpm lint` — clean (0 errors)
- `pnpm exec tsc --noEmit` — clean
- Runbook row #23 marked done
- Backlog updated with 4 items above
