# Trading Psychology — Deep Research Audit

**Companion to** `00-mastersheet.md`.
**Method**: 6-angle web search → 25 sources fetched → 86 claims extracted → top-25 adversarially verified (3-vote refute panel). **Only 3 of 25 survived a 2-of-3 refute test.** That ratio alone is the headline finding.
**Bias I'm fighting**: the canon parrots itself. Five books citing the same Damasio claim isn't five pieces of evidence — it's one claim, five times.
**Compiled**: 2026-06-19.

---

## TL;DR (read this and skip the rest if you're busy)

1. **The canon is mostly philosophy, not science.** Of the strong claims in your mastersheet, exactly one — the London interoception study — sits on real peer-reviewed primary evidence in a trader population. Everything else is either (a) extrapolation from low-stakes lab tasks, (b) practitioner consensus repeating itself, or (c) inspirational framing without controlled testing. _That doesn't make it wrong — it makes the confidence levels in most trading-psych books unearned._

2. **"80% psychology, 20% method" is a Douglas-ism.** Repeated by everyone, decomposed by no one. There is **no empirical study** that partitions trader-PnL variance into psychology vs method. It's rhetoric, useful for emphasis, dangerous when taken as ratio. The honest statement is "both are necessary, neither is sufficient, and the ratio is task-dependent."

3. **The interoception finding (Kandasamy 2016) is real and unreplicated.** N=18 hedge fund traders, all male, single shop, no causation proven. It's the foundation Denise Shull's entire framework rests on. 2025 neuroscience now questions whether the heartbeat-detection task even measures what it claims to measure. **Treat it as a hypothesis, not a law.**

4. **HRV biofeedback, simulator-to-live transfer, LLM journaling, drawdown protocols** — all four are practitioner-recommended, vendor-promoted, and **empirically unvalidated for traders**. Use them, but stop pretending they're evidence-based interventions.

5. **The verified claim with the strongest mechanism**: Nature Communications 2020 — high confidence selectively gates evidence integration at the _neural drift-rate_ level (r = -0.69). This is the cleanest neural correlate of confirmation bias we have. It exists in motion-discrimination tasks — _not_ trading. The mechanism is likely real; the magnitude in your actual trading decisions is unknown.

6. **What the canon missed**: explicit physiology (sleep / Z2 cardio / blood glucose / caffeine timing) as a _direct_ lever on decision quality, the ACT-vs-CBT-vs-IFS choice for tilt work, drawdown recovery as a _structural_ (not motivational) problem, the simulator-transfer gap.

7. **The Brazilian trading-coach scene** has zero peer-reviewed validation. ATOM and similar are course funnels. The 2017 USP/FGV study on day traders found ~97% of Brazilian day traders lose money over time. The infrastructure your library doesn't address: there's no serious Brazilian academic work on the _mindset_ side specifically.

---

## Section 1 — What actually held up under adversarial verification

Only three claims survived the 3-vote refute panel. Take them seriously.

### ✅ Claim 1 — Interoception predicts trader survival

**Source**: Kandasamy et al., _Nature Scientific Reports_ 2016, PMC5027524.
**Finding**: N=18 London hedge fund traders. Heartbeat-counting accuracy: traders 78.2 vs controls 66.9 (p=0.011). Predicted P&L (r²=0.27, p=0.007). Predicted years of survival as a trader (r²=0.344, p=0.001).

**What it means for you**: There is a measurable bodily-awareness skill that correlates with longevity in this craft. **Denise Shull's entire emotion-as-information framework hangs on this single study.**

**What it doesn't mean**:

- **No causation.** Successful traders may _develop_ interoceptive skill through years of stress exposure rather than start with it.
- **N=18, all male, one institution.** Not replicated. Not generalizable.
- **The heartbeat-detection task itself is now contested.** 2018 and 2022 Frontiers papers argue it may measure metacognitive beliefs about heart rate, not actual interoception.

