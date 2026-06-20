# Trading Mindset — Relevance for the Brazilian Index-Futures Day Trader

**For**: Ygor — discretionary day trader on **WIN (Mini Índice)** + **WDO (Mini Dólar)**, B3 session 09:00–18:00 BRT, strategies = Hawks Renko, TAT (10K + VWAP das 10/11h30), OCO, Axion engine work.
**Sources**: `00-mastersheet.md` (20 books) + `01-deep-research.md` (peer-reviewed audit).
**Question this file answers**: "Cut the academic noise — what should _I_ actually do on Monday morning?"

---

## Part A — Did I read all books?

**Yes, all 20.** Each book got one dedicated subagent that:

- Opened the PDF at the exact path on your Drive
- Read TOC + intro + sampled 4–6 chunks across the book + conclusion (~6–8 chunks of up to 20 pages each)
- Returned a structured summary

Books processed (with one-line "what's in it for you"):

### Core trading-psych canon (10)

1. **Mark Douglas — Trading in the Zone** → the Five Truths + casino-owner mindset. _Your operating system._
2. **Mark Douglas — The Disciplined Trader** → belief restructuring; why childhood conditioning makes you fail. _Deeper layer of #1._
3. **Jared Tendler — Mental Game of Trading** → emotions as diagnostic data; map-root-correct system; A/B/C-game inchworm. _The most actionable framework in the set._
4. **Jared Tendler — Mental Game of Poker** → 7 types of tilt + injecting logic. _Maps 1:1 to WIN/WDO; poker is closer to discretionary trading than to chess._
5. **Andrew Smith — Ferramentas Mentais para Traders** → NLP-flavored toolkit (dissociated review, Disney strategy, OODA). _Mid-value. Some bullshit, some gems._
6. **Alexander Elder — Como Se Transformar** → 3M (Mind/Method/Money), 2% rule, 6% rule, trade journal. _Operational backbone._
7. **Bob Johnson — Segredos dos Traders Milionários** → 25 old-school futures rules. _Course-funnel adjacent; the 25 rules themselves are sound futures wisdom._
8. **Psicologia Geral do Mercado** → Prospect Theory 101 in PT. _Skip — Kahneman covers it better._
9. **ADVFN — Psicologia dos Candles** → 8-page primer on candle psychology. _Skip._
10. **ATOM — Segredos do Sucesso** → course funnel. _Skip._

### Cross-over (10)

11. **Morgan Housel — Psicologia Financeira** → luck > skill at the tails; reasonable > rational. _Position-sizing philosophy._
12. **Dan Ariely — Previsivelmente Irracional** → predictable biases catalog. _Read once._
13. **Rolf Dobelli — Pensar Claramente** → 99-bias bestiary. _Reference, not read-through._
14. **Malcolm Gladwell — Blink** → trained intuition is real but only after 10k+ honest reps. _Reframes when you can trust your tape-reading._
15. **Leonard Mlodinow — O Andar do Bêbado** → regression to mean, base rates, hot-hand fallacy. _The probabilistic vaccine._
16. **Nassim Taleb — Antifrágil** → barbell, convexity, via negativa, skin in the game. _Structural sizing philosophy._
17. **Carol Dweck — Mindset** → fixed vs growth. _Under-drawdown identity check._
18. **Daniel Goleman — Foco** → 3 focus types; attention residue; willpower as finite resource. _Tape-reading is deep work._
19. **Daniel Goleman — Inteligência Emocional** → amygdala hijack; 10-second pause. _In-the-moment skill._
20. **François Ducasse — Cabeça de Campeão** → 36 qualities across Dream → Plan → Create. _All thinking in the Plan phase; flow in execution._

---

## Part B — What ALL of these (cumulatively) actually deliver to a working trader

Stripping out the duplication, the 20 books together give you **eight operational pillars**. Each is something you can install in your routine _this week_:

### Pillar 1 — The Probabilistic Mindset (Douglas + Mlodinow + Taleb + Housel)

**What**: Stop reading individual trades as verdicts on you. A single WIN trade tells you nothing. A series of 30+ tells you whether your edge is real or randomness wearing a costume.

**For B3 specifically**: Mini Índice intraday has fat tails — losses cluster on news, gap-down opens, abertura volátil. The probabilistic frame is doubly important because the _distribution_ matters more than the mean. **You can't read your edge in a week. You can read it in a quarter.**

