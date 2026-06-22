# Weekly Trade Review — Routines, Literature, and B3-Specific Practice

**Filed**: 2026-06-22. Reference document behind the `/review/weekly/[year]/[week]` feature.

This is the synthesis that informed the deterministic 6-phase Weekly Review shipped on `main`. AI integration is deferred (see `docs/backlog.md` → "Weekly Review — AI Coach pass over the review payload").

---

## 1. Brazilian / B3 Mentor Synthesis

The Brazilian retail futures scene (WIN, WDO, day-trade índice) emphasises **gestão de risco** as the foundational distinction between professional and amateur traders. The PT-BR vocabulary that matters in a review:

- **Risco operacional vs. risco emocional** — distinct failure modes the review must separate.
- **Contrato máximo** — the position cap declared in the plan.
- **Escalada de contratos** — the size-scaling protocol after wins / losses.
- **Tesouraria / Pontos de decisão** (TAT vocabulary) — key chart levels that anchor entries.
- **Trader profissional vs. amador** — the 90-90-90 statistic (90% of traders lose 90% of their capital in 90 days). Root cause is invariably **uncontrolled risk**.

Stormer (André Machado), Bastter, Palex (Alexandre Wolwacz), Trader Estoico, and TAT all converge on the same core review principle: **technical analysis tells you what to do; psychology determines whether you execute**. A weekly review must surface where execution broke from intent.

Specific to B3 day-trade índice:

1. **Risk limits**: 1%-per-trade rule; daily loss limits; weekly loss limits.
2. **Escalada coherence**: did scaling decisions follow the system or were they emotional (revenge / euphoria)?
3. **Asset segmentation**: edge often lives in one product (WIN) not another (WDO).
4. **Intraday discipline**: timing errors (late entry, holding past the optimal window) compound fast on high-leverage mini-contratos.

---

## 2. International Classics Synthesis

**Mark Douglas** — _Trading in the Zone_, _The Disciplined Trader_. Core principle: a trader's edge is not their strategy, but their ability to execute without emotional deviation. Review lens: _Did I deviate from my plan? Why? What triggered it?_

**Brett Steenbarger** — _The Daily Trading Coach_, _Trading Psychology 2.0_. Two-tier framework:

- **Week one**: log every decision with plan + emotion + outcome.
- **Week two**: strengths audit; identify three recurring strengths; design one micro-practice per day around one of them.

Steenbarger's two core insights:

- Emotions are **signals**, not distractions — they reveal what the trader believes.
- Patterns become undeniable around the **10th repetition**. Counting recurring mistakes is the single most behaviour-changing data point.

**Van Tharp** — _Trade Your Way to Financial Freedom_. Introduces the **R-multiple framework** that normalises every trade in units of initial risk. The 30-minute weekly review box asks seven questions:

1. Total P&L and R-multiple distribution?
2. Did you respect your stop losses?
3. Best and worst execution?
4. Where did you deviate from your plan?
5. What did you learn?
6. Goal for next week?
7. Did your setup tags match reality?

The 90-minute monthly review goes deeper: _which setups generated your edge? Which should you stop trading?_

**Linda Raschke** — Market Wizards interview. Key insight: _"I truly feel that I could give away all my secrets and it wouldn't make any difference. Most people can't control their emotions or follow a system."_ Her practices:

- Analyse when the market is closed (undisturbed).
- Enter with a **written game plan** as an anchor.
- Monitor four **profit centres** on a quarterly basis; if one underperforms, tweak.

**Adam Grimes** — _The Art and Science of Technical Analysis_. Statistical lens: most markets are random; your edge is identifying when they're not. Review requires a 50+ trade sample and segments by setup, time of day, day of week, and holding time. The famous example: a trader whose breakout edge worked 9:30–10:30 AM (67% WR, +2.3R avg) was a losing setup after noon (20% WR, −0.4R avg). Segmentation is mandatory.

---

## 3. Canonical Weekly Review Structure

Synthesising the above into a meta-template, every serious review covers six phases. This is the structure the Axion Weekly Review implements 1:1.

**Phase 1 — Trade-by-trade replay** (~30min)

- For each trade: entry reason, prices, stop, target, exit, P&L, R.
- Capture **emotional state** before/during/after.
- Did the trade follow the plan? If not, why?
- Tag by setup type.

**Phase 2 — Plan-adherence audit**

- Count followed vs. deviated.
- For each deviation: trigger? (boredom, revenge, overconfidence).
- Identify recurring deviation patterns.

**Phase 3 — Metrics review (segmented)**

- Overall: WR, profit factor, avg R, total R, max consecutive W/L.
- By setup, by time-of-day, by day-of-week.
- Emotional-state × outcome correlation.

**Phase 4 — Mistake categorisation**

- Every mistake listed.
- Grouped by type.
- This is the **count** that matters: is this the 1st, 5th, or 15th time?

**Phase 5 — Lessons & rules for next week**

