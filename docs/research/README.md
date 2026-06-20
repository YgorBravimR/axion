# Axion Research Library

Three research bodies, organized by subject. Each subfolder is self-contained and has its own README.

## 01 — Market Structure

[`01-market-structure/`](./01-market-structure/) — how price-discovery actually works.

- **Auction Market Theory** (Steidlmayer / Market Profile) — value vs price, balance vs imbalance, the TPO framework.
- **Order Flow Theory** — tape reading, DOM, footprint, absorption, exhaustion.
- **Smart Money Concept (SMC)** — ICT-style structural concepts (BOS, CHoCH, liquidity sweeps).

**Read this when**: designing a new setup, validating an existing one, or trying to understand _why_ a price level matters.

---

## 02 — Money Management

[`02-money-management/`](./02-money-management/) — position sizing, risk rules, drawdown survival.

Strategy flowcharts (one per system):

- **Fixed Fractional** — % of equity per trade. Conservative baseline.
- **Fixed Ratio** — Ryan Jones method, R$Δ per +1 contract.
- **Kelly Fractional** — math-optimal sizing, fractional Kelly to survive variance.
- **R-Multiples** — Van Tharp normalization, decoupling sizing from instrument.
- **Institutional** — pro-desk style with caps, drawdown gates.
- **TSR Iniciante** — beginner-safe Brazilian-context (low risk).
  - `tsr-iniciante-win-adaptation.md` — WIN-specific tuning.
  - `tsr-rules-reference.md` — quick reference card.

Supporting:

- **`risk-management-flowchart.md`** — master decision tree.
- **`risk-management-simulation.md`** — Monte Carlo engine comparing all strategies.
- **`yearly-plan-profiles.md`** — preset definitions (Bravo, etc.).
- **`decreasing-aggression-debate.md`** — when to step down vs hold.
- **`conversation.md`** — design-conversation history.

**Read this when**: building the risk-plan editor, sizing a new account, debating step-up/step-down logic, or modeling drawdown survivability.

---

## 03 — Trader Psychology

[`03-trader-psychology/`](./03-trader-psychology/) — mindset, emotion regulation, decision quality.

Produced 2026-06-19/20 from a 20-book deep read + adversarial-verified deep research:

- **`00-mastersheet.md`** — synthesis of 20 books (Douglas, Tendler, Elder, Taleb, Mlodinow, Dweck, Goleman, Housel, Ariely, Dobelli, Gladwell, Ducasse, Andrew Smith, Bob Johnson, et al.). Per-book summaries, convergent thesis, divergences, frameworks, drills inventory.
- **`01-deep-research.md`** — peer-reviewed audit (2015–2026). 108 sub-agents, 86 claims extracted, only 3 of 25 survived adversarial verification. What the canon got right, what it got wrong, what it missed.
- **`02-relevance-for-brazilian-trader.md`** — distilled for WIN/WDO discretionary day trading. 8 operational pillars + Monday-morning protocol. References Chague & Giovannetti (FGV 2017) on the 97% Brazilian retail attrition rate.

**Read this when**: working on the journal-enrich UI, designing nudges, debugging your own tilt patterns, or trying to decide whether to read the 21st mindset book (you shouldn't — install the protocols from `02` instead).

---

## How these three relate

```
                  Market Structure (01)
                  "Where edge LIVES"
                          |
                          v
  Money Management (02) ←———→ Trader Psychology (03)
  "How to SURVIVE          "How to EXECUTE
   variance"                cleanly"
```

- **Market structure** without money management = blown account.
- **Money management** without psychology = good rules ignored under stress.
- **Psychology** without market structure = disciplined gambling.

All three are necessary. None is sufficient. The Axion thesis is that **the platform itself becomes the integration layer** — risk rules enforced in software, journal capturing emotional state, market-structure logic in the engine.

---

## Conventions

- Files use kebab-case `.md`.
- Cross-references inside a subfolder use bare relative paths (`./foo.md`).
- Cross-references between subfolders go through `../02-money-management/foo.md`.
- External code references this folder as `docs/research/<subject>/<file>.md`.
- New research goes into the right subfolder; if it doesn't fit, propose a `04-*` subfolder.
