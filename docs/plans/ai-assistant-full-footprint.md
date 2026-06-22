# AI Assistant — Full Footprint Across Axion

**Status**: Spec extension. Companion to [`docs/plans/ai-assistant-phase-1.md`](ai-assistant-phase-1.md) (which locks Phase 1 alone). This doc maps **every surface in Axion** where an assistant carries weight, by what kind of help fits, by ROI, and by risk-of-harm. Sequences Phase 1.5, 2, and 3.

**Date**: 2026-06-22.

**Why this exists**: the Phase-1 plan picks one surface (trade detail) and ships well. But Axion has ~17 surfaces where an assistant could plausibly live. Without a map of all of them up front, Phase 1.5 risks becoming "ship whatever's next" rather than "ship by ROI and earn the right to the harder surfaces". This doc is the map.

---

## 1. The seven archetypes (vocabulary lock)

Every assistant surface in Axion fits one of these seven shapes. **Pick the archetype FIRST**, surface second — the archetype determines the validator rules, the tool scope, and the risk gate.

| Archetype      | What it does                                                                                               | Hard rule                                                                               | Example sentence                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Narrator**   | Explains numbers the engine already computed. Past tense, descriptive.                                     | Every number traces to a tool-call return.                                              | "From your enrichment for trade #4821: 2 of 5 boosters fired (htf15m ✓, vwap-D ✓); the engine scored this A-tier."                                        |
| **Coach**      | Surfaces cross-trade / cross-day patterns in user's history.                                               | No prescription. Pattern + magnitude + sample size only.                                | "On Mondays this quarter: 9 trades, 22% WR, -0.4R avg. On Tuesdays: 14 trades, 64% WR, +1.2R avg."                                                        |
| **Scout**      | Points at the next thing the user should LOOK at on the current surface.                                   | Names what to look at; never says how to fix.                                           | "3 trades from this week still have `enrichmentStatus = pending`. Run /journal/enrich to fill the indicator readout."                                     |
| **Critic**     | Compares user's CHOICE vs engine-computed reality.                                                         | States the gap; never proposes the new value.                                           | "Your manual SL on this trade sat 30% tighter than the engine's `2 × brickSize` formula would have placed it (95pts vs 132pts)."                          |
| **Reviewer**   | Audits a user-authored config (ladder, recipe, playbook) against the user's own historical stats.          | Flags anomalies; never writes back.                                                     | "Your T1 = 3.33% per R. Trailing 90-day std of daily P&L is 1.8R. That implies ~140% expected drawdown range — outside the 3σ band the engine simulates." |
| **Doc-helper** | Answers methodology questions via RAG over `docs/` (book research, AAA tier definitions, OCO rule).        | Citation-mandatory; answer + source link in every paragraph.                            | "AAA tier = all 5 boosters aligned. From `docs/research/01-hawks/booster-checklist.md`: 'htf15m + htfPivot + macd + ema5m + vwap, all on entry side.'"    |
| **Drafter**    | Produces a structured draft (playbook, day-review, weekly retro) the user EDITS + ACCEPTS before any save. | Every drafted field traces to source data; write path is deterministic, not LLM-driven. | "Drafted playbook entry from your 5 winning EURUSD-SHORT-MACD-aligned trades — preview below. Click 'Adopt' to write to the playbook table."              |

**Rule**: a surface MAY combine multiple archetypes, but each archetype's response must come from its own tool slice + its own validator. Mixing in the model's head is where hallucination starts.

---

## 2. The full footprint — 17 surfaces

Mapped one row per surface. The numbers in the "Phase" column are the recommended phase, NOT a commitment.

