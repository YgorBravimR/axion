# Hawk's Mode — Research & Integration Plan

> Methodology-specific operating mode for Axion based on Pedro Palmezani's "Hawks" trading method (Renko triple-screen on B3 mini-índice / mini-dólar futures). When activated, every relevant feature in Axion bends toward this single setup: bias rules, indicators, risk discipline, journaling prompts, analytics gates, learning content.

**Author:** Arch (Ygor Bravim's assistant)
**Date:** 2026-05-03
**Status:** Research / pre-plan
**Sources:** `/Users/ygorbravim/vault/study/hawks/` (19 files; full read), Axion codebase scan (all routes + DB schema + libs).

---

## 1. Executive Summary

Pedro's method is a **rigid, well-documented, mostly-Renko-based system** that already overlaps ~80 % of Axion's existing capabilities. The integration is therefore not a rebuild but a focused orchestration layer plus a small set of net-new primitives (Fibonacci, Elliott, weekly Renko calibration, mentor-tracked vocabulary).

The recommended shape is a **user-level "mode" toggle** that pre-selects, gates and re-skins existing surfaces:

| Surface | Hawk's Mode behavior |
|---|---|
| Active strategy (Playbook) | Locked to "Hawks — Triple Screen Renko" |
| Risk profile | Locked to "Hawks — Capital ÷ 20" decision tree |
| Daily checklist | Hawks pre-market + post-market templates |
| Trade-entry form | Hawks-specific tiered conditions (60min bias, MMA, pullback level, Fib retracement, Elliott wave, dobra/confluência, scenario #1–24) |
| Indicators surfaced | MACD (calibrated 21/89/42 + 27/117/55), 27/55 EMA, VWAP/Ajuste, Detector topos/fundos, "Cláudia" cloud |
| Analytics defaults | Filter on Hawks strategy; benchmark KPIs against Pedro's 2024 reference (PF 3.87×, WR 31.66 %, ≤3 trades/day) |
| Backtest preset | Hawks Renko preset (replaces dezK as default while in mode) |
| Coaching insights | Hawks-aware: "60 min flipped today and you bought anyway", "you took a 4th trade", "stop moved against you", etc. |
| Learning section (new) | 4-week cronograma, vocabulary glossary, video summaries, daily Pedro insights |

The mode is **opt-in** and **reversible**. Nothing is destroyed when toggled off.

---

## 2. Method Distillation (compressed)

(Source: `Hawks_Master_Playbook_Pratico.md` + concept pages.)

- **Asset:** WIN / WINFUT (mini-índice), WDO (mini-dólar). Brazilian futures.
- **Charts:** Renko on three timeframes — 5 min entry, 15 min confirmation, 60 min judge. Time-based candles never used for decisions.
- **Indicators:**
  - MACD `21/89/42` (5 min) + `27/117/55` (15/60 min). Never default `12/26/9`.
  - 27 EMA + 55 EMA on every timeframe. Two extra red EMAs on 5 min projecting the 60 min EMA zone.
  - VWAP daily + monthly + previous-day settlement ("ajuste").
  - "Hawks" indicator (proprietary): colors Renko boxes by MACD histogram sign.
  - Detector de topos e fundos (Profit Pro built-in).
  - Osc Rocks (proprietary OB/OS, optional).
- **Bias rule:** 60 min Renko alone decides COMPRADOR / VENDEDOR / LATERAL for the whole session.
- **Entry:** Onda 2 pullback to 60 min EMA zone (≈ Fib 61.8 %), confirmed by 5 min MACD aligning + Renko box closing in trend direction. **Limit order**, never market.
- **Stop (Method 3):** Initial technical stop at the prior box; move to break-even when floating gain ≈ initial risk; activate 2-box trailing only when price reaches the 76.4 % expansion zone. Stop never moves against the position.
- **Targets:** Fib expansion 76.4 % / 100 % / 161.8 % drawn on 15 min or 60 min — never 5 min. Cabeça-do-pivô as intermediate.
- **Risk:** Daily stop = capital ÷ 20 (≈ 0.5–1 %). Max 1 mini per R$ 1 000. Volatility doubles → contracts halved. Max 3 trades/day. 10 stop-days in a row → full halt + method review.
- **Mindset:** Disciplina, controle emocional, foco, autoconhecimento, aceitação do risco, saber o que se controla. "Não olha conta tendência." "Opero regra, não exceção."
- **Calibration:** Every Monday recalculate Renko R via True Range. Minimum 11 R for index. Posted in Telegram weekly.
- **Calendar:** Avoid windows around PEU (Payroll), CPI, FOMC, Selic/Copom, IPCA, IPP, Powell. Close everything by noon on FOMC days.
- **Career rules:** 6 months of personal expenses in reserve before going full-time; 3+ profitable months; first goal = current salary; only scale contracts with market-earned capital.

(Full glossary, the 24 named scenarios, the calibration formulas, the patterns frequency table, and the 4-week study cronograma are in section 12.)

---

## 3. Codebase Inventory — Where Things Already Fit

`★ Insight ─────────────────────────────────────`
The mapping below is the most important section of this document. Every Hawks rule has a "home" in the existing schema; trying to invent parallel structures would create duplication. The job is to populate, not to architect.
`─────────────────────────────────────────────────`

| Hawks concept | Existing Axion home | Action |
|---|---|---|
| Renko timeframe | `timeframes` table — `timeframeTypeEnum` includes `renko`. Backtest engine handles Renko boxes (resets `candleIndex` daily). | Seed Renko-5R, Renko-11R, Renko-23R, Renko-45R rows; mark them Hawks-tagged. |
| WIN / WDO assets | `assets` schema supports `tickSize`, `tickValueCents`, multiplier, currency. WIN/WDO referenced in OCR + symbol resolution + backtest types. | Verify rows exist with correct values (WIN: 5 pts / R$1.00; WDO: 0.5 pt / R$5.00). |
| MACD calibrated | `MACDWMAConfig` in backtest engine fully parameterizable. `indicatorDefinitions` already maps CSV headers. | Add Hawks preset `hawks-presets.ts` with 21/89/42 (5 min) + 27/117/55 (15/60 min). |
| 27/55 EMA | `MACDWMAConfig` `wmaFast/wmaSlow` is WMA; need EMA variant. | Extend backtest entry module to support EMA periods or add new `EMAAlignmentConfig`. |
| VWAP daily/monthly + ajuste | `indicatorDefinitions` already lists VWAP M/S/D from ProfitChart imports. | Map VWAP keys to Hawks "tripla confluência" detector. |
| Hawks playbook | `strategies` + `tradingConditions` + `strategyConditions` (tiered mandatory / tier_2 / tier_3) + `strategyScenarios` + `scenarioImages`. | Seed one strategy "Hawks — Triple Screen Renko" with 24 named scenarios as `strategyScenarios`. |
| Tiered conditions | Existing tier system grades trades A / AA / AAA based on conditions met. | Mandatory: 60 min bias aligned, pullback to 60 min EMA, MACD aligned 5 min, box closes in direction. Tier 2: Fib 61.8 %, dobra. Tier 3: confluência tripla, MMA fully aligned. |
| Daily stop = capital/20 | `monthlyPlans.dailyLossPercent` already exists. | Set 5 % default for Hawks Mode + lock the field while mode active. |
| Max 3 trades / day | `monthlyPlans.maxDailyTrades` exists. | Force `3` while mode active. |
| Decision-tree risk | `riskManagementProfiles.decisionTree` (full `DecisionTreeConfig`). | Seed Hawks risk profile: T1 base, no recovery, no compounding, drawdown tier auto-halt at 10 stop-days. |
| Pre/post-market workflow | Command Center has both panels + checklist + mood + circuit breaker. | Seed Hawks pre-market checklist (Renko calibration done? Calendar checked? Bias defined? Daily stop sized?) + post-market checklist (1 error + 1 right + stop respected? 3-trade max respected?). |
| Mindset/discipline tracking | `dailyAccountNotes.mood`, `dailyJournals.mentalState/emotionalState/focusGoals`, `trades.followedPlan/disciplineNotes`, coaching detectors `streakTilt`, `disciplineImpact`. | Add Hawks-specific detectors (see § 5). |
| MFE / MAE per trade | `trades.mfe/mae/mfeR/maeR` already captured. | Use directly — Pedro's "saiu cedo demais" critique becomes a real metric. |
| Calendar / events | Market Monitor has FairEconomy + BCB economic calendars + B3 trading calendar. | Add Hawks-specific event tagging (PEU, CPI, FOMC, Copom) + auto-flag trading windows. |
| Backtest engine | Full candle engine (`src/lib/backtest/`) supports Renko, MACD, WMA, multi-target, breakeven, trailing, R-multiple sizing. | Add Hawks preset (Method 3 stop logic + 76.4 %/100 %/161.8 % targets). |

**Net-new primitives required** (genuinely missing today):

1. **Fibonacci levels** as a first-class concept — retracements (38.2 / 50 / 61.8) and expansions (76.4 / 100 / 161.8).
2. **Elliott wave position** (1 / 2 / 3) tagging on trades.
3. **Weekly Renko calibration record** (R values per asset per timeframe per week).
4. **Confluência detector** (VWAP + ajuste + 60 min EMA at same price).
5. **Cláudia / MACD-cloud filter** (price inside MACD histogram zone without breakout).
6. **MMA alignment flag** (5 / 15 / 60 min all same direction).
7. **Pedro insights / vocabulary library** content surface inside the app.
8. **Mode toggle itself** + downstream gating.

---

## 4. Hawk's Mode Architecture

### 4.1 The toggle

A single boolean per user × per account: `accountModes.hawksMode = true|false`. Switching:

- Persists in DB (`accountModes` table, FK to `tradingAccounts`).
- Sets active strategy = "Hawks" (locked while on).
- Sets active risk profile = "Hawks — Capital ÷ 20" (locked).
- Sets active checklist = "Hawks pre-market" (locked).
- Adds a top-bar badge ("Hawk's Mode" with falcon glyph in `acc-100` gold).
- Re-skins KPI cards with Hawks-relevant defaults.
- Hides irrelevant chrome (e.g., generic strategies dropdown).

### 4.2 Cross-cutting effects

```
┌─────────────────────────────────────────────────┐
│              Hawk's Mode = ON                   │
└────┬────────┬────────┬────────┬──────────┬─────┘
     │        │        │        │          │
     ▼        ▼        ▼        ▼          ▼
  Playbook  Risk    Journal  Analytics  Learning
   locked  locked   prompts   benchmarks    new
            +circuit Hawks-   vs Pedro    section
            breaker  specific   2024
```

### 4.3 Reversibility

Toggle off → all hard locks release; trades, journals, checklists, settings preserved. The mode does not migrate data; it gates UI + selects defaults.

---

## 5. Feature-by-Feature Improvements & New Capabilities

For each Axion area, what changes when Hawk's Mode is ON.

### 5.1 Dashboard
**Today:** generic equity curve, KPI cards, calendar, coaching card.
**Hawk's Mode additions:**
- KPI tiles re-ordered: **Profit Factor (target ≥ 3.0×)**, **Win Rate (informational only — Pedro's 31.66 % is healthy)**, **Avg Trades / Day (max 3)**, **Daily Stop Hits This Month**, **Stop-Day Streak (alert at 5, halt at 10)**.
- New tile: **Days Since Last Renko Recalibration** (red if > 7).
- New tile: **Calls Confirmed** (links Pedro's daily insight to user's actual trade).
- Equity curve overlays Pedro's 2024 reference curve as a faint trace ("benchmark").

### 5.2 Command Center
**Today:** pre/post notes, checklist, circuit breaker, live status, asset rules, market monitor.
**Hawk's Mode additions:**
- Pre-market panel becomes a **5-question viés checklist** (MACD histogram, EMA position, topos/fundos, Cláudia, calendar). User must mark COMPRADOR / VENDEDOR / LATERAL for the day before any trade can be logged.
- Calendar panel auto-flags PEU / CPI / FOMC / Copom / Selic windows in red ("no-trade zone — close 15 min before, wait 30 min after").
- Circuit breaker enforces **max 3 trades/day** in addition to monetary limits.
- Live Status surfaces "Stop never moved against rule" — if any logged trade has stop modified away from entry, banner shows.
- New widget: **Renko calibration card** — current R values for WIN/WDO 5 / 15 / 60 min + button "Recalibrate now (Monday)" with True Range helper.

### 5.3 Journal / Trade Entry
**Today:** rich form, conditions tiers via active strategy, MFE/MAE, scaled execution, screenshots.
**Hawk's Mode additions:**
- Required dropdown **"Cenário Hawks"** (1–24 from playbook).
- Required radios **60 min bias at entry** (COMPRADOR / VENDEDOR / LATERAL). If mismatch with logged direction → form warns: "minha religião não permite".
- Required field **Elliott wave** (1 / 2 / 3 / N/A).
- Required **Pullback level** (38.2 / 50 / 61.8 / EMA-only / N/A).
- Optional **Confluência** multi-checkbox (VWAP / ajuste / EMA 60 min / dobra).
- Optional **MMA alignment** (yes / no / partial).
- Stop-management auditor: each stop change is timestamped; if direction = "moved against" → trade flagged "rule violation" automatically. Dashboard surfaces these.
- Auto-compute Hawks setup rank: A (mandatory met), AA (+ tier 2), AAA (confluência tripla + full MMA).

### 5.4 Playbook
**Today:** strategies + conditions + scenarios + compliance dashboard.
**Hawk's Mode additions:**
- Seeded **"Hawks — Triple Screen Renko"** strategy with full description + entry / exit / risk criteria from `Hawks_Master_Playbook_Pratico.md`.
- Conditions seeded at three tiers (mandatory / tier_2 / tier_3) per § 3 mapping.
- 24 scenarios seeded as `strategyScenarios`, each with placeholder image slot ready for user to paste their own setup screenshots.
- New tab "Decision Matrix" rendering the IF→THEN table from § D of the synthesis.
- New tab "Vocabulary" rendering the glossary (Cláudia, MMA, dobra, conta tendência, etc.) — searchable.

### 5.5 Analytics
**Today:** rich metrics, presets, account comparison.
**Hawk's Mode additions:**
- Default filter: strategy = Hawks.
- Benchmark column on every chart: Pedro 2024 reference (PF 3.87×, WR 31.66 %, zeros 37 %, payoff ratio).
- New metric **Stop Discipline Score** = % of trades where stop never moved against position.
- New metric **3-Trade-Cap Adherence** = % of days with ≤ 3 trades.
- New metric **MFE Capture Ratio** = realized R / max favorable R per trade. "Saiu cedo demais" alarm at < 50 %.
- New view **Per-Scenario Performance** (1–24 scenarios) — lets user discover which scenarios they execute well and which they should avoid.

### 5.6 Monte Carlo / Risk Simulation
**Today:** R-multiple MC v1+v2, simple/advanced risk simulation, equity shield.
**Hawk's Mode additions:**
- Pre-filled **Hawks parameters preset**: WR 31 %, payoff 3.87×, 60 trades / month, daily stop = capital / 20.
- "What if I had only taken AAA-rank trades?" preset — re-runs MC on filtered subset.
- Equity Shield default: 5 stop-days in a row = pause; 10 = halt (Pedro's regra dos 10 dias).

### 5.7 Backtest
**Today:** ORB + dezK (MACD + WMA) on candle CSV, optimizer, R-multiple sizing.
**Hawk's Mode additions:**
- New **Hawks preset** `src/lib/backtest/presets/hawks-presets.ts`:
  - MACD `21/89/42` on 5 min entries.
  - EMA `27/55` confirmation.
  - Method 3 stop logic (technical → BE at 1× risk → trailing 2-box at 76.4 % zone).
  - Targets at Fib 76.4 / 100 / 161.8.
  - Operating window 09:00–13:00 BRT (closes earlier on FOMC days).
- Renko candle import support is already present — verify Renko-R datasets can be ingested cleanly.

### 5.8 Monthly Plan
**Today:** balance, percent limits, decision-tree builder.
**Hawk's Mode additions:**
- Locks `dailyLossPercent = 5 %`, `maxDailyTrades = 3`, `maxConsecutiveLosses` mapped to Pedro's stop-day cascade.
- Adds field **"Capital growth from market only"** (boolean rule) — when on, contracts increment only after market-earned profit covers the next-tier risk.

### 5.9 Settings
**Today:** profile, accounts, assets, timeframes, tags, conditions, indicators, users, risk profiles.
**Hawk's Mode additions:**
- New top-level setting **Mode** with toggle.
- Renko timeframe rows seeded for WIN/WDO at 5 / 15 / 60 min sizes.
- Asset rows seeded if missing.
- Indicator definitions seeded for Hawks indicator + Cláudia + Detector topos/fundos.

### 5.10 Reports
**Today:** weekly + monthly + mistake cost + commission impact.
**Hawk's Mode additions:**
- Weekly report appends a **Renko calibration log** (R values used that week).
- Monthly report compares user PF to Pedro 2024 PF 3.87× and shows gap.
- Mistake cost tags Hawks-specific violations (stop moved against / >3 trades / contra tendência without MMA / entered on breakout / partial exit).

### 5.11 AI Coaching Insights
**Today:** 10 statistical detectors + LLM prompt builder.
**Hawk's Mode additions** (new detectors):
- `hawks.biasMismatch` — % of trades where direction contradicts 60 min bias.
- `hawks.stopMoved` — count of stop-moved-against events this period.
- `hawks.overTrade` — days with > 3 trades.
- `hawks.brokenCalendar` — trades during PEU / FOMC restricted windows.
- `hawks.partialExit` — partial exits taken (Pedro: "parcial é massagem de ego").
- `hawks.lowMfeCapture` — MFE capture ratio < 50 % (saiu cedo demais).
- `hawks.contraSemMma` — contratendência without full MMA.
- `hawks.weekendCalibrationMissed` — Monday came and went without recalibration.
- `hawks.streakTen` — 10 stop-days in a row → halt advisory.

### 5.12 Calendar / Events (new surface)
**Today:** Market Monitor has read-only economic calendar.
**Hawk's Mode additions:**
- Dedicated **"Calendário Hawks"** view with Pedro's protocol per event type (PEU, CPI, FOMC, Copom, Selic, IPCA, IPP, Powell speech, Petax day, payroll-on-BR-holiday).
- Each event row links to: protocol text + last-3-times outcome + auto-applied trading window restrictions.

### 5.13 Learning section (entirely new)
- **4-Week Cronograma** — guided study path from `cronograma-4-semanas.md` rendered as week-by-week checklist with completion tracking.
- **Conceitos** — 11 concept pages rendered (Renko, MACD, Fibonacci, Elliott, Alvos, Stop, Análise Técnica Clássica, Risk, Mindset, Sistema Operacional, Transição de Carreira).
- **Glossário** — full vocabulary from `_vocabulary.md` with first-mention dates.
- **Diário do Mentor** — 120 daily Pedro insights from `pedro-insights/` with cross-link to user's own trades on the same date ("o que Pedro disse hoje vs o que eu fiz").
- **Vídeos** — 11 video summaries from `videos/`.
- **Padrões** — `_patterns.md` rendered with live tally counts pulled from user's own trade tagging (so user sees how often *they* used each pattern vs. how often Pedro mentioned it).

### 5.14 Mentorship integration
Axion already serves "trading mentorship students" as a known persona (per `CLAUDE.md` design context). Hawk's Mode is the first concrete mentorship integration:
- Mentor (Pedro) can post a daily insight that lands in every Hawk's Mode user's dashboard.
- Student trades automatically link to that day's insight for review.
- Anonymized cohort metrics (opt-in) let students see whether their PF / WR / stop-discipline tracks the cohort median.

---

## 6. Data Model Changes

Minimal additions on top of existing schema:

```
accountModes (
  id, accountId FK, mode enum('hawks','default'),
  activatedAt, deactivatedAt, locks JSONB
)

hawksRenkoCalibrations (
  id, userId, accountId, weekStart date,
  asset varchar, timeframe varchar, rValue int,
  source enum('telegram','user_calc','auto'), notes
)

hawksDailyBias (
  id, accountId, dateUtc, asset,
  bias enum('comprador','vendedor','lateral'),
  checklist JSONB (5 questions answered)
)

hawksStopAudit (
  id, tradeId FK, changedAt, oldStop, newStop,
  direction enum('toward_be','away'), violation boolean
)

hawksScenarioOnTrade (
  id, tradeId FK, scenarioCode int(1-24),
  elliottWave enum('1','2','3','na'),
  pullbackLevel enum('38.2','50','61.8','ema','na'),
  confluencia varchar[], mmaAligned enum('yes','no','partial')
)

hawksMentorInsights (
  id, dateUtc, asset, biasCalled,
  setupCalled text, outcome enum('confirmed','pending','missed'),
  raw markdown,
  sourcePath varchar
)

hawksLearningProgress (
  id, userId, sectionKey, completedAt, notes
)
```

`★ Insight ─────────────────────────────────────`
None of the existing tables are altered destructively — every Hawks concept either lives in a new sidecar table or piggybacks on existing JSONB fields (`riskManagementProfiles.decisionTree`, `dailyAccountNotes`, `dailyChecklists.items`). Reversibility is therefore cheap.
`─────────────────────────────────────────────────`

---

## 7. The 24 Scenarios (full enumeration for seeding)

| # | Name | Trigger / Rule (short) |
|---|---|---|
| 1 | Gap abertura favorável | aguardar onda 2 ao 15 min EMA; sem pullback = sem trade |
| 2 | Gap abertura contra | aguardar resolução; nunca chase |
| 3 | Confluência tripla | VWAP + ajuste + 60 min EMA no mesmo preço |
| 4 | Dobra | 2 gatilhos no mesmo preço |
| 5 | Bandeira | canal de correção em tendência → continuação |
| 6 | Triângulo asc/desc | rompe na direção do fluxo |
| 7 | Triângulo simétrico em tendência | mesma regra; reme no sentido do rio |
| 8 | OCO invertido | rompe pescoço; alvo = altura da cabeça |
| 9 | OCO clássico | espelho do #8 para baixo |
| 10 | Fundo / Topo duplo | só válido após romper pivô intermediário |
| 11 | Lateralidade definida | 2+2 toques nos extremos; sem expansão Fib |
| 12 | Deriva | sem trade até romper LTA |
| 13 | Suporte rompido vira resistência | pullback ao antigo suporte = SELL |
| 14 | Resistência rompida vira suporte | espelho do #13 = BUY |
| 15 | Cláudia sem rompimento | filtro absoluto = sem trade |
| 16 | Divergência MACD nos fundos | alerta, não reversão |
| 17 | Sobrecompra/sobrevenda dupla | fica fora mesmo com gap |
| 18 | Tendência autista | não esperar pullback que não vem |
| 19 | Mercado esticado / vol alta | metade dos cliques |
| 20 | Lateral após tendência | reduzir frequência |
| 21 | Choque político off-calendar | flat |
| 22 | Troca de contrato dólar (Petax) | reduzir / evitar WDO |
| 23 | Payroll em feriado BR | tratar segunda como payroll |
| 24 | Última hora antes de FOMC | liquidar até meio-dia |

---

## 8. Phased Rollout

### Phase 1 — Mode skeleton + seeded content (≈ 1 sprint)
- `accountModes` table + toggle UI in Settings.
- Seed Hawks strategy + conditions + scenarios + risk profile + checklist + Renko timeframes + WIN/WDO assets.
- Dashboard top-bar badge.
- Lock-in behavior on toggle.

### Phase 2 — Trade-entry & viés ritual (≈ 1 sprint)
- New journal fields (cenário, wave, pullback, confluência, MMA).
- Pre-market 5-question viés checklist enforcing daily bias before any trade.
- Stop-audit hook: any stop modification logged to `hawksStopAudit` and flagged if "away".
- Circuit breaker max-3-trades enforcement.

### Phase 3 — Calibration + calendar (≈ 1 sprint)
- Renko calibration card + helper True-Range calculator.
- Hawks calendar view with PEU / FOMC / Copom protocols + automatic no-trade window flags.
- Reports add weekly Renko log.

### Phase 4 — Analytics + coaching detectors (≈ 1 sprint)
- Hawks-specific KPI tiles + benchmark overlays.
- Per-scenario performance view.
- Stop discipline / 3-trade-cap / MFE-capture metrics.
- 9 new coaching detectors.

### Phase 5 — Backtest + Monte Carlo presets (≈ 1 sprint)
- Hawks backtest preset with Method 3 stop logic + Fib expansion targets.
- MC + Equity Shield Hawks presets (5/10 stop-day cascade).

### Phase 6 — Learning section (≈ 1 sprint)
- 4-week cronograma module.
- Concept pages, glossary, video summaries, daily mentor insights, patterns tally.
- Cross-links between mentor insights and user trades on the same date.

### Phase 7 — Mentorship integration (optional)
- Mentor (Pedro) authored insights surface.
- Anonymized cohort comparisons.

---

## 9. Risks & Open Questions

1. **Proprietary indicators.** "Hawks" indicator and Osc Rocks are Pedro's; Axion can't redistribute them. Either (a) approximate with public formulas (MACD-histogram-color → green/red box overlay is trivially replicable), (b) integrate via ProfitChart CSV import (already supported), or (c) leave the slot open and document.
2. **Real-time Renko data.** Axion ingests CSV historical candles; for live-day usage Pedro's traders are inside Profit Pro. A Profit DLL bridge (`docs/profitDLL-research.md` exists) might be the path for live integration but is out of scope for v1 of Hawk's Mode.
3. **Pedro's daily insights pipeline.** `pedro-insights/<DATE>.md` files are local to Ygor's vault. Surfacing them in Axion needs either: a sync job (vault → Axion DB), a manual mentor admin UI, or a public feed if Pedro consents.
4. **Locale.** All Hawks content is pt-BR — needs translation gates (or accept pt-BR-only mode as MVP since core audience is Brazilian).
5. **Lock vs. soft default.** How aggressively should Hawk's Mode lock fields (e.g., dailyLossPercent)? Recommendation: hard-lock the rules that are constitutive (5 % daily stop, max 3 trades, stop-can-only-move-toward-BE); soft-default everything else with an explicit override + warning.
6. **Mentorship scope creep.** Hawk's Mode is the first methodology mode. The architecture should not foreclose adding "TAT Mode" / "dezK Mode" / "Bravo Mode" later — that is partly why the mode lives in `accountModes` as an enum, not as a hard-coded boolean.

---

## 10. Success Criteria

After Hawk's Mode v1 ships, a Hawks-following trader should be able to:

1. Toggle Hawk's Mode in one click.
2. Complete the 5-question viés ritual every morning in < 60 s.
3. Log a trade with full Hawks tagging in < 30 s.
4. See profit factor benchmarked against 3.87× and stop discipline against 100 %.
5. Get coached automatically when they break a rule (bias mismatch, > 3 trades, stop moved away, low MFE capture).
6. Backtest the Hawks preset on imported Renko CSV without writing config.
7. Read the 4-week cronograma + concept pages + daily mentor insights inside Axion, without leaving for the vault.

A non-Hawks trader should be entirely unaffected.

---

## 11. Appendix — File Map of Sources

```
/Users/ygorbravim/vault/study/hawks/
├── Hawks_Master_Playbook_Pratico.md          (primary)
├── Hawks_Manual_Decisao.md                   (pocket guide)
├── Base_Conhecimento_Trading_Palmezani.md    (audit trail)
├── concepts/
│   ├── renko.md
│   ├── MACD.md
│   ├── Fibonacci Retracement.md
│   ├── Ondas de Elliott.md
│   ├── Alvos Operacionais.md
│   ├── Condução de Stop.md
│   ├── Análise Técnica Clássica.md
│   ├── Gerenciamento de Risco.md
│   ├── Mindset do Trader.md
│   ├── Sistema Operacional Hawks — Mini Índice Futuro.md
│   └── Transição de Carreira para Trading.md
├── pedro-insights/
│   ├── _patterns.md            (frequency tally)
│   ├── _vocabulary.md          (glossary)
│   └── <YYYY-MM-DD>.md         (120 files; 2025-08-29 → 2026-04-30)
├── videos/                     (11 summaries)
├── analyses/
└── cronograma-4-semanas.md
```

```
/Users/ygorbravim/.superset/worktrees/axion/brief-blackberry/src/
├── app/[locale]/(app)/
│   ├── command-center/         → § 5.2
│   ├── journal/                → § 5.3
│   ├── playbook/               → § 5.4
│   ├── analytics/              → § 5.5
│   ├── monte-carlo/            → § 5.6
│   ├── risk-simulation/        → § 5.6
│   ├── equity-shield/          → § 5.6
│   ├── backtest/               → § 5.7
│   ├── monthly-plan/           → § 5.8
│   ├── settings/               → § 5.9
│   ├── reports/                → § 5.10
│   └── (root dashboard)        → § 5.1
├── components/                 (mirrors above)
├── db/schema/                  → § 6 (additions)
└── lib/
    ├── backtest/               → § 5.7 (Hawks preset goes here)
    ├── coaching/               → § 5.11 (new detectors)
    ├── monte-carlo*.ts         → § 5.6
    └── risk-simulation*.ts     → § 5.6
```

---

## 12. Seed Manifest — Every Existing Axion Taxonomy Populated

`★ Insight ─────────────────────────────────────`
Every Axion table that holds user-/admin-curated data needs a Hawks seed row set. This section is exhaustive — if a taxonomy exists in `src/db/schema.ts`, it's listed below with the exact Hawks values to insert. Run this as a single `db/seeds/hawks-seed.ts` migration that's idempotent (`onConflictDoNothing`).
`─────────────────────────────────────────────────`

### 12.1 `assets` (+ `assetTypes`)
| Symbol | Name | Type | tickSize | tickValueCents | Currency | Multiplier |
|---|---|---|---|---|---|---|
| WIN | Mini Índice Bovespa Futuro | future | 5 | 100 | BRL | 0.20 |
| WDO | Mini Dólar Futuro | future | 0.5 | 500 | BRL | 10 |
| IND | Índice Bovespa Cheio | future | 5 | 500 | BRL | 1 |
| DOL | Dólar Cheio | future | 0.5 | 5000 | BRL | 50 |

Asset-type seeds: `future` row if not present.

### 12.2 `timeframes`
Renko-first; time-based kept for context only.

| Type | Value | Unit | Display | Hawks-tagged |
|---|---|---|---|---|
| renko | 5 | points | "Renko 5R" | yes |
| renko | 11 | points | "Renko 11R (mín. índice)" | yes |
| renko | 13 | points | "Renko 13R" | yes |
| renko | 23 | points | "Renko 23R (15 min)" | yes |
| renko | 45 | points | "Renko 45R (60 min)" | yes |
| renko | 88 | points | "Renko 88R (vol alta)" | yes |
| renko | 123 | points | "Renko 123R (peak vola)" | yes |
| time_based | 5 | minutes | "5 min" | context |
| time_based | 15 | minutes | "15 min" | context |
| time_based | 60 | minutes | "60 min (juiz)" | context |
| time_based | 1 | days | "Diário" | context |

### 12.3 `accountTimeframes`
Auto-link all Hawks-tagged timeframes when mode toggles on for the active account.

### 12.4 `tags` (3 types: setup / mistake / general)

**Setup tags** (color `acc-100` gold):
- `hawks-confluencia-tripla`
- `hawks-dobra`
- `hawks-pullback-618`
- `hawks-pullback-50`
- `hawks-pullback-382`
- `hawks-onda-3`
- `hawks-onda-2-entry`
- `hawks-tendencia-autista`
- `hawks-bandeira`
- `hawks-triangulo`
- `hawks-oco`
- `hawks-oco-invertido`
- `hawks-fundo-duplo`
- `hawks-topo-duplo`
- `hawks-suporte-virou-resistencia`
- `hawks-resistencia-virou-suporte`
- `hawks-deriva-rompida`
- `hawks-cabeça-pivô`

**Mistake tags** (color `var-loss` violet-blue):
- `hawks-stop-mexido-contra` (cardinal sin)
- `hawks-rompimento-em-vez-pullback`
- `hawks-mais-de-3-trades`
- `hawks-conta-tendência`
- `hawks-claudia-sem-rompimento`
- `hawks-bias-mismatch`
- `hawks-ct-sem-mma`
- `hawks-parcial-massagem-ego`
- `hawks-payroll-fomc-window`
- `hawks-bomboganzar`
- `hawks-tarde-demais` (after 13h00 BRT)
- `hawks-duas-sobrecompras`
- `hawks-ordem-mercado` (não bate a mercado)
- `hawks-preço-médio` (averaged down)
- `hawks-saiu-cedo` (low MFE capture)

**General tags** (color `acc-200` blue):
- `hawks-comprador-dia`
- `hawks-vendedor-dia`
- `hawks-lateral-dia`
- `hawks-reset-mês`
- `hawks-recalibração-segunda`
- `hawks-super-quarta`
- `hawks-payroll-day`
- `hawks-copom-day`
- `hawks-petax-day`

### 12.5 `tradingConditions` (categories: indicator / price_action / market_context / custom)

**Indicator** (`indicator`):
- `60min-macd-bullish` — histograma MACD > 0 no 60 min
- `60min-macd-bearish`
- `5min-macd-aligned-with-60min`
- `15min-macd-aligned-with-60min`
- `price-above-27-55-ema-60min`
- `price-below-27-55-ema-60min`
- `vwap-daily-aligned`
- `ajuste-aligned`
- `osc-rocks-overbought`
- `osc-rocks-oversold`
- `claudia-broken` (price expanded beyond MACD cloud)

**Price action** (`price_action`):
- `topos-fundos-ascending`
- `topos-fundos-descending`
- `pullback-to-618-fib`
- `pullback-to-50-fib`
- `pullback-to-382-fib`
- `pullback-to-60min-ema-band`
- `box-closed-in-trend-direction`
- `elliott-wave-2-confirmed`
- `cabeça-pivô-broken`
- `confluência-tripla-detected` (VWAP + ajuste + EMA)
- `dobra-detected` (2 zones at same price)

**Market context** (`market_context`):
- `mma-fully-aligned-5-15-60`
- `volatility-doubled-this-week`
- `daily-stop-not-hit`
- `under-3-trades-today`
- `outside-event-window` (no PEU/CPI/FOMC nearby)
- `inside-09-13-brt-window`
- `not-deriva`

**Custom** (`custom`):
- `mentor-call-aligned-today` (Pedro called this direction this morning)
- `weekly-renko-current` (calibrated this Monday)

### 12.6 `strategies` + `strategyConditions` (tiered)

**Strategy:** `Hawks — Triple Screen Renko`
- `code`: `HAWKS`
- `targetRMultiple`: 3.0
- `maxRiskPercent`: 1.0
- `description`: pulled from `Hawks_Master_Playbook_Pratico.md` § 1
- `entryCriteria`: 60 min bias defined → onda 2 pullback to EMA zone → MACD aligned → box closes in trend → limit order
- `exitCriteria`: Method 3 — BE at 1× risk → 2-box trailing at 76.4 % zone → exit at trailing/MACD cross/pivot
- `riskRules`: Capital ÷ 20, max 3 trades/day, stop never moves against, no partials

**Tier mapping:**

| Tier | Conditions |
|---|---|
| **mandatory** | `60min-macd-bullish` OR `60min-macd-bearish`, `price-above-or-below-ema-60min`, `topos-fundos-direction`, `pullback-to-60min-ema-band` OR `pullback-to-618-fib`, `box-closed-in-trend-direction`, `5min-macd-aligned-with-60min`, `outside-event-window`, `inside-09-13-brt-window`, `not-deriva`, `daily-stop-not-hit`, `under-3-trades-today`, `weekly-renko-current` |
| **tier_2** | `pullback-to-618-fib`, `dobra-detected`, `15min-macd-aligned-with-60min`, `cabeça-pivô-broken`, `mentor-call-aligned-today` |
| **tier_3** | `confluência-tripla-detected`, `mma-fully-aligned-5-15-60`, `elliott-wave-2-confirmed`, `osc-rocks-aligned-with-direction` |

Resulting setupRank: A (mandatory only) → AA (+ tier 2) → AAA (full).

### 12.7 `strategyScenarios` + `scenarioImages`
Seed all 24 scenarios from § 7 as scenario rows linked to the Hawks strategy, each with a description and three empty `scenarioImages` slots ordered 1/2/3, ready for the user to upload their own setup screenshots from Profit Pro.

### 12.8 `riskManagementProfiles`
**Profile:** `Hawks — Capital ÷ 20`
- `dailyLossPercent`: 5
- `weeklyLossPercent`: 15
- `monthlyLossPercent`: 25
- `maxDailyTrades`: 3
- `maxConsecutiveLosses`: 5 (warning) / 10 (halt)
- `decisionTree` (JSONB):
  ```
  {
    "phase": "base",
    "t1": { "riskMode": "fixed_pct", "value": 1.0 },
    "recovery": { "enabled": false, "reason": "Pedro: regra é regra; sem martingale" },
    "gainMode": { "type": "compoundingDisabled" },
    "operatingHours": { "start": "09:00", "end": "13:00", "tz": "America/Sao_Paulo" },
    "fomcWindow": { "closeBy": "12:00" },
    "drawdownTiers": [
      { "consecutiveStopDays": 5, "action": "warn" },
      { "consecutiveStopDays": 10, "action": "halt", "reasonKey": "regra-dos-10-dias" }
    ],
    "minStopPoints": 11,
    "maxContractsPerR1000": 1,
    "stopMovementPolicy": "toward-be-only"
  }
  ```

### 12.9 `monthlyPlans`
Seeded template (locked while Hawk's Mode on):
- `riskPerTradePercent`: 1.0
- `dailyLossPercent`: 5.0
- `weeklyLossPercent`: 15.0
- `monthlyLossPercent`: 25.0
- `dailyProfitTargetPercent`: 6.0 (wisely "encerrar quando satisfeito")
- `maxDailyTrades`: 3
- `maxConsecutiveLosses`: 5
- `allowSecondOpAfterLoss`: false
- `reduceRiskAfterLoss`: false
- `increaseRiskAfterWin`: false
- `capRiskAfterWin`: true
- `profitReinvestmentPercent`: 0 (Pedro: contracts only grow with market money via separate rule)

### 12.10 `dailyChecklists` + checklist items

**"Hawks Pre-Market"** (auto-applied each session start):
1. Renko calibrado para a semana? (WIN + WDO em 5/15/60 min)
2. MACD `21/89/42` (5 min) e `27/117/55` (15/60 min) confirmados nos templates?
3. Calendário verificado: PEU / CPI / FOMC / Copom / Selic / IPCA / Powell hoje?
4. Viés do 60 min definido (COMPRADOR / VENDEDOR / LATERAL) com 5 perguntas respondidas?
5. Stop diário dimensionado (capital ÷ 20)?
6. Lote dimensionado (1 mini por R$ 1000)? Vola dobrou → contratos pela metade?
7. Mente: posso aceitar a perda total antes da entrada?

**"Hawks Post-Market"** (end of session):
1. Quantas operações? (≤ 3)
2. Wins / zeros / losses?
3. Stop diário batido? Plataforma fechada?
4. Stop foi movido contra em alguma trade?
5. Algum parcial tomado?
6. Algum trade fora da janela 09:00–13:00?
7. Um erro do dia + um acerto do dia (1 linha cada).
8. Cláudia / divergência / deriva observadas?

**"Hawks Monday Recalibration"** (only on Mondays):
1. True Range (período 10) lido no 15 min?
2. R índice = ATR ÷ 5? R dólar = ATR ÷ 0.5?
3. R atual ≥ 11 (mínimo índice)?
4. Vola dobrou vs. semana anterior? Ajustar contratos.
5. Renko da Semana do Telegram conferido?

### 12.11 `dailyAssetSettings` + `accountAssetSettings`
Per-asset Hawks defaults:
- WIN: bias = (set daily), max daily trades = 3, max position size = `floor(capital / 1000)`
- WDO: same logic, sized to mini-dólar (1 contract per R$ 1 000 × 5 multiplier rule per Pedro)

### 12.12 `indicatorGroups` + `indicatorDefinitions`
Map ProfitChart CSV column headers → Hawks-relevant JSONB keys.

**Group:** `Hawks Core`
| CSV header pattern | Internal key | Display |
|---|---|---|
| `MACD-21-89-42-Hist` | `macd_hist_5m` | MACD Histograma 5 min |
| `MACD-27-117-55-Hist` | `macd_hist_60m` | MACD Histograma 60 min |
| `EMA-27` | `ema_27` | EMA 27 |
| `EMA-55` | `ema_55` | EMA 55 |
| `EMA-27-60min-projection` | `ema_27_60m_proj` | EMA 27 (60 min projetada) |
| `EMA-55-60min-projection` | `ema_55_60m_proj` | EMA 55 (60 min projetada) |
| `VWAP-D` | `vwap_daily` | VWAP Diária |
| `VWAP-M` | `vwap_monthly` | VWAP Mensal |
| `Ajuste` | `settlement_prev` | Ajuste (D-1) |
| `TopoFundo` | `pivot_marker` | Detector Topos/Fundos |
| `Hawks-Color` | `hawks_box_color` | Hawks (cor da box) |

### 12.13 `filterPresets`
Seed analytics presets:
- "Hawks AAA only" — strategy=Hawks, setupRank=AAA
- "Hawks Mandatory only" — setupRank=A
- "Hawks Buys" — strategy=Hawks, direction=long
- "Hawks Sells" — strategy=Hawks, direction=short
- "Hawks Mistake Days" — has any mistake tag prefixed `hawks-`
- "Hawks Stop-Discipline Violations" — has tag `hawks-stop-mexido-contra`
- "Hawks Within 3-Trade Cap" — daily trade count ≤ 3
- "Hawks Out of Window" — entry time outside 09:00–13:00 BRT

### 12.14 Backtest presets (`src/lib/backtest/presets/hawks-presets.ts`)
| Preset | Description |
|---|---|
| `hawks-buy-renko-45R` | 60 min bullish bias, MACD 21/89/42 5 min entry, 27/55 EMA, Method 3 stop, Fib 76.4/100/161.8 targets |
| `hawks-sell-renko-45R` | mirror for shorts |
| `hawks-vol-high-renko-88R` | high-volatility week (R doubled) |
| `hawks-conservative-method-1` | 2-box trailing only (beginner mode) |

### 12.15 Monte Carlo presets
- `hawks-pedro-2024` — WR 31.66 %, payoff 3.87×, 60 trades/month, daily stop = capital ÷ 20
- `hawks-aaa-only` — sub-sample AAA setupRank from user trades
- `hawks-cohort-median` — anonymized cohort baseline (post-launch)

### 12.16 Risk simulation presets
Pre-fill for the Advanced simulator with the `decisionTree` from § 12.8.

### 12.17 `dailyAccountNotes` mood + journal prompts
When Hawk's Mode on, journal prompts replaced with Pedro-flavored questions:
- preMarketNotes prompt: "Qual viés? Como vou reagir se o 60 min flipar?"
- postMarketNotes prompt: "Operei a regra ou a exceção? O que faria diferente?"
- mood selector unchanged (great/good/neutral/bad/terrible) but each tied to behavioral coaching detector.

### 12.18 `dailyJournals` (`mentalState`, `emotionalState`, `focusGoals`)
- `focusGoals` seeded daily with: "Operar a regra. Stop nunca contra. Máximo 3 trades."
- mentalState/emotionalState integers map to a 5-point scale rendered as Pedro's 6 mindset traits (rotated daily).

### 12.19 `userSettings` / `settings`
- New global setting key: `hawks.lastWeeklyCalibration` (date)
- New per-user pref: `hawks.preferLanguage` = `pt-BR` (since all Hawks content is pt-BR initially)
- New per-user pref: `hawks.mentorFeedEnabled` (boolean — pull Pedro's daily insights)

### 12.20 `bugReports`
No seed needed — but Hawks-specific issue templates (e.g., "Renko calibration card shows wrong R") added to bug-report dropdown.

### 12.21 `priceCandles` + `priceDataVersions`
- Provide a starter Renko CSV import for WIN at 45R covering at least the trailing 60 trading days, so backtest preset works out of the box for new Hawks users without requiring them to source ProfitChart data first.

### 12.22 New tables introduced specifically for Hawks
(repeat from § 6 for completeness; these are the only structural additions)

```
accountModes
hawksRenkoCalibrations
hawksDailyBias
hawksStopAudit
hawksScenarioOnTrade
hawksMentorInsights
hawksLearningProgress
```

---

## 13. Seed Execution Plan

`★ Insight ─────────────────────────────────────`
Seeds are split into "global admin seeds" (assets, timeframes, conditions, indicators, scenarios, mentor insights — shared by all users) vs "per-account seeds" (strategies, tags, checklists, monthly plan, risk profile — copied into the user's account when Hawk's Mode toggles on). This separation matters because admin seeds run once at deploy; per-account seeds run per opt-in.
`─────────────────────────────────────────────────`

### 13.1 Global admin seed — runs once at deploy
File: `src/db/seeds/hawks-global-seed.ts`
1. Insert/upsert `assetTypes` `future` (idempotent).
2. Insert/upsert WIN, WDO, IND, DOL into `assets`.
3. Insert/upsert all Renko + time_based timeframes.
4. Insert/upsert `tradingConditions` (admin-owned `userId = NULL` or system user).
5. Insert/upsert `indicatorGroups` `Hawks Core` + `indicatorDefinitions`.
6. Insert/upsert `riskManagementProfiles` `Hawks — Capital ÷ 20`.
7. Bulk-import `hawksMentorInsights` from vault sync (one-shot import from `/Users/ygorbravim/vault/study/hawks/pedro-insights/`).

### 13.2 Per-account seed — runs on Hawk's Mode opt-in
File: `src/lib/hawks/activate-mode.ts`
1. Upsert `accountModes` row → `hawks`.
2. Clone strategy `Hawks — Triple Screen Renko` into the user's account (or link FK if strategies are user-scoped).
3. Link tier conditions via `strategyConditions`.
4. Seed all 24 scenario rows + empty image slots.
5. Clone mistake/setup/general Hawks tags into user's `tags` table.
6. Seed `dailyChecklists` (Pre-Market / Post-Market / Monday Recalibration).
7. Insert/update active `monthlyPlans` row with locked Hawks values (preserve previous as `archivedJSON` so toggle off restores).
8. Link `riskManagementProfiles.id` of the global Hawks profile to the monthly plan.
9. Auto-link Hawks-tagged `timeframes` via `accountTimeframes`.
10. Apply WIN/WDO defaults to `dailyAssetSettings` / `accountAssetSettings`.
11. Seed `filterPresets` (the 8 in § 12.13).
12. Set `userSettings` Hawks-specific keys.

### 13.3 Per-account de-seed — runs on toggle off
- Mark `accountModes.hawks` deactivated (don't delete row → preserves audit trail).
- Restore archived `monthlyPlans` snapshot.
- Unlink Hawks risk profile from monthly plan.
- Strategies, tags, scenarios, checklists, presets remain (user might still want them).
- Filter presets and learning progress remain.
- `hawksDailyBias`, `hawksStopAudit`, `hawksScenarioOnTrade`, `hawksRenkoCalibrations` remain (historical record).

---

## 14. Surface-by-Surface Acceptance Checklist (post-seed)

After seed runs, every existing Axion surface should already work in Hawks-flavored form without further code:

| Surface | Verifies |
|---|---|
| Settings → Strategies | "Hawks — Triple Screen Renko" listed, has 24 scenarios, has tiered conditions |
| Settings → Tags | All `hawks-*` tags listed across setup/mistake/general |
| Settings → Conditions | All Hawks conditions across 4 categories |
| Settings → Timeframes | Renko 5/11/13/23/45/88/123 R rows present |
| Settings → Assets | WIN, WDO, IND, DOL present with correct tick |
| Settings → Risk Profiles | "Hawks — Capital ÷ 20" listed |
| Settings → Indicators | Hawks Core indicator group with all definitions |
| Command Center → Checklist | Hawks Pre-Market / Post-Market / Monday checklists selectable |
| Command Center → Bias | 5-question viés ritual present |
| Journal → New Trade | Strategy dropdown defaults to Hawks; tier conditions show; Hawks tags filter; scenario picker; wave/pullback/confluence/MMA fields |
| Playbook | Hawks strategy fully populated; 24 scenarios visible |
| Analytics → Filters | Hawks filter presets in dropdown |
| Backtest | Hawks presets available in entry dropdown |
| Monte Carlo | Hawks parameter preset selectable |
| Monthly Plan | Locked Hawks fields visible with locked-icon badge |

---

*Document compiled 2026-05-03. Next step: review with user, prioritize phases, then write a per-phase implementation plan via the writing-plans skill. Total token-bearing surfaces touched: 22 existing + 7 new tables + 5 new UI surfaces.*
