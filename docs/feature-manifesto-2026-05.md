# Axion Feature Manifesto — 2026-05

> **Posture**: strategic audit of every shipped surface. Goal: decide where to invest, what to merge, what to deprecate. Source inputs: [`features.md`](features.md), [`backlog.md`](backlog.md) (P1 shortlist as of 2026-05-15), [`ideas.md`](ideas.md).
>
> **Verdict scale**:
>
> - **INVEST** — feature carries the product axis; pour effort here.
> - **KEEP** — earns its weight; maintain at current depth, don't expand.
> - **MERGE** — survives only as part of another feature; standalone surface is dilutive.
> - **DEPRECATE** — sunset on a schedule; the maintenance tax exceeds the value.

---

## 1. The lens — what "earns its weight" means today

Axion has **18+ user-facing surfaces and roughly one full-time user**. That ratio is the central tension. A feature that would be obviously valuable in a 1,000-user product can be obviously dilutive in this one — because each surface charges rent in five currencies:

1. **Menu-surface tax** — every nav item competes for attention with the methodology layer.
2. **Maintenance tax** — i18n keys, dark mode parity, monetary precision, RSC boundaries, encryption round-trips, Drizzle migrations.
3. **Confidence tax** — every surface that displays a monetary value must be right or the user loses trust in the whole product.
4. **Decision-velocity tax** — surfaces that overlap in purpose force the user to pick between them on every session.
5. **Methodology-axis opportunity cost** — every hour spent on the 18th surface is an hour not spent making Hawks (or the next methodology) feel native.

A feature earns its weight if it answers a question the trader **actually asks on a recurring rhythm**, or if it sells the product to the **next mentorship cohort**. Surfaces that fail both tests are deprecation candidates regardless of how technically elegant they are.

## 2. The strategic axis — what we are optimizing for

**Methodology embedment.** The product's wedge is no longer "a journal" — that's a commodity. The wedge is "a journal + methodology operating system that fits a mentor's curriculum so tightly that switching cost is curricular, not technical." Hawks v0 is the proof-of-concept. The investment thesis is:

> Every surface either makes a methodology trader's day faster, or it dilutes the menu.

That's the cut. Everything below is judged against it.

## 3. Feature-by-feature verdict

### 3.1 Plan & Prepare