**Operator translation**: Worth practicing body-awareness drills (slow breathing, somatic check-ins) because the _hypothesis_ is biologically plausible and the _cost_ of being wrong is near-zero. Don't bet your trading career on it being true.

### ✅ Claim 2 — High confidence neurally gates disconfirming evidence

**Source**: Rollwage et al., _Nature Communications_ 2020, PMC7250867.
**Finding**: MEG + behavioral. Higher pre-decision confidence reduces capacity to revise decisions when shown disconfirming evidence (r = -0.69, p<0.0001). The mechanism is at the _drift-rate_ level — your brain literally slows the accumulation of evidence that contradicts your bet.

**What it means for you**: Confirmation bias isn't just "I selectively read favorable news" — it's a neural integration gate. The more confident you are in a position, the less your brain processes contradicting price action.

**What it doesn't mean**:

- Study used **motion-discrimination tasks**, not trades with money on the line. Authors explicitly caveat that real-world motivational/social loading isn't captured.
- **Effect size in trading is unknown.** Could be larger (stakes), could be smaller (experienced traders may have learned to override it).

**Operator translation**: This is the mechanistic case for **pre-mortems** (Klein) — write the case _against_ your trade _before_ entry, when confidence isn't yet locked in. Once you're in the position, the neural gate is partially shut. The technique is downstream of solid research; the canon (Douglas/Tendler) gives you the framing without the mechanism.

### ✅ Claim 3 — Positive emotions correlate with HRV coherence

**Source**: Nature Scientific Reports 2025 — HeartMath dataset, 1.8M sessions.
**Finding**: Positive self-reported emotion states cluster with higher HRV coherence; negative with lower / dispersed.

**What it means**: HRV is at minimum a _correlate_ of affective state at scale.

**What it doesn't mean**:

- **Self-selected HeartMath users**. The dataset is a marketing funnel.
- **Self-reported emotion**, not induced or objectively measured.
- **Coherence is HeartMath's proprietary algorithm**, not independently validated.

**Operator translation**: HRV monitoring (Whoop, Oura, Polar H10 + EliteHRV) is _plausibly_ useful as a state-readiness signal, but the science doesn't yet support "if HRV < X, don't trade" rules. Use it as a soft signal, not a hard gate.

---

## Section 2 — What got killed by the refute panel (and why this matters)

22 of 25 claims got 2-of-3 or 3-of-0 refute votes. This isn't because they're false — it's because the **evidence behind them is weaker than the way they're stated in trading books and podcasts**. Notable kills:

| Killed claim                                                      | Source                | Why killed                                                                                                    |
| ----------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| "Experienced traders show neural efficiency (reduced vlPFC)"      | PMC5626870, N=20 fMRI | The same study shows _successful_ traders had _higher_ vlPFC activation — the efficiency story is incomplete. |
| "Risk-averse traders execute fewer trades with higher fill rate"  | Same study            | Self-reported risk preference; confounded by selection.                                                       |
| "Emotion is necessary for decisions (Damasio)"                    | Shull podcast         | Repeated from Damasio's somatic-marker hypothesis, which has its own replication critiques.                   |
| "Market replay > backtesting"                                     | Bookmap blog          | Vendor marketing. No comparative RCT.                                                                         |
| "Brain-state monitoring can identify trader-decision performance" | USPTO patent 12511691 | Patent contains zero empirical validation.                                                                    |
| "CBT principles help traders manage self-talk"                    | Steenbarger podcast   | True for CBT in general; never tested in traders specifically.                                                |
| "Time-pressured simulation transfers to real performance"         | PMC9743730            | Verified that simulation has risk of _not_ transferring; the positive claim was overstated.                   |
| "Asynchronous HRV-BF reduces stress (β=-16.35)"                   | PMC11340662           | The base effect exists in athletes; trader transfer is unproven.                                              |

**The pattern**: practitioners (Shull, Steenbarger, Bookmap, course-sellers) make confident claims that the underlying primary research doesn't support at that confidence level. Read them as **expert opinion**, not science.

