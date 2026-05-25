# Day in the Life with Axion — W1 Usability Audit

> **W1 (May 25–31) deliverable.** Walk Stages 0–4 of [`zero-to-hero.md`](zero-to-hero.md) as a fresh user, following the **Hawks methodology** (the running example in zero-to-hero). File friction as **in-app bug reports**. Compile top 3 for W2 via the `/fix-bugs` skill flow.
> Master plan: [`q2-axion-plan.md`](q2-axion-plan.md).
> Started: 2026-05-25 · Last updated: 2026-05-23 (scaffold).

---

## 1. Audit posture

- **Fresh-user lens.** Pretend you've never seen Axion before. Where the UI assumes prior knowledge, that's friction.
- **Zero-to-Hero is the spec, Hawks is the running example.** Deviation from the canonical Hawks-anchored path _is_ the finding.
- **Capture, don't repair.** Fixing mid-walk kills the map (master plan §6). Trivial-fix bar applies only if ≤15 min AND blocks stage completion AND non-protected path.
- **No re-discovery.** Pre-known friction (master plan §5) is the "already on the list" set. Tally these as duplicates in the stage summary — do not file duplicate bug reports.

---

## 2. Capture flow

**Primary record: in-app Bug Report Capture.** Axion's Bug Report surface is the canonical record. File one report per friction. The `/fix-bugs` skill ingests from this DB + Sentry in W2.

**Bug report content** (filled in the in-app form):

- **Title** — short, one-line, scannable.
- **Page / surface** — auto-captured by the form when possible.
- **Severity** — Blocker | Major | Minor | Cosmetic.
- **Description**:
  - _What I tried_: exact action.
  - _Expected_: what should happen per Zero-to-Hero or general intuition.
  - _Got_: what actually happened.
  - _Fix shape_: one-line hypothesis.
  - _Effort estimate_: XS | S | M | L.
  - _Protected path?_ Yes / No.
- **Screenshot** — attach when visual or stateful.

**Severity scale:**

- **Blocker** — cannot complete the stage without a code change.
- **Major** — completes the stage but with significant workaround or confusion (>2 min lost).
- **Minor** — completes naturally but feels wrong / requires a double-take.
- **Cosmetic** — visual or copy nit that doesn't affect flow.

**Effort estimate** (matches [`backlog.md`](backlog.md) convention): **XS** <1h · **S** half-day · **M** 1–2 days · **L** multi-day · **XL** multi-sprint.

**This markdown doc captures only what bug reports can't:**

- **Pre-walk hypothesis** — naive expectations before opening the app. Useful as a "did the product surprise me?" anchor.
- **Post-walk summary** — 2 sentences on how the stage felt as a whole.
- **Bug-report tally per stage** — count + 1-line titles for cross-referencing. Not a parallel record.
- **Themes** — patterns that span multiple bug reports.

---

## 3. Walkthrough log

> One stage per evening (master plan §4, W1 schedule). Fill the **Pre-walk hypothesis** before opening the app. Fill **Post-walk summary** in the last 5 min of the block.
>
> Hypotheses below are **seeded with my first-pass guesses** as a sparring partner — they are opinionated and sometimes wrong on purpose. Overwrite or annotate with your own; disagreement is the value.

---

### Stage 0 — Welcome · target Mon May 25 (~30 min within the evening)

**Surfaces:** `/register`, email verification, `/login`, `/select-account`.

**Pre-walk hypothesis** (seeded):

- _What does a brand-new user do in the first 5 min?_ Register → check inbox → click verify → log in → land on `/select-account` → pick a default account → Dashboard with empty states.
- _Riskiest step?_ **Email verification.** A slow / spam-foldered / wrong-shaped link strands the user before they ever see Axion. Second-riskiest: `/select-account` if no default account is auto-created — empty selector = dead end.
- _What would a fresh user expect that we likely don't deliver?_ A "Skip — set this up later" affordance on every empty form. If we force "Add at least one account before continuing", that's friction worth measuring.

**Bug reports filed** (count + 1-line titles):

- _(empty — append as filed)_

**Post-walk summary** (≤2 sentences):
_TBD_

---

### Stage 1 — Foundation Week · target Mon May 25 (start) + Tue May 26 (finish)