- Single most important lesson?
- One rule to add, remove, or tweak?

**Phase 6 — Goal setting**

- One focus for next week. Not a list.

The Axion v1 implementation collapses phases 5+6 into a single "Forward" phase with three fields: `lesson`, `ruleChange`, `focusNextWeek`. Phase 5 (Risco) is the B3-specific addition described below.

---

## 4. B3-Specific Elements (the Risco phase)

Practices unique to Brazilian retail futures that the review surfaces:

1. **Risk-based thinking** — explicit flags for:
   - Trades exceeding the 1% risk-per-trade cap.
   - Days breaching the declared daily loss limit.
   - Leverage above plan.
2. **Escalada coherence** — after a winner, did you scale per system or emotionally? After a loser, did you over-size to recoup? (Classic account killer.)
3. **Asset performance** — separate edge by product. WIN edge ≠ WDO edge.
4. **Consecutive-loss streak per day** — high-leverage intraday products make a 3-loss streak more dangerous than the same streak across a week.

The v1 Risco phase implements the consecutive-loss and worst-day flags. Risk-limit breach detection requires reading from the fractal-plan tree (`monthlyPlan.overrideDailyLossR` cascade) and is in scope for v2.

---

## 5. Highest-Leverage Insights to Surface (ranked)

1. **Recurring mistake count** (Steenbarger) — show _"you repeated this mistake N times this week, M times in the last 90 days."_ Undeniable accountability is the single most behaviour-changing surface.
2. **Plan deviation %** (Douglas) — one number. Traders who deviate in >20% of trades almost never remain profitable.
3. **Time-of-day edge isolation** (Grimes) — most traders' edge lives in a single 60–90-minute window. Showing this is often a shock.
4. **Emotion × outcome heatmap** (Steenbarger) — requires emotion capture on every trade. Visceral.
5. **Setup-family edge breakdown** (Tharp) — which TAT setup actually pays you, which you keep trading from inertia.
6. **Risk-limit breach flag** (B3) — explicit.
7. **Escalada coherence** (B3) — did sizing follow the system?

---

## 6. Anti-Patterns to Avoid

| Anti-pattern                             | Source              | Mitigation                                         |
| ---------------------------------------- | ------------------- | -------------------------------------------------- |
| Stats dashboard without "what to change" | Tharp / Steenbarger | Always end with one lesson + one rule + one focus. |
| Review > 2h, becomes chore               | Tharp               | 30-minute cap.                                     |
| Done while still emotional               | Raschke             | Friday late / Saturday morning, not market-close.  |
| No segmentation, aggregate masks edge    | Grimes              | Always slice by setup × time × day.                |
| Selective logging                        | All                 | Enrichment forces completeness.                    |
| Vague lessons ("be more disciplined")    | Steenbarger         | Tie every lesson to a specific data point.         |

---

## 7. Concrete Product Implications for Axion (v1 shipped)

The deterministic 6-phase flow at `/review/weekly/[year]/[week]` implements the above. Key Axion-specific decisions:

- **No AI in v1**. The flow is fully deterministic. AI as Coach on phases 4 and 6 is filed in backlog, blocked on Phase 1.5b (Analytics Coach validator).
- **No new "emotional state" column in v1**. Capturing emotion is the literature's #1 ask, but adding columns + UI to the trade form is a separate PR. Filed in backlog.
- **Reuse the pattern detector** (`src/lib/coaching/pattern-detector.ts`) scoped to a 7-day window for the Metrics phase's pattern surfaces.
- **Mistake recurrence**: counts the mistake tag this week and across the last 90 days, side by side. This is the Steenbarger "10th repetition" insight made concrete.
- **B3 Risco phase**: consecutive-loss-in-day and worst-day flags ship in v1. Daily-stop-limit-breach detection (which needs the cascade resolver) is a v2 enhancement.
- **The forward artifact persists** in `weekly_review.{lesson, ruleChange, focusNextWeek, completedAt}` — decoupled from `weekly_plan` so the feature works even before a user has built the fractal-plan tree.

---

## Sources

- Van Tharp Institute — Tharp Think Trading Concepts.
- Brett Steenbarger — _The Daily Trading Coach_, _Trading Psychology 2.0_.
- Mark Douglas — _Trading in the Zone_, _The Disciplined Trader_.
- Adam Grimes — _The Art and Science of Technical Analysis_.
- Linda Bradford Raschke — Market Wizards interview (Schwager).
- TAT (Time de Análise Técnica) — methodology references in `/dezK-specialist`, `/tesouraria-specialist`, `/fluxo-specialist` agent specs.
- CTGain — _Gestão de Risco no Day Trade: Regra Nº 1 do Trader_.
- B3 Bora Investir — _Gerenciamento de risco no Day Trade_.
- JournalPlus — Weekly/Monthly Trade Review framework guide.
- Tradezella — 30-minute weekly framework.