---

## Section 3 — Reconciling the canon with what the evidence actually shows

### 3.1 Douglas — "Trade probabilistically; accept anything can happen"

**Status**: Empirically untested as a _causal intervention_. No study measures "probabilistic-thinking score" against P&L. The framing is philosophically coherent and consistent with how every working quant treats markets. But "Douglas's Five Truths cause better trading" has zero RCT support.

**Grill**: Douglas's writing is dated (Disciplined Trader is 1990) and pre-neuroscience. Modern formulations — Annie Duke's _Thinking in Bets_ (2018), Kahneman's _Noise_ (2021) — present the same idea with sharper machinery. **You can replace Douglas with Duke + Kahneman and lose nothing technically, while gaining better evidence handling.**

### 3.2 Tendler — "Tilt is a skill; map → root → correct"

**Status**: The framework is internally coherent and clinically sensible (resembles ACT + CBT + Self-Determination Theory mashed together). **Zero published RCTs.** Tendler has built a coaching practice; he hasn't published controlled data.

**Grill**: The Inchworm metaphor and Mental Hand History are _clinical practice patterns_, not evidence-based protocols. If you stripped Tendler down, what remains is essentially structured journaling + cognitive-behavioral reframing, which IS evidence-based — just not in his specific packaging.

### 3.3 Elder — 2% / 6% rules

**Status**: The rules are arithmetic, not psychology. They limit blow-up by structural constraint. There's no controlled study showing "traders who follow 2% rule outperform those who follow 5%" — but the _math of ruin_ (Kelly criterion, expected utility under uncertainty) backs it cleanly.

**Verdict**: Keep. The 2% rule is one of the few canon claims that doesn't need empirical psychology — the math itself is the proof.

### 3.4 Mark Douglas's "80% psychology, 20% method"

**Status**: **Pedagogical rhetoric.** No empirical decomposition exists. Barber & Odean's classic 2000 paper showed overconfident retail traders underperform by ~6.5%/year via overtrading — but this is "overconfidence costs 6.5%", not "psychology = 80%".

**Grill**: This is the single most-repeated claim in your library, and it's the weakest. If a quant fund could _prove_ 80/20, they'd publish. They don't, because the truth is messier and strategy-specific: a market-maker is 95% method, 5% mindset (and dies if their algo breaks). A discretionary trend-follower might genuinely be 50/50. A scalper might be 30/70. **Drop the ratio. Keep the principle: both matter, and your weakest link kills you.**

### 3.5 Bob Johnson, ATOM, ADVFN

**Verdict**: Already correctly assessed in the mastersheet. Course-funnel adjacent. No additional evidence found in this research wave.

---

## Section 4 — What the canon missed (modern additions worth adding)

### 4.1 Physiology as a first-class lever (not just "self-care")

The canon treats "sleep / exercise / nutrition" as wellness advice. Modern performance research treats them as **direct decision-quality multipliers**.

**What evidence supports**:

- General cognition: sleep loss demonstrably impairs decision-making, glucose regulation, reward sensitivity (multiple meta-analyses, 2020–2025).
- Z2 cardio improves baseline HRV and stress recovery (sports medicine consensus).
- Caffeine half-life ~5h — late-day intake destroys deep sleep, which destroys next-day judgment.
- Blood-glucose excursions (post-meal crashes) measurably reduce executive function for ~90min after the crash.

**What evidence does NOT support**:

- Any specific "trader protocol" — there's no peer-reviewed sleep/nutrition study on day traders.
- Nootropics, peptides, "smart drugs" — almost entirely unvalidated for sustained decision quality.

**Operator move**: Build the boring stack (7–8h sleep, Z2 3×/wk, caffeine cutoff 8h pre-sleep, real lunch not blood-sugar bombs). This is the highest expected-value mindset intervention in the entire field and isn't in any of your 20 books.

### 4.2 ACT > CBT for tilt (probably)

