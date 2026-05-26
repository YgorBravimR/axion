# Axion Q2 2026 — Plan to June 30

> **Master plan for the 5-week path from W1 usability audit to Q2 closeout.**
> Source of truth for arc + weekly intent is [`arc.md`](../../ygorBravimR/arc.md) (Bastion). This doc decomposes the **how** for the Axion arc only.
> Last updated: 2026-05-23.

---

## 1. North star

**Q2 outcome (by June 30):** Plan → execution path is OBVIOUS to a daily user (Ygor) by June 1. The code works — **usability is the blocker**. Friction points are unknown until walked.

**Why it gates everything:** Hawks mentorship + live trading begin **June 1**. The Trading arc's daily loop runs _through_ Axion (pre-market → live log → post-market autopsy). If Axion isn't usable June 1, the Trading arc starts cold and W2's "real-use feedback loop" can't form.

**Definition of "usable" for June 1:**

- A fresh user can walk Stages 0–4 of [`zero-to-hero.md`](zero-to-hero.md) without a dead-end that requires a code change to escape.
- The daily loop (Stage 4) completes end-to-end with no blocker-class friction.
- Stages 5–7 (weekly/monthly/yearly) can have known gaps — they don't run before W2.

---

## 2. Hard constraints

| Constraint                                          | Why                                                          | Consequence if broken                                     |
| --------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| **June 1 is fixed.**                                | Hawks + live trading both anchor here.                       | Re-aim Trading arc, not Axion arc.                        |
| **2h work cap per Bravo block + 45-min wind-down.** | Wellbeing arc is foundation. Breach degrades all other arcs. | Sunday review treats it as most important miss.           |
| **Axion work _only_ in Bravo block (21:15–00:00).** | Trading Study, Live Trading, Baerskin blocks are protected.  | Scope cut, never bleed.                                   |
| **W1: NO code changes unless trivial.**             | Fixing while auditing kills the map.                         | If a friction tempts a fix mid-walk: capture and move on. |
| **PR target `main` auto-deploys.**                  | No staging.                                                  | Confidence gate (CLAUDE.md rule 9) before every commit.   |

### "Trivial fix" bar (W1 only)

Allowed during the audit _only_ if all three are true:

1. The friction blocks completing the current Zero-to-Hero stage walkthrough (i.e., can't move on without it).
2. The fix is ≤15 min including verification.
3. It does not touch a protected path (`db/schema.ts`, `db/migrations/`, `auth-utils.ts`, `tax/recompute-month.ts`, `crypto.ts`).

Anything else: capture, defer to W2 ranking.

---

## 3. Time budget

| Period                 | Available evenings      | Hours | Cumulative |
| ---------------------- | ----------------------- | ----- | ---------- |
| **W1** May 25–31       | 5 weekdays + Sun review | ~11h  | 11h        |
| **W2** Jun 1–7         | 5 weekdays + Sun review | ~11h  | 22h        |
| **W3** Jun 8–14        | 5 weekdays + Sun review | ~11h  | 33h        |
| **W4** Jun 15–21       | 5 weekdays + Sun review | ~11h  | 44h        |
| **W5** Jun 22–28       | 5 weekdays + Sun review | ~11h  | 55h        |
| **Closeout** Jun 29–30 | 2 evenings              | ~4h   | 59h        |

**Total Axion budget May 25 → Jun 30: ~55–60h.**

Saturdays are 20% buffer (no Axion work). Sunday = `/week-review` ritual + light polish if energy allows.

---

## 4. Week-by-week

### W1 — May 25–31 · Usability audit

**Mission:** Walk Stages 0–4 of [`zero-to-hero.md`](zero-to-hero.md) as a fresh user. Capture every friction point. Rank top 3 for W2.

**Done means:**

- Every friction encountered during the walk is **filed as an in-app bug report** (Axion's Bug Report Capture surface). This is the canonical record — the markdown doc points at it, doesn't duplicate it.
- [`day-in-the-life-with-axion.md`](day-in-the-life-with-axion.md) filled end-to-end (Stages 0–4): pre-walk hypotheses, post-walk summaries, bug-report tallies, themes section.
- Top 3 fixes for W2 compiled Sat May 30 by **querying the bug-reports DB** (filter: filed during W1, status open), then ranked per §6.
- Sunday May 31 `/week-review` entry written.

**Evening schedule (one stage per night):**
| Date | Stage | Surfaces touched |
|---|---|---|
| Mon May 25 | **Stage 0** Welcome + **Stage 1** Foundation (start) | Register, verify, login, account select, Settings (accounts, assets, timeframes) |
| Tue May 26 | **Stage 1** Foundation (finish) | Settings (tags, conditions, risk profiles, fees), Playbook (build 1 strategy) |
| Wed May 27 | **Stage 2** Top-Down Planning | `/plan/[year]`, `/plan/[year]/[quarter]`, `/plan/[year]/[quarter]/[month]` |
| Thu May 28 | **Stage 3** Pressure-Test | Backtest, Backtest Optimizer, Monte Carlo (v1+v2), Risk Simulation, Equity Shield |
| Fri May 29 | **Stage 4** Daily Loop (full simulation) | Command Center pre/live/post + Journal entry + autopsy |
| Sat May 30 | Buffer / compile top 3 | (no Axion work — buffer; light compile if energy) |
| Sun May 31 | `/week-review` + lock W2 ship list | — |

**NOT this week:**

- No refactor "while I'm in there".
- No "let me also redesign X" scope expansion.
- No fix outside the trivial-fix bar.

---

### W2 — Jun 1–7 · Ship top 3 + live trading begins

**Mission:** Ship the W1 top-3 fixes via the **`/fix-bugs` skill**, which ingests open bug reports (DB + Sentry) the W1 audit produced. Begin live trading (paper → live). Capture new friction encountered in **real daily use** as fresh in-app bug reports — this is the W3 input.

**Hard coupling:** June 1 is also the first live trading day. Axion is now in real production use, not simulated. New friction will surface that the W1 audit couldn't anticipate (latency, mid-session interruptions, post-fill rush, etc.). File these as bug reports the same day they're encountered — don't batch; context decays fast.

**Done means:**

- `/fix-bugs` skill run on Mon Jun 1 against the W1 bug-report harvest. The top 3 from §6 ranking are the work for the week.
- 3 fixes shipped (PR → `main` → deployed → smoke-tested in a real session).
- Each shipped fix closes its source bug report and has a post-mortem if it's a true bug fix (per CLAUDE.md rule 3).
- New W2 real-use bug reports filed as encountered (Daily-after-session check in audit doc §6).
- Sun Jun 7 `/week-review` written.

**Time allocation:**

- 3 fixes × ~3h each (incl. PR, smoke, deploy) = ~9h.
- ~2h slack for unexpected blockers + live-use friction capture.
- If a fix balloons past 3h: stop, re-scope, move the overflow to W3.

**Branch / PR discipline:**

- One branch per fix. Conventional commits. Lint green. PR uses [`pr-template.md`](pr-template.md).
- Husky pre-commit must pass; never `--no-verify`.

---

### W3 — Jun 8–14 · Ship next 3 (from real-use feedback)

**Mission:** Ship the next 3 friction fixes — now informed by **one week of real live trading use**, not just audit walk-through.

**Selection rule:** Pick from the W2 real-use friction log first. Fall back to the W1 audit list if real use surfaced fewer than 3 new high-severity items.

**Done means:**

- 3 more fixes shipped.
- Cumulative 6 frictions resolved by end of W3.
- Backlog updated: any audit items not picked yet either re-prioritized or moved to W4/W5.

---

### W4 — Jun 15–21 · Ship next 3 (path should feel smooth)

**Mission:** Ship the next 3. By now, the daily path should feel smooth — high-severity items should be exhausted.

**Selection rule:** If the audit + W2 real-use lists are exhausted, source W4 picks from `docs/backlog.md` P1 INVEST list (manifesto §4):

- Journal `trade_conditions` junction (P1 #2)
- Journal `window.confirm` migration (P1 #4) — already a CLAUDE.md rule 8 enforcement
- Backtest visual layer redesign (P1 #6) — _only if S effort; defer the full L version_
- Backtest engineVersion UI badge (P1 #76)
- Plan-vs-actual on yearly page (backlog #18)

**Done means:**

- 3 more fixes shipped. Cumulative 9.
- Self-check: "Does the Stage 4 daily loop feel smooth?" If yes → W5 is polish. If no → W5 is the last-3 ship list, polish defers to Q3.

---

### W5 — Jun 22–28 · Polish + edge cases + Q3 readiness

**Mission:** Polish. Edge cases. Q3 readiness check. **Do not start new strategic work.**

**Allowed work:**

- Bug fixes from Sentry / bug-report submissions.
- Cosmetic friction (the "minor" tier from the audit).
- Edge cases discovered in W2–W4 use (empty states, error paths, slow networks).
- Documentation: update [`features.md`](features.md), [`zero-to-hero.md`](zero-to-hero.md), and [`backlog.md`](backlog.md) to reflect what shipped in W2–W4.

**NOT allowed:**

- New feature work (defer to Q3 plan).
- Refactors that don't have a shipped-feature justification.
- Methodology-axis investment (Hawks playbook depth, mode-personalization framework). That's Q3's strategic question.

**Done means:**

- Stage 4 daily loop is smooth in real use (Ygor can articulate it without consulting docs).
- All top-tier friction from W1 + W2 use shipped.
- Q3 direction memo drafted (one page in `docs/` — what's the next quarterly arc?).

---

### Closeout — Jun 29–30 · Q2 arc evaluation

**Mission:** Evaluate the Q2 Axion arc against the June 30 success signal. Decide Q3 direction.

**Done means:**

- Q2 retrospective written (in `arc.md` History section per its convention).
- Q3 direction locked (or explicitly deferred to first Monday of Q3 `/week-plan`).
- All W1–W5 docs cross-referenced and consistent with shipped state.

---

## 5. Pre-identified frictions (do NOT re-discover during W1 audit)

These are _already known_. The audit's job is to find what these miss, not to repeat them. If the audit surfaces one of these as a top-3 candidate, it's a duplicate hit — move on.

From [`feature-manifesto-2026-05.md`](feature-manifesto-2026-05.md) §6 and [`backlog.md`](backlog.md):

| Friction                                                 | Source                                    | Status    |
| -------------------------------------------------------- | ----------------------------------------- | --------- |
| Journal `trade_conditions` junction missing              | Manifesto INVEST list, backlog P1 #2      | Pre-known |
| Native `window.confirm` on `/journal/[id]`               | CLAUDE.md rule 8 violation, backlog P1 #4 | Pre-known |
| Backtest visual layer (canvas redesign)                  | Manifesto INVEST, backlog P1 #6           | Pre-known |
| Backtest engineVersion UI badge missing                  | Backlog P1 #76                            | Pre-known |
| Backtest tick-level fidelity                             | Backlog P1 #77                            | Pre-known |
| Plan-vs-actual on yearly page                            | Backlog #18                               | Pre-known |
| `/monitor` and `/painel` orphan routes                   | Manifesto DEPRECATE, backlog              | Pre-known |
| `/analytics/account-comparison` → Analytics filter       | Manifesto MERGE                           | Pre-known |
| `/monthly` → Reports "Month Closing" affordance          | Manifesto MERGE                           | Pre-known |
| Replay account mode deprecation                          | Backlog P1 #73                            | Pre-known |
| Monte Carlo v1/v2 → Edge/Capital Expectancy rename       | Backlog #75                               | Pre-known |
| `ScrollArea` in 2 remaining modals (React 19 crash risk) | Backlog P2 (frontend post-mortem)         | Pre-known |

**Implication:** The audit should ask _"what surprised me about the experience that isn't on this list?"_ — those are the W2 ship candidates.

---

## 6. Decision rules

### When to capture vs fix mid-audit

| Situation                                                            | Action                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Friction blocks current stage AND ≤15 min fix AND not protected path | Fix, file bug report titled "fixed inline" linking to the commit. Move on.                                                |
| Friction blocks current stage AND >15 min fix                        | File bug report (severity Blocker). Document workaround in audit doc summary; skip stage if no workaround; pick up in W2. |
| Friction is annoying but stage completes                             | File bug report (Major / Minor / Cosmetic per scale). Move on.                                                            |
| Friction is on the pre-known list (§5)                               | Do NOT file a duplicate bug report. Tally in the stage summary as "1 pre-known duplicate hit" and move on.                |

**Why bug reports, not a parallel markdown log:** The `/fix-bugs` skill (W2's ship tool) ingests from the bug-report DB + Sentry. Filing during the audit makes W2's compile step a database query, not a markdown re-read. The audit doc keeps only walk-level findings (hypotheses, summaries, themes) that don't fit a per-bug card.

### Re-aim trigger (escalation)

If the W1 audit reveals that the Stage 4 daily loop is **structurally broken** (i.e., a fresh user cannot complete it without a code change >M effort), escalate:

- Option A: Delay live trading start (Trading arc adjustment, not Axion).
- Option B: Define "minimum viable path" for June 1 — a degraded daily loop that works for Hawks only, full polish in W2.
- Decision goes in `arc.md` History entry for Sun May 31.

### Top-3 ranking rule (Sat May 30)

Query the bug-reports table — filter: filed during W1, status open. Rank by impact on the **daily loop** (Stage 4), since that's what June 1 needs:

1. **Blocker on daily loop?** → top priority regardless of effort.
2. **Major friction on pre/post-market routine?** → secondary.
3. **Cosmetic / minor?** → defer to W5.

Tie-break by effort: lower effort wins (compounds W2's velocity). Feed the ranked top-3 bug-report IDs into `/fix-bugs` on Mon Jun 1.

---

## 7. Risks & contingencies

| Risk                                                                | Probability | Mitigation                                                                                                                 |
| ------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Audit reveals >3 blockers, can't ship all by June 1                 | Medium      | Re-aim trigger (see §6). Choose Option B (minimum viable path).                                                            |
| Live trading in W2 surfaces a P0 bug not seen in audit              | Medium-high | W2 has 2h slack budget. If P0 exceeds slack, defer one of the top-3 fixes to W3.                                           |
| Wellbeing slips (sleep <7h, posture skipped)                        | Medium      | Sunday review treats as #1 miss. Reduce Axion scope before reducing sleep.                                                 |
| W2 ship-velocity off (one fix balloons past 3h)                     | High        | 3h hard cap per fix; overflow → W3. Don't spiral.                                                                          |
| `main` auto-deploy breaks production mid-week                       | Low-medium  | CLAUDE.md confidence gate before every commit. Lint:strict green. Smoke-test in a real session before closing the evening. |
| Hawks live trading reveals Axion is the bottleneck (not vice versa) | Low         | Trading arc owns this. Axion stays scoped to its arc.                                                                      |

---

## 8. Cadence template (every Bravo block)

**21:15** — Open Axion in a fresh-state browser context (logged-out incognito if doing onboarding stages). Open [`day-in-the-life-with-axion.md`](day-in-the-life-with-axion.md) in editor.

**21:15–23:15 (2h work cap):**

1. Open the night's target stage in zero-to-hero.md.
2. Execute the stage _as written_, in order.
3. When friction appears: stop walking, write the friction entry (format in audit doc §2). Resume walk.
4. If trivial-fix bar met (§2): fix, note "fixed inline" in log. Resume.
5. At 22:30 or stage-complete (whichever first): summarize the evening in 2 sentences at top of stage section.

**23:15–00:00 (wind-down):**

- Screen off.
- Posture micro-routine (`arc.md` §Posture micro-routine — 5 min).
- Lay out tomorrow's clothes.
- Optional: 1-line journal entry on what surprised most.

**Sunday `/week-review`** (Bravo block, 21:00–22:00):

- Read the week's friction entries.
- Compile top-3 (W1) or assess shipped state (W2–W5).
- Update `arc.md` History.
- Lock next week's intent.

---

## 9. Cross-references

- **Arc + weekly intent (canonical):** [`arc.md`](../../ygorBravimR/arc.md)
- **Product positioning + design principles:** [`PRODUCT.md`](../PRODUCT.md), [`DESIGN.md`](DESIGN.md)
- **Canonical user journey (audit spec):** [`zero-to-hero.md`](zero-to-hero.md)
- **Feature surface + verdicts:** [`feature-manifesto-2026-05.md`](feature-manifesto-2026-05.md), [`features.md`](features.md)
- **Pre-known friction:** [`backlog.md`](backlog.md), [`ideas.md`](ideas.md)
- **Recurring gotchas (read mid-task when symptoms match):** [`gotchas.md`](gotchas.md)
- **Past bug post-mortems:** [`postMorten/`](postMorten/)
- **W1 audit deliverable:** [`day-in-the-life-with-axion.md`](day-in-the-life-with-axion.md) ← lives next to this file

---

## 10. Operating reminders

- **One intent per week.** Not three. Axion's W1 intent is "audit". That's it.
- **Capture, don't repair.** W1 invariant.
- **Wellbeing is foundation.** If the 2h cap collides with a "just 30 more minutes" temptation: cap wins.
- **Saying "I don't know" is preferred** over a confident-wrong commit to `main` (CLAUDE.md rule 9).
- **`main` auto-deploys.** There is no second chance. Smoke-test in a real session before closing the evening.