**Surfaces:** Settings (Accounts · Assets · Timeframes · Tags · Conditions · Risk Profiles · Fee Rates · Profile) → Playbook → New Strategy named **Hawks**.

**Pre-walk hypothesis** (seeded):

- _Time-to-first-trade-loggable-state?_ Zero-to-Hero estimates 2–3h; my expectation is a median fresh user (without docs in hand) takes **4–5h or abandons**. Tag-list creation is the highest dropout risk — unbounded creative work with no clear "done" line.
- _Most likely dead-end sub-page?_ **Conditions / Indicators.** The "reusable condition block" concept requires understanding the Playbook composition model first — which the user hasn't seen yet. Foundation-first ordering forces blind setup.
- _Hawks-specific risk?_ Defining Hawks mandatory vs optional conditions requires the curriculum spec in hand. If the spec isn't open in another tab, this stage stalls. Does Axion link out to / surface the Hawks curriculum from the Playbook form?

**Bug reports filed:**

- _(empty)_

**Post-walk summary:**
_TBD_

---

### Stage 2 — Top-Down Planning · target Wed May 27

**Surfaces:** `/plan/[year]`, `/plan/[year]/[quarter]`, `/plan/[year]/[quarter]/[month]`. Fractal Planning Suite — provenance badges, what-if calculator.

**Pre-walk hypothesis** (seeded):

- _Provenance model first-encounter readability?_ Provenance badges are a power-user feature — likely **invisible to a first-time user**. They become important on month #2 when overrides accumulate. The audit should flag if their existence is discoverable, not whether they're "perfect".
- _Cascade intuition?_ Hierarchy is sound; expected friction is in **"where do I click first?"** The year cockpit has many cells with no obvious entry point. Empty-state coaching may be missing.
- _Hawks-specific risk?_ Hawks is methodology-flavored at runtime but the Plan layer is methodology-agnostic (capital, R, calendar). Stage 2 should feel identical regardless of methodology — if it doesn't, that's a finding.