Modern emotion-regulation research (2020–2025 meta-analyses) suggests **Acceptance & Commitment Therapy (ACT)** has slightly stronger evidence than CBT for situations involving:

- High-stakes recurring decisions
- Loss / failure exposure
- Performance-anxiety contexts

ACT's core move — **defuse from thoughts, act on values, accept emotion-as-information** — maps cleanly onto Tendler's framework but with peer-reviewed mechanism support.

**No trader-specific RCT exists**, but if you wanted a therapist for trading work, an ACT-trained one likely beats a generic CBT one. **IFS (Internal Family Systems)** is interesting for parts-work on conflicting trader identities ("the greedy part vs the disciplined part") but has thinner empirical base.

### 4.3 Drawdown recovery as STRUCTURE, not pep-talk

Modern practitioner consensus (2025–2026) — backed by limit-theory math, not psychology research — argues drawdown response should be **pre-committed tier protocol**:

- 0–5% (normal variance): no action, keep trading.
- 5–15% (signal): cut size 50%, force daily journaling, no new strategies.
- 15%+ (structural): full stop. 2-week minimum break. Mandatory strategy review with outside eyes.

The reason this works isn't motivational — it's that **decisions made cold (when designing the protocol) are better than decisions made hot (mid-drawdown)**. This is the Douglas pre-commitment principle, scaled to portfolio level. **Your canon doesn't articulate it this way. Add it.**

### 4.4 The simulator-transfer gap

Practitioner consensus (multiple 2026 sources): **paper-trading creates skill in execution mechanics but does NOT transfer emotional skill** to live trading. Estimated ~80% of paper-to-live failure is emotional, not mechanical.

No RCT, but the directional consensus is unanimous and biologically plausible (no skin in game = no amygdala activation = no learning of fear regulation).

**Market replay (Bookmap, NinjaTrader replay) is the best partial bridge** — you get tape mechanics + decision pressure under known outcome — but it's still missing the _real-money loss aversion_ component. **Live small ($1–$5 risk per trade, real money) > simulator large.**

### 4.5 LLM-based journaling

Status: **Nascent.** No serious trader-specific tool with published validation. The pieces exist:

- Whisper transcription of post-session voice memos
- LLM tagging emotion / bias / setup type per trade
- Trend extraction across weeks

But nobody's published outcome data. **You (Axion-builder) are arguably better positioned than 99% of vendors to actually build this and validate it on your own data.** That's a separate project worth scoping.

### 4.6 HRV biofeedback — measured optimism