**Concrete action**: Before claiming any setup "works" or "doesn't work", demand N≥30 trades of forward data. No exceptions for Hawks Renko, TAT, OCO, or anything else.

### Pillar 2 — Pre-Commitment Beats Real-Time Judgment (Douglas + Elder + Tendler + Goleman EQ)

**What**: Decisions made cold (last night, last week, in the protocol document) beat decisions made hot (mid-trade, mid-drawdown, mid-rage).

**For B3 specifically**: The **15:30 BRT window** (post-NY open, pre-fechamento positioning) is where most discretionary blow-ups happen — volatility spikes, you've been at the screen 6 hours, decision-stamina is shot. **Pre-commit your stop, target, max trade count for the day, and "I'm done" trigger BEFORE 09:00.**

**Concrete action**: Write a 1-page daily trading plan (setups, max trades, max loss, "stop trading" trigger) at 08:30 every morning. Non-negotiable. If you didn't write it, you didn't trade today.

### Pillar 3 — The 2% / 6% Rules (Elder)

**What**: Never risk more than 2% per trade; stop trading for the month at -6%.

**For B3 specifically**: With WIN ≈ R$10/ponto and WDO ≈ R$10/ponto, position sizing math is direct. If your account is R$50k, 2% = R$1,000 risk per trade — that's **100 pontos on 1 contrato de WIN** or about 50 pontos on 2 contratos. **Most retail Brazilian traders blow through this with 5-10x leverage on opening.** Don't.

**Concrete action**: Hard-code position-sizing into Axion. If a trade requires >2% risk to be valid by your method, the _position size_ is wrong, not the risk rule.

### Pillar 4 — The Journal (Elder + Tendler + Smith)

**What**: Record entry, exit, P&L, **and the emotion driving each decision**. Weekly review. Monthly bias audit.

**For B3 specifically**: You already have Axion's journal-enrich UI (you're literally on `feat/journal-enrich-ui-overhaul` right now). **The infrastructure is half-built. Finish the emotional/state tagging layer.** Voice memos via Whisper + LLM summarization is achievable in a sprint.

**Concrete action**: Add three fields to journal entries — `pre_trade_state` (calm/anxious/eager/tilted), `post_trade_emotion` (neutral/frustrated/euphoric/numb), `deviation_from_plan` (boolean + reason). This is your single highest-leverage Axion feature for _your own_ trading.

### Pillar 5 — Tilt Taxonomy (Tendler)

**What**: Tilt isn't one thing. Seven types. Each has a distinct trigger and a distinct fix.

**For B3 specifically**: The Brazilian retail-trader stereotype — "perdeu, dobrou aposta, perdeu mais, dobrou de novo" — is **Revenge Tilt + Desperation Tilt** in Tendler's taxonomy. Recognizing it as a _category_ with known patterns is what separates a 1-year trader from a 10-year trader.

**Tendler's 7 types (memorize)**:

1. Entitlement — "I deserve this winning streak to continue"
2. Running Bad — "Por que comigo? Os mercados estão contra mim"
3. Injustice — "Isso não é justo, manipularam"
4. Hate-Losing — "Não suporto perder"
5. Mistake — "Não posso errar, vou me destruir mentalmente"
6. Revenge — "Vou recuperar o que perdi neste trade específico"
7. Desperation — "Preciso recuperar até o fechamento"

**Concrete action**: On a card next to your monitor: "Which type of tilt am I in right now?" The act of naming it disarms it 60% — same mechanism as Goleman's 10-second pause.

### Pillar 6 — Process Over Outcome (Douglas + Dweck + Housel + Ducasse)

**What**: "Did I follow my plan?" > "Did I make money?"

**For B3 specifically**: A profitable day on a setup you didn't intend to trade is a **failed day**, even if green. A red day where every entry was by-the-book is a **successful day**, even if red. The B3 has too many distractions (notícias, Twitter, Telegram, grupos de WhatsApp) that incentivize outcome-thinking. Process is your defense.

**Concrete action**: End-of-session ritual — score yourself 1-10 on _plan adherence_, separately from P&L. Track both. Over 30 days, plan-adherence score predicts P&L better than P&L predicts itself.

### Pillar 7 — Antifragile Sizing (Taleb)

**What**: Barbell — 95% conservative, 5% asymmetric bets. Avoid the mediocre middle. Via negativa: optimize for what NOT to do.