| #   | Surface                               | Route                    | Archetype(s)            | Effort | Risk              | Phase    | ROI rank             |
| --- | ------------------------------------- | ------------------------ | ----------------------- | ------ | ----------------- | -------- | -------------------- |
| 1   | Trade detail (Phase 1, locked)        | `/journal/[id]`          | Narrator                | M      | Low               | **1**    | — (already shipping) |
| 2   | Day detail modal                      | `day-detail-modal.tsx`   | Narrator, Critic        | S      | Low               | **1.5**  | #1                   |
| 3   | Analytics                             | `/analytics`             | Coach, Scout            | S      | Low               | **1.5**  | #2                   |
| 4   | Reports                               | `/reports`               | Narrator, Scout, Critic | S      | Low (Med for tax) | **1.5**  | #3                   |
| 5   | Backtest results                      | `/backtest`              | Narrator, Scout         | S      | Low               | **1.5**  | #4                   |
| 6   | Command Center / Dashboard            | `/command-center`, `/`   | Coach                   | M      | Low               | **1.5**  | #5                   |
| 7   | Plan / Fractal                        | `/plan/[year]`           | Narrator, Reviewer      | M      | Low               | **1.5**  | #6                   |
| 8   | Risk Simulation                       | `/risk-simulation`       | Critic, Reviewer        | M      | Low               | **1.5**  | #7                   |
| 9   | Equity Shield                         | `/equity-shield`         | Critic                  | S      | Low               | **1.5**  | #8                   |
| 10  | OPTIMIZE sweep                        | `/backtest/optimize`     | Critic, Scout           | M      | **Medium**        | **2**    | #9                   |
| 11  | OCO Weeks                             | (table → new widget)     | Coach                   | M      | Low               | **2**    | #10                  |
| 12  | Monte Carlo                           | `/monte-carlo`           | Narrator, Scout         | M      | Low               | **2**    | #11                  |
| 13  | Indicator Lab                         | `/indicator-lab/[date]`  | Narrator                | M      | Low (admin-only)  | **2**    | #12                  |
| 14  | Hawks Engine Lab                      | `/dev/hawks-engine-lab`  | Narrator                | M      | Low (dev-only)    | **2**    | #13                  |
| 15  | CSV Imports (Profit Pro)              | (no dedicated route yet) | Scout, Reviewer         | M      | **Medium**        | **2**    | #14                  |
| 16  | Playbook                              | `/playbook/[id]`         | Critic, **Drafter**     | L      | **High**          | **3**    | #15                  |
| 17  | Conversational optimizer (write-path) | global drawer            | (multi)                 | XL     | **High**          | **3+**   | n/a                  |
| —   | Settings                              | `/settings`              | —                       | —      | —                 | **skip** | —                    |