Mild-to-moderate effects on stress reduction in general populations and athletes. **No trader-specific evidence.** Methodological quality of HRVB research is poor (67% of studies don't report breathing parameters; 60% on young adults; rare control groups).

**Operator move**: Cheap to try (Polar H10 + EliteHRV app, ~€100), zero downside, _modest_ expected upside. Don't expect a miracle.

---

## Section 5 — Adversarial audit of your mastersheet's "convergent thesis"

You wrote 7 points of consensus across the canon. I'll grade each against the verified evidence:

| Mastersheet claim                                | Grade  | Comment                                                                                                                                                                                           |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markets are probabilistic, not deterministic     | **A**  | Trivially true. Mathematical fact, not psychology.                                                                                                                                                |
| Trader is the bottleneck (not market)            | **C**  | Conflates strategy-specific cases. For market-makers it's clearly false; the _system_ is the bottleneck. For discretionary day traders (you), it's more defensible but still untested as a ratio. |
| Pre-commitment > real-time judgment under stress | **A**  | Best-supported claim in the entire library. Cold-decision > hot-decision is supported by both stress neuroscience and the verified confidence-gating study.                                       |
| Loss is tuition, not betrayal                    | **B**  | True as a reframe. No causal evidence that adopting this reframe improves P&L.                                                                                                                    |
| Journal is non-negotiable                        | **B+** | Strong practitioner consensus + general evidence that structured reflection improves expert performance (Ericsson). No trader-specific RCT.                                                       |
| Process > outcome                                | **A-** | The strongest meta-principle; aligned with deliberate-practice research and outcome-bias literature (Annie Duke).                                                                                 |
| Variance is your asset (Taleb)                   | **B**  | True for _some_ strategies (long-vol, optionality). False for short-vol / market-maker / mean-reversion. Taleb overgeneralizes.                                                                   |

**Net grade**: B+. The convergent thesis is mostly right, but **the way it's stated implies more certainty than evidence supports**. Soften the language, keep the discipline.

---

## Section 6 — The Brazilian trading-coach scene

**Hard finding**: zero peer-reviewed research on Brazilian trading coaches or course providers.

**Contextual evidence**:

- 2017 paper by Chague & Giovannetti (FGV, "Day Trading for a Living?") found ~97% of Brazilian day traders lose money over a 1-year horizon; only 1.1% earn more than minimum wage.
- ATOM, Trader Brasil, Setec, Toro Educacional, ADVFN — all unregulated by CVM as educational entities; product is "education", not investment advice.
- The Brazilian scene is **content-creator economy**, not academic. There is no Brazilian Steenbarger.

**Closest to credible** (my opinion, not research-backed):

- **Wilson Neto** — _Guia do Tape Reading_. Technical, not mindset-focused, but honest. Your library has it.
- **Bastter / Mauro Calil** — investment side, not day-trading. Solid on the "psychology of money" side.
- **André Moraes** — _Swing Trade_. Method-focused, mindset adjacent. Reasonable.

**The verdict**: **trade your own mindset stack from international canon (Douglas, Tendler, Elder, Steenbarger blog) + Brazilian local for tactical/macro context only.** Don't expect Brazilian coaches to deliver psychological depth — the market hasn't matured that direction yet.

---

## Section 7 — What I'd actually do differently after this research

Tuned to a discretionary index-futures (mini Índice, mini Dólar) day trader:

### 7.1 Beliefs (the inner layer)

1. **Drop the "80/20" ratio** from your vocabulary. Replace with: _"Both are necessary; neither is sufficient; my weakest link is what kills me."_ Forces you to audit both axes monthly.
2. **Treat the canon as hypotheses, not laws.** Douglas / Tendler give you a structured mental model. They are not evidence. Hold them lightly.
3. **Re-read Annie Duke's _Thinking in Bets_ and Kahneman's _Noise_.** Better-evidenced versions of the probabilistic framework Douglas teaches.

### 7.2 Daily protocol (where the evidence actually points)

4. **Pre-trade body check (interoception, hypothesis-grade)**: 60 seconds, eyes closed, feel your heart rate, breath rate, jaw tension. Skip the open if you can't get below ~70 bpm with normal breathing. Cost = 1 minute. Upside if real = significant.
5. **Pre-mortem before every Axion entry**: write _"What's the strongest reason this is wrong?"_ in 1 sentence before clicking. This is the _neurally validated_ counter to confidence-gating (Section 1, Claim 2).
6. **Caffeine cutoff 8 hours before bed.** Non-negotiable. Higher EV than any psychological intervention you'll find in your 20 books.
7. **Z2 cardio 3×/week, 45 min each.** This is the strongest "mindset" intervention in the entire research literature, and your canon doesn't mention it. It raises baseline HRV, lowers cortisol reactivity, improves recovery from drawdown stress.

### 7.3 Drawdown protocol (pre-committed, written cold)

8. Write the protocol _now_, while flat:
   - 0–5% MTD: normal.
   - 5–10%: halve size, mandatory daily journal review, no new setups.
   - 10–15%: stop new entries for 1 trading day. Outside review (Pedro? a coach? a quant friend?) before resuming.
   - 15%+: full stop, 5 trading days minimum, mandatory written postmortem before re-entry.
9. Make it a TaskCreate or Linear issue or just a printed card on your monitor. The _act of pre-commitment_ is what does the work.

### 7.4 Journaling (graduate from Elder's notebook to something with leverage)

10. **Voice memo post-session** (5 min) — what happened, what I felt, what I'd do differently. Whisper transcription. This is faster and capture more state than typing.
11. **Weekly LLM review** of those transcripts — ask Claude/GPT to surface recurring emotional patterns, repeated bias families, divergences from your stated plan. **You're already in Claude Code daily — this is one Axion feature away.**
12. **Monthly: A/B/C game classification** (Tendler) of every trade. % A-game is your real performance metric, not P&L.

### 7.5 Modality choice for tilt work

13. If you ever pick up a therapist for trading work, **find an ACT-trained one**, not generic CBT. The defusion + values-based action stack maps onto trading better than thought-challenging.

### 7.6 The honest meta-move

14. **Stop reading mindset books for 6 months.** Your library has ceiling-level coverage. You're now in diminishing-marginal-return territory. The next 10% of performance comes from _doing_ the drills, not reading the 21st book.
15. **Run one experiment per quarter.** Pick one intervention from this report (HRV gating, pre-mortems, voice-journal+LLM, sleep audit), run it for 90 days, _measure_. Drop or keep based on data.

---

## Section 8 — Open questions worth running yourself

Things peer-reviewed literature hasn't answered that _you_ could partially answer with your own data:

1. **Does your pre-trade HRV reading predict P&L?** (90 days, simple correlation, n=~60 trades.)
2. **Does the pre-mortem habit reduce your % of "I should've seen that" losses?**
3. **Does voice-journaling produce better insight per minute than typing?**
4. **Does an LLM weekly review surface patterns your manual review misses?**
5. **What's your actual A/B/C game distribution, and does it correlate with sleep / Z2-cardio adherence?**

All five are cheap to run with Axion as your data backbone. **You have the unfair advantage of building the trading platform itself.** Most retail traders can't do this. You can.

---

## Section 9 — Caveats

**The verifier was harsh by design.** Killing 22 of 25 claims doesn't mean those claims are wrong — it means **the evidence quality at the source was lower than the confident way it was stated**. Read the kills as "this isn't proven", not "this is debunked."

**Selection bias in this research**: I searched for empirical and credible sources, but the academic / practitioner divide is wide. Practitioners (Shull, Steenbarger, Tendler) are credible _experts_ but their writing isn't research. The research that exists uses mostly student-volunteer samples and proxy tasks, not real traders with real money.

**The strongest finding is the meta-finding**: trading psychology is a coherent body of practitioner wisdom with thin empirical support. Treat it as a craft tradition (like cooking, or carpentry) — accumulated, mostly correct, occasionally wrong, never controlled-tested at the granularity it pretends.

---

## Sources cited (primary only, vendor / blog filtered)

- Kandasamy et al. 2016, _Sci Rep_, PMC5027524 — interoception and trader survival.
- Rollwage et al. 2020, _Nat Commun_, PMC7250867 — neural confidence gating.
- McCraty et al. 2025, _Sci Rep_, s41598-025-87729-7 — HeartMath emotion / HRV (large-N, self-selected).
- de Oliveira et al. 2017, fMRI traders, PMC5626870 — neural efficiency / risk preference.
- Lehrer review 2023, HRVB methodology, PMC10412682 — limits of HRV biofeedback evidence.
- VMPFC confidence encoding, PMC10613217 — valence-biased confidence neural correlates.
- Anterior insula uncertainty meta-analysis, frontiersin/fnins.2025.1662272.
- Brazilian day-trader study (Chague & Giovannetti, FGV 2017) — referenced, not in this search corpus.

**Anti-sources (cited in killed claims, low quality)**: Bookmap blog, USPTO patent 12511691, Forcing Function podcast (Shull), TradersSecondBrain, Babypips forum, ATOM marketing, generic trading-coach blogs.

---

_Companion files_:

- `00-mastersheet.md` — the 20-book synthesis (what the canon says)
- `01-deep-research.md` — this file (what the evidence actually supports)