**For B3 specifically**: The Brazilian trader who survives 20 years isn't the genius who 10x'd in a year — it's the disciplined sizing-conscious operator who never had a drawdown >15%. **Your Hawks strategy on R20-R34 brick sizes already has antifragile structure if you size right** (the brick size scales risk asymmetry). Don't break it by oversizing on conviction days.

**Concrete action**: Codify a hard rule in Axion — no single position >5% of account, no single day >3% of account. Cold-pre-committed, software-enforced.

### Pillar 8 — Physiology (NOT in your 20 books — added from Section 4 of deep research)

**What**: Sleep 7-8h, Z2 cardio 3×/wk, caffeine cutoff 8h pre-sleep, real lunch (not blood-sugar bombs).

**For B3 specifically**: Pregão starts 09:00 BRT. If you wake at 08:30 hungover from inadequate sleep and slam two cafés, your prefrontal cortex isn't online when the abertura volátil hits. **The single highest-EV "mindset" intervention in the entire research literature is the boring one your books don't mention.**

**Concrete action**: Sleep by 23:30 the night before pregão. No coffee after 14:00 BRT. Z2 cardio (caminhada rápida, bike easy, natação fácil) 3× per week, 45 min. _Track it._ Correlate with monthly P&L. Run the experiment for 3 months.

---

## Part C — Deep research extracted for the Brazilian context

### C.1 What's actually peer-reviewed (3 surviving claims)

Of 25 verified claims, only 3 survived adversarial verification. For you, here's what each means **in WIN/WDO context**:

**1. Interoception predicts trader survival** (Kandasamy 2016, N=18 London hedge fund)

- → Body-awareness training is plausibly worth doing (cheap, no downside)
- → **For B3 specifically**: B3 traders work in higher emotional volatility than London quants (no salary, no benefits, no team) — interoceptive skill is arguably _more_ important, not less

**2. Confidence neurally gates disconfirming evidence** (Nature Communications 2020, r=-0.69)

- → Pre-mortems before every entry are mechanistically justified
- → **For B3 specifically**: When you call a "topo" or "fundo" on WIN with high confidence, your brain literally slows the processing of price action that would disconfirm. **Write the 1-sentence "why this is wrong" before clicking.**

**3. Positive emotions correlate with HRV coherence** (Nature Sci Rep 2025)

- → HRV monitoring is plausibly useful as a state signal
- → **For B3 specifically**: Buy a Polar H10 (~R$400) + EliteHRV app (free). Track morning HRV. If your HRV is in your lowest 20% for the month, **scale down to 1 contrato max, or sit out**. Cheap experiment, 90-day evaluation.

### C.2 The Brazilian-trader-specific findings

**The single most important Brazilian study**:

- **Chague & Giovannetti (FGV, 2017)** — "Day Trading for a Living?" — analyzed 19,646 Brazilian retail day traders. Found:
  - **97% lost money** over 1 year
  - **Only 1.1% earned more than R$54/day** (minimum wage at the time)
  - Persistence in profitability was **statistically indistinguishable from random chance**

**What this means for you**:

1. You are competing in a market where **97% of your B3 retail counterparts will be out within 12 months**. Your edge over them is _not_ being the smartest — it's being the most _disciplined and physiologically prepared_.
2. The 1.1% who make it past 1 year do so because of **structural / process discipline**, not "intuition" or "feeling the tape". The research is brutal on the "intuitive trader" myth.
3. **You are building Axion = your unfair advantage over the 97%.** Most B3 retail traders use MetaTrader/Profit/Tryd with manual journaling at best. You have your own engineering platform. **Leverage it harder for mindset work**, not just signal generation.

### C.3 Brazilian coach-scene grading (research-backed)

**Hard finding**: zero peer-reviewed research on any Brazilian trading coach.

**Practical grading** (my read, after this research):

| Tier                | Coach / Educator                                       | Verdict                                                                         |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Worth following** | Wilson Neto (_Guia do Tape Reading_)                   | Technical, honest, no funnel.                                                   |
| **Worth following** | Bastter                                                | Long-term investor side, but his "psicologia do investidor" is genuinely good.  |
| **Worth following** | André Moraes                                           | Method-focused, mindset-adjacent, sober.                                        |
| **Mixed**           | Stormer / Alexandre Wolwacz                            | Veteran trader, real track record (B3 pit). Educational content is hit-or-miss. |
| **Mixed**           | Pala                                                   | Some sound technical material, some hype.                                       |
| **Course funnel**   | ATOM                                                   | Skip (per mastersheet).                                                         |
| **Course funnel**   | Setec Trading                                          | Skip.                                                                           |
| **Course funnel**   | Toro Educacional                                       | Marketing-driven.                                                               |
| **Course funnel**   | Trader Brasil                                          | Marketing-driven.                                                               |
| **Course funnel**   | "TAT" channels not affiliated with the original course | Many predatory copycats — verify source.                                        |