| Feature                    | Purpose (1 sentence)                                                                                                 | Mode served                 | Verdict                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fractal Planning Suite** | Anchor daily decisions to long-term goals via a year → quarter → month hierarchy with provenance and what-if.        | Plan & Prepare, weekly.     | **KEEP**. This is the spine of the "professional-grade" claim. Last week's [BUG-2026-05-13] (capital init blocker) shows we're still finding ground-floor UX cracks — finish them before adding depth. No new investment until [`backlog #18 plan-vs-actual on yearly page`] lands. |
| **Strategy Playbook**      | Documented rule-set per strategy + per-trade compliance scoring; canonical home for methodology rules (Q1 resolved). | Plan & Prepare, occasional. | **INVEST.** Hawks = first structured playbook. Compliance scoring fed by `trade_conditions` (P1 #2). Detail page redesign and methodology-aware variants are downstream work.                                                                                                       |
| **Position Calculator**    | Quick lot-size math from R risk + stop distance.                                                                     | Plan & Prepare, ad-hoc.     | **MERGE — already shipped.** It lives as the "Calculadora" tab inside Command Center (no standalone route exists). No further work; verdict marked resolved.                                                                                                                        |

### 3.2 Live Session

| Feature            | Purpose                                                   | Mode                 | Verdict                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Command Center** | The single pre/live/post screen for the trading day.      | Live Session, daily. | **INVEST**. This is where mode-personalization (ideas.md) lands first. Hawks pre-flight switches, scorecard, B3 cap card all live here. Every methodology will personalize this surface.                                                                       |
| **Market Monitor** | Live quotes + B3 calendar + economic events on one panel. | Live Session, daily. | **MERGE — partially shipped.** Already embedded as the "Monitor" tab in Command Center. Remaining work: delete `src/app/[locale]/(public)/monitor/page.tsx` and `…/(public)/painel/page.tsx` (no internal links reference either — grep confirmed). XS effort. |

### 3.3 Record & Reflect

| Feature     | Purpose                                                                                    | Mode                     | Verdict                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Journal** | Single source of truth for every trade, with multiple capture paths and per-trade autopsy. | Record & Reflect, daily. | **INVEST**. Three of the P1 shortlist items live here: `trade_conditions` junction (#2), `window.confirm` migration on `/journal/[id]` (#4), Hawks sidecar fields are already shipped. The journal is the data layer of the methodology layer; investment here compounds. |

### 3.4 Review & Improve

| Feature                 | Purpose                                                                                                   | Mode                                | Verdict                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard**           | First screen at login — performance overview with KPIs, calendar, equity curve, coaching insights card.   | Review & Improve, daily.            | **KEEP** (with Hawks-axis tilt). Coaching insights card is the only methodology-aware piece today. The rest is canonical — fine, but won't get more investment until mode-personalization (ideas.md) gives it a Hawks-shaped layout.                                                                         |
| **Analytics Engine**    | Slice performance by any dimension (time/asset/tag/strategy) with insight cards and time-of-day heatmaps. | Review & Improve, weekly.           | **KEEP**. Earns its weight because it answers the "what's my pattern?" question on a weekly cadence. Don't expand — depth-of-slice has diminishing returns past what exists.                                                                                                                                 |
| **Account Comparison**  | Multi-account side-by-side equity curves and KPI ranking.                                                 | Review & Improve, occasional.       | **MERGE** into Analytics. Today it's a nested route under `/analytics/account-comparison` — the right shape is a filter mode inside Analytics, not a separate page. Removes one nav step, kills the duplicated KPI logic.                                                                                    |
| **Monthly Review**      | Read-only month view with month comparison + weekly breakdown.                                            | Review & Improve, monthly.          | **MERGE — as "Month Closing" affordance inside Reports.** The narrative is cycle-closing: prop-firm accounts read withdraw value, personal accounts read DARF + taxes. Preserve that ritual framing under Reports rather than as a separate surface. Account-type variants drive the card content. M effort. |
| **Performance Reports** | Pre-built weekly + monthly review artifacts, PDF export, mistake-cost analysis.                           | Review & Improve, weekly + monthly. | **KEEP**. The PDF export is the only path to "send my month to my mentor" — meaningful for the mentorship-cohort positioning. Don't expand; absorb Monthly Review (above).                                                                                                                                   |

### 3.5 Simulate & Optimize

| Feature                                 | Purpose                                                                                              | Mode                           | Verdict                                                                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Monte Carlo v1 (Edge Expectancy)**    | Stress-test the trader's edge (R-distribution) over N simulated trades — answers "is my edge real?". | Simulate, ad-hoc.              | **KEEP**. The R-space simulation answers a question the trader actually asks before adopting a new strategy.                                                                                                                                                       |
| **Monte Carlo v2 (Capital Expectancy)** | Stress-test capital trajectory given a chosen risk profile — answers "will I survive a bad month?".  | Simulate, ad-hoc.              | **KEEP**, but **rename** (backlog #75 MC rename). "v1/v2" is internal jargon that hides distinct purposes. "Edge Expectancy" and "Capital Expectancy" should be the surface names. Same engine bucket, different cognitive bucket.                                 |
| **Equity Shield**                       | Auto-throttle position size during drawdowns; scale back during recovery.                            | Plan & Prepare + Live Session. | **KEEP**. Niche but high-leverage — it's the only feature in the product that _prevents_ a bad day from compounding. Don't expand; current Method 1 + Method 2 covers the use cases.                                                                               |
| **Risk Simulation**                     | Replay historical trades with modified risk params — answers "what if I'd been less greedy?".        | Review & Improve, occasional.  | **KEEP**. Pairs naturally with Equity Shield; the trade-comparison table is the kind of artifact that drives a real behavior change.                                                                                                                               |
| **Backtest Engine**                     | Test strategies on historical candle data; modular entry / stop / target / sizing components.        | Simulate, ad-hoc.              | **INVEST**. Hawks-axis feature: Hawks v0 ships _as_ a preset (`hawks_v0`, engine v0.2 after BUG-2026-05-15). Every new methodology lands here first. Three P1 items touch it: visual layer redesign (#6), engineVersion UI badge (#76), tick-level fidelity (#77). |
| **Backtest Optimizer**                  | Parameter sweep across a single backtest config; heatmap + sortable runs table.                      | Simulate, occasional.          | **KEEP**. Earns its weight only as long as Backtest does — they share the engine. Don't expand independently.                                                                                                                                                      |

### 3.6 Tax & Compliance

| Feature                         | Purpose                                                                                        | Mode                                | Verdict                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yearly Tax Reporting (DARF)** | Brazilian day-trade tax engine: monthly DARF, prejuízo fiscal carryover, fee allocation, IRRF. | Review & Improve, monthly + yearly. | **INVEST**. This is the local-moat feature — international competitors don't have it, and the Brazilian regulator does the marketing for us. The recompute pipeline (`src/lib/tax/recompute-month.ts`) is already a protected path; the UI shell should match that gravity. |

### 3.7 Infrastructure & Cross-Cutting

| Feature                | Purpose                                                                        | Verdict                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Settings**           | Account / risk-profile / asset / tag / strategy / Hawks-CSV-import management. | **KEEP**. Each sub-surface is justified by exactly one consuming feature; the routing is fine.                                         |
| **Bug Report Capture** | In-app issue submission.                                                       | **KEEP**. Cheap; pays for itself on the first user-reported issue.                                                                     |
| **Page Guide System**  | Per-page in-app guidance.                                                      | **KEEP-but-shallow**. Useful for onboarding but easy to over-invest in. Don't write guides for surfaces queued for MERGE or DEPRECATE. |

### 3.8 Deprecation candidates

| Surface                                          | Why deprecate                                                                                                                                                                                                                                                                                                                               | Schedule                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Replay account mode**                          | Already on the chopping block (backlog #73 Replay deprecation sweep). It's a feature-flagged account variant that re-routes Command Center to a historical date — adds branching in `command-center-tabs.tsx`, `layout.tsx`, and `page.tsx` (visible in grep above) for a use case that demo-mode + the E2E journey suite now cover better. | Sweep ASAP.                                         |
| **Standalone `/monitor` and `/painel` routes**   | Duplicate the Command Center embedded panel; public versions never reached the marketing role they were drafted for.                                                                                                                                                                                                                        | Sweep with Replay or next housekeeping pass.        |
| **`/analytics/account-comparison` nested route** | Mergeable into Analytics filter (above).                                                                                                                                                                                                                                                                                                    | Merge during next Analytics edit.                   |
| **`/monthly` route**                             | Mergeable into Reports (above).                                                                                                                                                                                                                                                                                                             | Merge when Reports next needs structural attention. |

---

## 4. The three investment buckets

### INVEST (double down — the methodology axis)

- **Backtest** — entry-module surface area, visual layer (P1 #6), engineVersion UI badge (P1 #76), tick-level fidelity (P1 #77).
- **Journal** — `trade_conditions` junction (P1 #2), `window.confirm` migration (P1 #4), per-methodology sidecar fields.
- **Command Center** — mode-personalization framework (ideas.md), Hawks scorecard depth, per-mode pre-flight switches.
- **Strategy Playbook** — wire Hawks playbook end-to-end as the canonical case for "methodology-aware compliance scoring".
- **Yearly Tax (DARF)** — local-moat polish; recompute is already protected, the UI should match.

### MERGE (consolidate — reclaim menu surface)

- ~~**Position Calculator** → Command Center~~ **(shipped — Calculadora tab).**
- **Market Monitor** → public routes deletion only (embedding done as Monitor tab).
- **Account Comparison** → Analytics filter mode.
- **Monthly Review** → "Month Closing" affordance inside Reports, with prop-firm vs personal-account card variants.

### DEPRECATE (cut — pay back maintenance tax)

- **Replay account mode** (P1 #73 already in backlog).
- **`src/app/[locale]/(public)/monitor/page.tsx`** and **`…/painel/page.tsx`** — confirmed orphaned (no internal links).

### KEEP-as-is (earns its weight, don't expand)

- Dashboard, Analytics, Monte Carlo v1, Monte Carlo v2 (rename pending #75), Equity Shield, Risk Simulation, Backtest Optimizer, Settings, Bug Report, Page Guide.

---

## 5. Strategic gates — RESOLVED 2026-05-15

**Q1. Is "playbook" the right home for methodology rules?**
**Answer: YES.** Strategy Playbook is the canonical home for methodology rules. Hawks (and future methodologies — ORB, DezK) live as structured playbooks with hard rules + scorecard. The conditional INVEST on Playbook (§3.1) becomes **unconditional INVEST**. Concrete next moves:

- Define "Hawks playbook" as the canonical structured-methodology example.
- Per-trade compliance scoring (`trade_conditions` junction, P1 #2) feeds the playbook's scorecard view.
- Playbook detail page gets a methodology-aware redesign (new backlog candidate; see §6 below).

**Q2. Does mode-personalization land at the route, widget, or both?**
**Answer: BOTH, leaning widget.** "It's a lens on top of general surface, not a distinct frame." This is the architectural shape:

- Default: widget-level mode-aware contracts inside the canonical layout. A registry or context that lets a widget say _"I have a Hawks variant; render that when mode=Hawks, else canonical."_
- Escape hatch: route-level swap reserved for surfaces where the methodology fundamentally changes the layout (rare — likely none in the current 18-surface inventory).
- Implication: the framework is a per-component opt-in pattern, not a layout-level mode prop. Lower blast radius per new methodology, cheaper to ship.

**Q3. Multi-account: first-class or escape-hatch?**
**Answer: FIRST-CLASS.** Worth the complexity. Account Comparison merge into Analytics filter (§3.4) still stands — that's about page consolidation, not deprecating multi-account. The account concept survives in nav, in settings, in journal scoping. No further merges follow from this.

---

## 6. What this manifesto changes in the backlog

With Q1/Q2/Q3 resolved (§5), the manifesto produces a concrete delta against `backlog.md`. To file as new entries:

1. **(MERGE) Delete `/monitor` and `/painel` public routes.** XS effort. The Monitor tab inside Command Center fully covers the use case; grep confirms zero internal references. One PR.
2. **(MERGE) Account Comparison → Analytics filter mode.** S effort. Remove `/analytics/account-comparison/page.tsx`; surface the same view as a multi-account filter inside Analytics' existing filter panel. Preserves multi-account as a first-class concept (Q3).
3. **(MERGE) Monthly Review → "Month Closing" in Reports.** M effort. Build the cycle-closing card with two account-type variants (prop-firm withdraw view, personal-account DARF view); delete the standalone `/monthly` route once Reports owns the narrative.
4. **(INVEST, Playbook) Playbook detail page methodology-aware redesign.** L effort. Hawks as the canonical structured-methodology playbook; compliance scoring fed by `trade_conditions` (already P1 #2).
5. **(INVEST, framework) Mode-personalization widget contract.** M effort. Per-component opt-in pattern (registry/context — see Q2). Lower blast radius than a layout-level mode prop. The framework's first consumer is the Hawks-flavored dashboard card.
6. **(KEEP-but-shallow) Page Guide System — deferred-per-feature reminder.** XS effort, P3. The foundations are built; per-feature guide writing is cheap but never urgent. Add a checklist line to the PR template so it surfaces during feature work without becoming a blocker. Backlog placeholder so it doesn't get lost.

Beyond these, the **INVEST list** maps 1:1 to existing P1 #2, #4, #6, #76, #77 — no rewrites needed.

Cleanup steps for the backlog (do as one PR):

1. ✅ Cross-reference added at the top of P1 shortlist (done this session).
2. File entries (1)–(6) above with priority + effort.
3. Re-run the manifesto at the next major methodology landing (when ORB or DezK gets a v0).

---

## 7. Methodology note — why this format, not the formal review

A formal 11-section plan review is calibrated for a plan document about proposed new work. This manifesto is the inverse: a strategic audit of shipped surfaces. The valuable output is sharp verdicts grouped into invest/merge/deprecate, plus the 2-3 strategic questions that gate the next cycle — not per-finding AskUserQuestion theater. The skill workflow correctly degrades to SELECTIVE EXPANSION (Step 0F) for this posture.