**Bug reports filed** _(pre-known: backlog #18 plan-vs-actual on yearly — tally as duplicates if encountered, don't file)_:

- _(empty)_

**Post-walk summary:**
_TBD_

---

### Stage 3 — Pressure-Test the Plan · target Thu May 28

**Surfaces:** `/backtest`, `/backtest/optimize`, `/monte-carlo`, `/risk-simulation`, `/equity-shield`.

**Pre-walk hypothesis** (seeded):

- _Chain obviousness ("Hawks playbook → backtest → MC → shield")?_ **Probably not obvious from the UI alone.** The four tools live on four separate routes with no narrative thread between them. The Zero-to-Hero doc supplies the thread; the UI doesn't.
- _Where does the chain break?_ At the **MC → Equity Shield handoff.** The "MC Calibration banner" is the only narrative bridge and is easy to miss. If it's below-fold or missing, the chain dies silently.
- _Hawks-specific risk?_ Does the `hawks_v0` preset load cleanly in Backtest? Does engine v0.2 produce results that match curriculum expectations? Does the engine-version provenance show anywhere on screen (P1 #76 says no — verify).

**Bug reports filed** _(pre-known: Backtest P1 #6/#76/#77, MC rename #75 — tally as duplicates)_:

- _(empty)_

**Post-walk summary:**
_TBD_

---

### Stage 4 — The Daily Loop · target Fri May 29 (the most important night)

**Surfaces:** Command Center (pre + live + post panels — **Hawks pre-flight switches, Hawks scorecard, B3 cap card**) · Journal (entry form + autopsy on `/journal/[id]` — **Hawks sidecar fields, Hawks compliance score**) · Position Calculator · Live Trading Status Panel · Asset Rules Panel · Circuit Breaker · Dashboard **Hawks coaching insights** card.

**Pre-walk hypothesis** (seeded):

- _End-to-end completable without docs?_ Expect **no.** The daily loop has the most cross-surface dependencies in the product (Command Center ↔ Journal ↔ Position Calculator ↔ Playbook compliance). The seams between these are where friction concentrates.
- _Worst transition?_ **Live → log.** Mid-session trade logging requires switching from Command Center to Journal/new and back — the single most-friction-prone moment in the product, especially under live-trading time pressure.
- _Hawks-specific risk #1?_ Does the **Hawks scorecard** refresh in real time as conditions are tagged on trades? If it lags or requires manual reload, the live "should I take this setup?" use case dies.
- _Hawks-specific risk #2?_ Does the journal entry form actually surface the **Hawks sidecar fields** for a trade tagged as Hawks? If they're behind an extra click or absent on `/journal/new`, the methodology layer leaks.
- _Hawks-specific risk #3?_ Does the **Hawks compliance score** on `/journal/[id]` render with a clear "X of Y mandatory met" breakdown, or is it a single opaque number? Opaque = useless.

**Bug reports filed** _(pre-known: Journal `trade_conditions` P1 #2, `window.confirm` P1 #4 — tally as duplicates)_:

- _(empty)_

**Critical question** (write the answer at end of evening):

> **Is the Hawks daily loop completable end-to-end by a fresh user with zero blocker-class friction?**
> Answer: TBD (Yes / No / Yes-with-workarounds)
> If No → escalate per master plan §6 "Re-aim trigger". Trading arc may need to delay June 1, or scope to "minimum viable Hawks path".

**Post-walk summary:**
_TBD_

---

## 4. Top 3 fixes for W2 — compiled Sat May 30

> Query the bug-reports DB Saturday morning. Filter: filed during W1, status open. Rank per master plan §6 (blocker-on-daily-loop > major-on-pre/post > minor/cosmetic; tie-break: lower effort wins). The ranked output feeds `/fix-bugs` on Mon Jun 1.

| Rank | Bug-report ID | Title | Severity | Effort | Daily-loop impact | Notes |
| ---- | ------------- | ----- | -------- | ------ | ----------------- | ----- |
| 1    | TBD           | TBD   | TBD      | TBD    | TBD               | TBD   |
| 2    | TBD           | TBD   | TBD      | TBD    | TBD               | TBD   |
| 3    | TBD           | TBD   | TBD      | TBD    | TBD               | TBD   |

**W2 plan** (lock by Sun May 31 evening review):

- Fix #1 — target ship day TBD, branch `fix/<slug>`.
- Fix #2 — target ship day TBD, branch `fix/<slug>`.
- Fix #3 — target ship day TBD, branch `fix/<slug>`.
- Slack budget: ~2h for unexpected live-trading-week interruption.
- `/fix-bugs` invocation: feed the 3 bug-report IDs to the skill on Mon Jun 1.

---

## 5. Surprises & themes — write Sun May 31

> The audit's second deliverable beyond the top-3 list. Surface-level patterns matter — a single repeated theme across 3 stages often beats one acute blocker.

- **Top theme:** TBD
- **Single biggest "almost made me quit" moment:** TBD
- **What the manifesto/backlog already-known list got right:** TBD
- **What the manifesto/backlog already-known list missed:** TBD
- **Hawks-specific seam quality** — are the Hawks-aware surfaces (pre-flight, scorecard, sidecar, coaching insights) a coherent system or a set of disconnected widgets? TBD
- **One-sentence brand-promise check** (PRODUCT.md "Precise. Confident. Elite." — does the audited experience deliver this?): TBD
- **Hypothesis hit-rate** — of the seeded pre-walk hypotheses, how many were right? Wrong hypotheses are gifts: they show where the product surprises (good or bad). TBD

---

## 6. W2 real-use friction — appended starting Jun 1

> After June 1, live Hawks trading is happening daily through Axion. Friction encountered in real use (not walk-through) is the W3 input. **Same flow as W1**: file as in-app bug report → `/fix-bugs` ingests during W3 ship planning.

**Daily-after-session check** (Jun 1–7, ~5 min post-session):

- Did any moment during today's live session cause a >5-second pause where you wished Axion did X? File the bug report **now** — don't batch, context decays fast.
- Did the Hawks scorecard agree with your gut on whether each setup qualified? If divergence, that's a bug report (calibration or UX).
- Did the Journal autopsy yield one written lesson? If "no, too tedious", that's a bug report on Journal flow.
- Did you skip filing any of the above because "I'll do it tomorrow"? That itself is the bug — file a meta-bug "post-session capture flow leaks".

_(empty — appended during W2)_