**Three surfaces stay out**: `/settings` (pure form, no narration value), and any feature still being built (Tier Analytics page if it's not a routed surface yet — folded into Reports/Analytics scope).

---

## 3. Per-surface specs (Phase 1.5, ranked by ROI)

Each entry tells you: archetype lock, tool delta from Phase 1, the first message the assistant would write, the validator rules unique to this surface, and the done-bar.

### #1 — Day Detail Modal (Phase 1.5a)

- **Archetype**: Narrator + Critic.
- **Where**: `src/components/dashboard/day-detail-modal.tsx`. Inline panel inside the modal footer.
- **Why first**: cheapest extension. Same shape as Phase 1's trade narrator, just zoomed out to a day. End-of-day review is a daily ritual for Ygor → high session frequency.
- **Tool delta**: 1 new tool, `get_day_detail_with_enrichment(date, accountId)`. Returns: day P&L breakdown, each trade with its latest enrichment snapshot, day's equity curve. Reuses everything else.
- **First message**: _"2026-06-15: 6 trades, 4 wins, -0.7R total. First 3 trades were +1.2R combined. Then the EURUSD entry triggered when the 15m gate was misaligned per the Hawks replay — engine flagged it C-tier, you took it. That brought -0.8R. You recovered with a GBP scalp +0.5R in the final 20 minutes."_
- **Validator rules**: same as Phase 1. No new restrictions.
- **Done bar**: button in day-detail modal, narration matches engine-replay JSON 1:1, e2e green.
- **Effort**: S (~1 day).

### #2 — Analytics page (Phase 1.5b)

- **Archetype**: Coach + Scout.
- **Where**: `src/app/[locale]/(app)/analytics/page.tsx`. New section below the hour-of-day heatmap.
- **Why second**: pattern-mining is the single highest user-perceived value per token — surfacing a non-obvious Monday-vs-Tuesday gap is a moment of "I would never have looked for that". Data already aggregated server-side.
- **Tool delta**: 1 new tool, `get_analytics_cohorts(userId, accountId, window, groupBy)`. Returns cohort stats by hour-of-day, day-of-week, holding-period bucket, asset.
- **First message**: _"Last 90 days: best hour 10–11am (8 trades, 75% WR, +1.3R avg). Worst 2–3pm (6 trades, 17% WR, -0.8R avg). 80% of your volume is in the morning window; afternoon trades happen on days you're already up."_
- **Validator rules**: **Coach-archetype guard**. Refuse phrases like "stop trading the afternoon", "filter out Mondays", "you should". Allowed: "pattern shows…", "the cohort with X has Y outcome".
- **Done bar**: panel renders patterns from real user data; pattern signal isn't surfaced when sample size <10; phrasing stays past-tense + descriptive.
- **Effort**: S (~1 day).

### #3 — Reports (Phase 1.5c)

- **Archetype**: Narrator (P&L/tax) + Scout (data gaps) + Critic (month-over-month).
- **Where**: `src/app/[locale]/(app)/reports/page.tsx`. Inline panel above the monthly close section.
- **Why third**: tax narration is unique value (no other tool explains a DARF ledger in plain language). Month closing is monthly ritual.
- **Tool delta**: 2 new tools — `get_monthly_report(year, month, accountId)` and `get_tax_summary(year, accountId)`. Both read existing tables.
- **First message**: _"2026-06 monthly close: 18 trades, 48% WR, +R$3.2k gross. Day-trade IR (15%, 2026 rate) → R$480 tax, R$2.72k net liquid. Mistake cost R$340 (2 trades hit your manual SL when the engine said hold per the deterministic-SL pass). May carryover -R$120 applied."_
- **Validator rules**: **tax-archetype guard**. Every tax number MUST trace to `monthlyTaxLedger`. Tax rate MUST come from `getDayTradeIrRate(year)` constant. Permanent footer banner on tax messages: _"Tax summary is computed by the Axion tax engine; consult a CPA for filing."_
- **Done bar**: tax numbers match `reports/page.tsx` 1:1 (auto-test); carryover chain explained correctly; banner present on every tax message.
- **Effort**: S (~1-2 days).
- **Risk note**: Medium because tax. Spec is **read-only**; nothing about computing novel tax values. The narrator just explains existing rows.

### #4 — Backtest results (Phase 1.5d)

- **Archetype**: Narrator + Scout.
- **Where**: `src/app/[locale]/(app)/backtest/page.tsx`. New panel below the trades table.
- **Why**: post-run analysis benefits from natural-language framing. Equity-curve plateaus, cohort gaps, day-of-week clusters are non-obvious in the chart UI.
- **Tool delta**: 1 new tool, `get_backtest_run_by_id(runId)`. Reuses `BacktestResult` from `src/types/backtest.ts:728`.
- **First message**: _"This Hawks ORB variant scored PF 1.82 over 147 trades. Equity curve has 3 plateaus: May went flat, August had max-DD -R$2.1k, then recovery. WR 53%. Cohort gap: 60% of losses happened on Mondays."_
- **Validator rules**: **engine-internals guard**. Refuse phrases like "try widening exits", "tighten stops". Allowed: "the cohort shows…", "the equity curve flattens between X and Y".
- **Done bar**: every cited number matches the run's `BacktestSummary`; cohort flags appear only at n≥10.
- **Effort**: S (~1 day).

### #5 — Command Center / Dashboard (Phase 1.5e)

- **Archetype**: Coach.
- **Where**: `src/components/dashboard/coaching-insights-card.tsx` — extends existing card slot.
- **Why**: highest visibility (first page users see), lowest depth per call. Ship last in Phase 1.5 so the Coach grammar is mature.
- **Tool delta**: 1 new tool, `get_dashboard_kpis(accountId, window)`. Returns KPI roll-up + Hawks bias alignment + circuit-breaker state.
- **First message**: _"Daily checklist completion: 15/20 days this month (75%). On the 5 missed days, avg daily P&L -1.2R; on completed days +0.4R. Hawks bias has been bullish 8 of last 10 sessions; you traded 60% SHORT in that window."_
- **Validator rules**: same as Analytics Coach. No prescription.
- **Done bar**: card appears on dashboard; refreshes daily; never blocks page LCP (lazy-loaded after initial paint).
- **Effort**: M (~2 days).

### #6 — Plan / Fractal (Phase 1.5f)

- **Archetype**: Narrator + Reviewer.
- **Where**: `src/app/[locale]/(app)/plan/[year]/page.tsx`. Sidebar panel.
- **Why**: ladder math is hard to read; projection engine output is opaque. Narration of "you're on pace for X" + Reviewer flag for ladder/std mismatch.
- **Tool delta**: 1 new tool, `get_yearly_plan_with_projection(year, accountId)`. Reuses existing projection + ladder + tier-change audit log.
- **First message**: _"Your 2026 plan starts at R$30k. Current pace (1.2R/day × 5 trading-days/week) projects R$47.8k EOY. That triggers a tier jump from T1 (R$300/R) to T2 (R$450/R) in September per the ladder rule. Tax (15% day-trade IR) takes ~R$3.2k of the projection."_
- **Reviewer addition** (after Narrator paragraph): _"Reviewer flag: your T1 = 3.33% per R. Your trailing-90-day std of daily P&L is 1.8R. The Monte Carlo simulation at this size shows a 140% expected drawdown range. The Ladder Assistant has more on this."_
- **Validator rules**: **boundary-with-Ladder-Assistant guard**. The AI Assistant may _describe_ ladder values and _flag_ anomalies. It MAY NOT propose new ladder values, MAY NOT compute Kelly fractions, MAY NOT propose `f_target`. Those belong to the deterministic Ladder Assistant (separate idea in `docs/ideas.md`). Cross-reference is fine ("see the Ladder Assistant").
- **Done bar**: ladder math narrated correctly; projection cited matches the page; Reviewer flag never proposes a number.
- **Effort**: M (~2 days).

### #7 — Risk Simulation (Phase 1.5g)

- **Archetype**: Critic + Reviewer.
- **Where**: `src/app/[locale]/(app)/risk-simulation/page.tsx`. Sidebar panel.
- **Why**: simulation outputs are dense (percentile-curves, ruin probability). Narration + Critic that compares chosen brake settings to historical breaches.
- **Tool delta**: 1 new tool, `get_risk_simulation_by_config(configId)`. Reuses existing simulation results.
- **First message**: _"Your equity shield: -2R daily brake, -5R weekly brake. Across the last 90 days, the daily brake would have triggered on 2 sessions (2026-05-14 and 2026-06-03). Both days actual loss exceeded -2R by ≤0.3R. Weekly brake never triggered."_
- **Validator rules**: **shield-archetype guard**. Refuse "you should loosen to -3R" / "tighten the weekly brake". Allowed: "the brake would have triggered N times" / "the actual loss was X vs the brake at Y".
- **Done bar**: every breach cited matches the actual day's P&L; no recommendation phrasing leaks.
- **Effort**: M (~2 days).

### #8 — Equity Shield (Phase 1.5h)

- **Archetype**: Critic.
- **Where**: `src/app/[locale]/(app)/equity-shield/page.tsx`.
- **Why**: same tool surface as Risk Simulation, so ship together or right after.
- **Tool delta**: reuses `get_risk_simulation_by_config`.
- **Effort**: S (~½ day after Risk Sim).

---

## 4. Phase 2 surfaces (deferred — ship only after Phase 1.5 dogfood signs off)

These are surfaces where the data is interesting but either (a) the validator rules are not yet mature, or (b) the tool set requires new write paths or RAG.

### Phase 2a — OPTIMIZE Critic

- **Archetype**: Critic + Scout.
- **Hard challenge**: distinguishing "the frontier _shows_ clustering" (allowed) from "you _should expand_ the search range" (forbidden). The narration is right next to a "Run sweep" button; a small phrasing slip becomes a stealth recommendation. Defer until Coach/Critic validators have caught real-world phrasing slips on simpler surfaces and we've tuned the regex.
- **Tool delta**: `get_optimization_sweep_by_id`, `compute_pareto_robustness_breakdown`.
- **Risk**: Medium.

### Phase 2b — OCO Weeks Coach

- **Archetype**: Coach.
- **Hard challenge**: the "on pace to hit target" framing reads like advice unless phrased carefully. Also: no dedicated UI surface yet — Phase 2b needs to ship the widget FIRST (deterministic), THEN add the Coach.
- **Tool delta**: `get_oco_week_status(weekId)`.

### Phase 2c — Monte Carlo Narrator

- **Archetype**: Narrator + Scout.
- **Tool delta**: `get_monte_carlo_result_by_id`.
- **Why deferred**: lower-frequency feature (users don't run Monte Carlo daily), so the per-call value is lower; bumped behind higher-frequency surfaces.

### Phase 2d — Indicator Lab + Hawks Engine Lab

- **Archetype**: Narrator (admin/dev-only).
- **Why deferred**: tiny audience (you + maybe one other). Low priority despite low risk.

### Phase 2e — CSV Imports Scout + Reviewer

- **Archetype**: Scout + Reviewer.
- **Hard challenge**: import is a write-adjacent surface — the assistant flagging anomalies near a "Commit import" button risks being read as approval. Validator MUST scope to "describes discrepancies" and refuse "safe to commit" / "looks good".

### Phase 2f — Doc-helper (RAG over docs/)

- **Archetype**: Doc-helper.
- **Where**: a new "What does AAA mean?" / "Explain the OCO rule" inline button on any technical term in the app.
- **Tool delta**: a whole RAG pipeline — pgvector or external vector store, embedding job, chunking, retrieval tool. Significant infra.
- **Why deferred to Phase 2**: requires the most infra (vector store, embedding job) and the lowest ROI per dollar in Phase 1 (users learn methodology from the book + research docs they already have).

---

## 5. Phase 3 — write-path surfaces (highest risk, longest leash)

### Phase 3a — Playbook Drafter

- **Archetype**: Drafter + Critic.
- **What it would do**: cluster a user's recent winning trades by shared conditions (e.g., "5 LONG EURUSD with macd-aligned + vwap-D-above + tier-A all won, avg +1.2R"); produce a **draft** playbook entry (recipe + description + tag set) the user reviews + edits + ACCEPTS before any write to the `strategies` table.
- **Why this is risk-high**: a hallucinated condition (e.g., "add `MACD < -30` filter" when the cluster doesn't carry that signal) becomes a stealth recommendation the user adopts. The Drafter validator must cross-check **every condition in the draft** against ≥80% of the cluster's source trades. Any unsupported condition → reject the draft (not the response).
- **Tool delta**: `cluster_trades_by_conditions(filters)` + `get_strategy_with_recent_trades(strategyId)` + **write-path** `save_drafted_playbook(draft)` — but the write goes through the existing playbook save action (deterministic), not via the LLM.
- **Ship gate**: Phase 1 + Phase 1.5 must have ≤2% validator-caught violations across ≥500 messages before this even starts.
- **Effort**: L (~3-4 days for the cluster tool + the draft validator + the UI).

### Phase 3b — Conversational optimizer (the original Phase 2 from the locked Phase-1 spec)

- **Archetype**: combines Narrator + Critic + Drafter, plus the ability to _trigger_ `run_backtest` / `run_optimize_sweep` server actions.
- **Where**: global right-side drawer with page-aware context.
- **Why furthest out**: this is the surface that turns the assistant into a true co-pilot. Risk is the highest (the assistant runs backtests on your data). Wait until all the read-only archetypes have stable validators.
- **Effort**: XL.

---

## 6. Phase ladder summary (the ship plan above the PR-level plan)

| Phase                        | Surfaces                                                                                         | Effort total                     | Promote criteria to next phase                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------- |
| **1** (locked, Phase-1 spec) | Trade detail                                                                                     | ~1 wk                            | ≥50 narrations across ≥10 trades, ≤2% validator violations, ≤5% user-flagged hallucinations |
| **1.5**                      | Day detail → Analytics → Reports → Backtest → Dashboard → Plan → Risk Sim → Equity Shield        | ~2 wks (parallelizable in pairs) | ≥500 messages across ≥6 surfaces, ≤2% validator violations cumulatively                     |
| **2**                        | OPTIMIZE → OCO Weeks → Monte Carlo → Indicator Lab → Engine Lab → CSV Imports → Doc-helper (RAG) | ~3 wks + RAG infra               | Validators mature; ≤1% violations; pgvector infra running                                   |
| **3**                        | Playbook Drafter → Conversational optimizer                                                      | ~4 wks                           | Phase 2 stable; user trust established; write-path validators proven on the Drafter         |

**Hard gating between phases**: do NOT start phase N+1 until phase N has been live for 2 weeks AND hit the promote criteria. The mistake to avoid is treating "Phase 1.5" as one PR — it's 8 PRs, each independently gated.

---

## 7. Cost reality check across the full footprint

The Phase-1 plan locks $5/user/month. Across the full footprint that ceiling becomes too tight per surface. Two options when Phase 1.5 ships:

- **Option A** (recommended): keep the **global** $5/user/month ceiling — assistant access is rationed across surfaces by the user's own behavior. Heavy Analytics days mean less for trade-detail narration that day. Simple, no infra change.
- **Option B**: per-surface daily soft caps with a global monthly ceiling. More complex; requires a tiering table. Defer until a user actually hits the global cap and reports it as friction.

Cache discipline keeps cost flat: system prompt + tool schemas + Axion methodology snippets all cache-hit after warmup. Sonnet 4.6 warm narration turn ≈ 0.3¢. 1,500 warm turns/month per user at the $5 cap.

---

## 8. Risk gates (the lines we don't cross)

These apply across all 17 surfaces, not just Phase 1:

1. **No write tool ever proposes a parameter value.** Drafter writes drafts the user accepts; it never auto-applies.
2. **No assistant message edits user data without a deterministic save action between the LLM and the DB.**
3. **No cross-user data ever crosses the boundary.** Per-user tools always include `userId` + `accountId` and the server action verifies the caller owns them.
4. **No surface ships without its archetype-specific validator.** The validator IS the contract. Coach surfaces fail to ship if "should/try/consider" phrases leak in dogfood.
5. **No tax/legal/financial-recommendation phrase ships.** Tax narration always carries the CPA-disclaimer footer.
6. **No new surface ships without a 2-week dogfood window.** Drafter (Phase 3a) gets 4 weeks because of the higher risk.

---

## 9. What this doc does NOT do

- Doesn't replace `docs/plans/ai-assistant-phase-1.md`. That doc is the locked spec for Phase 1. This doc is a **forward map**, not a re-spec.
- Doesn't commit to building all 17 surfaces. Phases 2 and 3 are conditional on Phase 1 + 1.5 earning their place.
- Doesn't decide write-path validator schemas for Drafter — that's its own spec when Phase 3 starts.
- Doesn't decide between pgvector and an external vector store for Doc-helper — that's its own decision when Phase 2f starts.

Each later phase will get its own spec doc, just like Phase 1 did. The promote criteria gate the spec authoring, not just the build.