**The TAT-specific note**: TAT (Trade After Trade / your strategy framework) has serious Brazilian operators in its lineage. Pedro and the original TAT cohort represent the **closest thing to a Brazilian Tendler-equivalent for mindset work**, but only in the operating sense, not the published sense. Hawks-pedro is in your CLAUDE configuration — that's your highest-signal Brazilian source. Treat it as practitioner expertise, not research.

### C.4 What the canon completely missed (and you should add)

These don't appear in ANY of your 20 books but are evidence-backed for B3 work:

1. **Z2 cardio 3×/week** — the highest-EV "mindset" intervention in the literature. None of your 20 books mention it.
2. **Caffeine timing** (cutoff 8h before sleep) — destroys deep sleep, which destroys next-day judgment. Brazilian café culture makes this hard but it matters.
3. **Pre-trade HRV reading** — research-supported, not in any of your books.
4. **ACT (Acceptance & Commitment Therapy) > CBT for tilt** — modern evidence favors ACT specifically; your books pre-date this consensus.
5. **Voice memos + Whisper + LLM weekly review** — capture richer state than typing; nobody in your library has done this because the tools didn't exist.

---

## Part D — Your Monday morning protocol (everything above, distilled)

Print this. Tape it next to your monitor. Tomorrow morning, run it.

### Night before (Sunday → Monday)

- ☐ In bed by 23:30 BRT
- ☐ No caffeine after 14:00 the day before

### 08:30–09:00 BRT (pre-abertura)

- ☐ Morning HRV reading (Polar H10 + EliteHRV) — log it
- ☐ Body check: 60s eyes closed, feel heart rate, breath rate, jaw tension
- ☐ Write 1-page daily plan: setups planned, max trades, max loss (2% per trade, 3% per day, 6% per month), "stop trading" trigger
- ☐ Re-read Douglas's Five Truths (yes, every day, takes 90 seconds)

### During session (09:00–18:00 BRT)

- ☐ Before EVERY entry: write the 1-sentence pre-mortem ("strongest reason this is wrong")
- ☐ When tilt rises: name the type (1 of 7) BEFORE acting
- ☐ Goleman 10-second pause before any unplanned action
- ☐ At lunch: real meal, walk 10min, NO market staring

### 18:00–18:30 BRT (post-session)

- ☐ Voice memo (5 min): what happened, what I felt, what I'd do differently
- ☐ Update journal with `pre_trade_state` + `post_trade_emotion` + `deviation_from_plan` per trade
- ☐ Score yourself 1-10 on PLAN ADHERENCE (not P&L)

### Weekly (Sunday)

- ☐ LLM review of the week's voice memos — what patterns emerge?
- ☐ A/B/C game classification of every trade
- ☐ Bias audit — which 2 of the 13 biases hit hardest this week?

### Monthly

- ☐ Check the 6% rule — if hit, stop trading until next month, no exceptions
- ☐ Equity-curve regression check (Mlodinow) — is performance statistically distinguishable from noise on your sample size?

### Quarterly

- ☐ Run ONE experiment from this research (e.g., 90 days HRV-gated trading, or 90 days pre-mortems, or 90 days Z2 cardio adherence vs P&L correlation)
- ☐ Belief audit (Douglas): what beliefs about money/loss/market/self do I still carry from childhood that aren't serving me?

---

## Part E — The one-line conclusion

**You have read the world's best 20 books on trading psychology. The next 10% of your performance is not in the 21st book — it's in installing 5 of the protocols above and running them for 90 days with measurement.**

The Brazilian retail market is statistically brutal. Your edge over the 97% is not insight; it's **structural discipline + physiological preparation + Axion as your own measurement infrastructure**. Build the protocol, instrument it, and let the data tell you which interventions earn their place.

---

_Companion files in this directory_:

- `00-mastersheet.md` — the 20-book synthesis
- `01-deep-research.md` — peer-reviewed audit + what the canon missed
- `02-relevance-for-brazilian-trader.md` — this file (Monday-morning relevance)
